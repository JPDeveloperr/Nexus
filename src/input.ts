export type Axis = { x: number; y: number };
export type Controls = {
  move: Axis;
  aim: Axis | null;
  pointer: Axis;
  mouseAim: boolean;
  attack: boolean;
  chargePressed: boolean;
  chargeHeld: boolean;
  chargeReleased: boolean;
  chargeCancelled: boolean;
  chargeReleaseDuration: number;
  chargeEvents: { type: "press" | "release" | "cancel"; duration: number }[];
  dodge: boolean;
  pause: boolean;
  confirm: boolean;
  back: boolean;
  navigate: number;
  source: "keyboard" | "gamepad";
  gamepad: number | null;
  pads: number;
  unsupported: number;
};
// Standard Gamepad mapping: Xbox X / PlayStation Square. Other actions are reserved, not implemented.
export const GAMEPAD_ACTIONS = {
  attack: 2,
  heavy: 3,
  dodge: 1,
  special: 5,
  ultimate: 7,
  interact: 1,
  pause: 9,
} as const;
const keyCodes: Record<string, string> = {
  w: "KeyW",
  a: "KeyA",
  s: "KeyS",
  d: "KeyD",
  j: "KeyJ",
  " ": "Space",
  escape: "Escape",
};
export function keyboardCode(event: Pick<KeyboardEvent, "code" | "key">) {
  return event.code || keyCodes[event.key.toLowerCase()] || event.key;
}
export function radialDeadzone(x: number, y: number, deadzone: number): Axis {
  x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
  y = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  const length = Math.hypot(x, y),
    threshold = Math.max(0.05, Math.min(0.4, deadzone));
  if (length <= threshold) return { x: 0, y: 0 };
  const magnitude = Math.min(1, (length - threshold) / (1 - threshold));
  return { x: (x / length) * magnitude, y: (y / length) * magnitude };
}
const emptyActions = () => ({
  attack: false,
  chargePressed: false,
  chargeReleased: false,
  chargeReleaseDuration: 0,
  dodge: false,
  pause: false,
  confirm: false,
  back: false,
  navigate: 0,
});
export class InputSystem {
  private keys = new Set<string>();
  private pending = emptyActions();
  private pointer = { x: 0, y: 0 };
  private mouseAim = false;
  private chargeWasHeld = false;
  private chargeOwner = "";
  private latest!: Controls;
  private nativeChargeEvents: Controls["chargeEvents"] = [];
  private chargeQueue: Controls["chargeEvents"] = [];
  private queued = { ...emptyActions(), chargeCancelled: false };
  private downAt: number | null = null;
  private keyboardDownAt: number | null = null;
  private pollTimer: ReturnType<typeof setInterval>;
  private source: "keyboard" | "gamepad" = "keyboard";
  private previous = new Map<
    number,
    { buttons: boolean[]; move: Axis; aim: Axis; nav: number }
  >();
  private active: number | null = null;
  private selected: number | null = null;
  deadzone = 0.18;
  constructor(
    private canvas: HTMLCanvasElement,
    private playing: () => boolean,
  ) {
    this.pollTimer = setInterval(() => this.poll(), 1000 / 120);
    canvas.tabIndex = 0;
    try {
      this.setDeadzone(Number(localStorage.getItem("nexus.deadzone") || 0.18));
    } catch {
      /* storage is optional */
    }
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", () => this.reset());
    window.addEventListener("gamepaddisconnected", (event) => {
      this.previous.delete(event.gamepad.index);
      if (this.active === event.gamepad.index) this.active = null;
    });
    canvas.addEventListener("pointermove", (event) => {
      this.pointer = {
        x: (event.clientX / innerWidth) * 2 - 1,
        y: (-event.clientY / innerHeight) * 2 + 1,
      };
      this.mouseAim = true;
      this.source = "keyboard";
    });
    canvas.addEventListener("pointerdown", (event) => {
      canvas.focus({ preventScroll: true });
      this.source = "keyboard";
      if (event.button === 0) this.pending.attack = true;
    });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }
  private keyDown = (event: KeyboardEvent) => {
    const code = keyboardCode(event);
    if (
      !this.playing() &&
      (event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement)
    )
      return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyJ",
        "Escape",
        "Space",
        "ArrowUp",
        "ArrowDown",
      ].includes(code) &&
      this.playing()
    )
      event.preventDefault();
    this.keys.add(code);
    if (
      ["KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "Space", "Escape"].includes(code)
    ) {
      this.source = "keyboard";
      if (code !== "KeyJ") this.mouseAim = false;
    }
    if (!event.repeat) {
      if (code === "KeyJ") {
        this.pending.chargePressed = true;
        this.keyboardDownAt = performance.now();
        this.nativeChargeEvents.push({ type: "press", duration: 0 });
      }
      if (code === "Space") this.pending.dodge = true;
      if (code === "Escape") this.pending.pause = true;
    }
  };
  private keyUp = (event: KeyboardEvent) => {
    const code = keyboardCode(event);
    const wasHeld = this.keys.has(code);
    this.keys.delete(code);
    if (code === "KeyJ" && wasHeld && this.source === "keyboard") {
      this.pending.chargeReleased = true;
      this.pending.chargeReleaseDuration =
        this.keyboardDownAt === null
          ? 0
          : (performance.now() - this.keyboardDownAt) / 1000;
      this.nativeChargeEvents.push({
        type: "release",
        duration: this.pending.chargeReleaseDuration,
      });
    }
  };
  setDeadzone(value: number) {
    this.deadzone = Number.isFinite(value)
      ? Math.max(0.05, Math.min(0.4, value))
      : 0.18;
  }
  saveDeadzone(value: number) {
    this.setDeadzone(value);
    try {
      localStorage.setItem("nexus.deadzone", String(this.deadzone));
    } catch {}
  }
  selectGamepad(index: number | null) {
    this.selected = index;
    this.active = index;
  }
  available(): Gamepad[] {
    try {
      return Array.from(navigator.getGamepads?.() || []).filter(
        (p): p is Gamepad => p !== null && p.connected,
      );
    } catch {
      return [];
    }
  }
  requestBasic() {
    this.pending.attack = true;
  }
  requestDodge() {
    this.pending.dodge = true;
  }
  clearAim() {
    this.mouseAim = false;
  }
  reset() {
    this.keys.clear();
    this.nativeChargeEvents = [];
    this.chargeQueue = [];
    this.queued = { ...emptyActions(), chargeCancelled: false };
    this.downAt = null;
    this.keyboardDownAt = null;
    this.pending =
      emptyActions(); /* Keep button history: holding a button across a menu cannot trigger again. */
  }
  private sample(): Controls {
    const pads = this.available(),
      supported = pads.filter(
        (p) =>
          p.mapping === "standard" &&
          p.axes.length >= 2 &&
          p.buttons.length >= 10,
      );
    for (const index of this.previous.keys())
      if (!pads.some((p) => p.index === index)) this.previous.delete(index);
    if (
      this.selected !== null &&
      !supported.some((p) => p.index === this.selected)
    )
      this.selected = null;
    if (!supported.some((p) => p.index === this.active))
      this.active = supported[0]?.index ?? null;
    if (this.active === null && this.source === "gamepad")
      this.source = "keyboard";
    const states = supported.map((p) => {
      const move = radialDeadzone(p.axes[0], p.axes[1], this.deadzone),
        aim = radialDeadzone(p.axes[2] || 0, p.axes[3] || 0, this.deadzone);
      const buttons = Array.from(p.buttons, (b) =>
        Boolean(b.pressed || b.value > 0.5),
      );
      const nav = buttons[12]
        ? -1
        : buttons[13]
          ? 1
          : move.y < -0.55
            ? -1
            : move.y > 0.55
              ? 1
              : 0;
      const prev = this.previous.get(p.index);
      const rising = (i: number) => Boolean(buttons[i] && !prev?.buttons[i]);
      const changed =
        buttons.some((b, i) => b && !prev?.buttons[i]) ||
        Math.hypot(move.x - (prev?.move.x || 0), move.y - (prev?.move.y || 0)) >
          0.05 ||
        Math.hypot(aim.x - (prev?.aim.x || 0), aim.y - (prev?.aim.y || 0)) >
          0.05;
      // Only meaningful activity switches sources. A held stick cannot reclaim keyboard input every frame.
      const activity =
        changed &&
        (Math.hypot(move.x, move.y) > 0.05 ||
          Math.hypot(aim.x, aim.y) > 0.05 ||
          buttons.some(Boolean));
      if (activity && (this.selected === null || this.selected === p.index)) {
        this.active = p.index;
        this.source = "gamepad";
        this.mouseAim = false;
      }
      return {
        p,
        move,
        aim,
        buttons,
        nav,
        rising,
        previousNav: prev?.nav || 0,
      };
    });
    const active = states.find((s) => s.p.index === this.active);
    let move = {
      x: Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
      y: Number(this.keys.has("KeyS")) - Number(this.keys.has("KeyW")),
    };
    const length = Math.hypot(move.x, move.y);
    if (length > 1) {
      move.x /= length;
      move.y /= length;
    }
    let chargeHeld = this.keys.has("KeyJ");
    let owner = "keyboard";
    let aim: Axis | null = null;
    const actions = { ...this.pending };
    if (active && this.source === "gamepad") {
      move = active.move;
      aim = Math.hypot(active.aim.x, active.aim.y) > 0 ? active.aim : null;
      actions.attack ||= active.rising(GAMEPAD_ACTIONS.attack);
      chargeHeld = Boolean(active.buttons[GAMEPAD_ACTIONS.heavy]);
      owner = "gamepad:" + active.p.index;
      actions.chargePressed ||= active.rising(GAMEPAD_ACTIONS.heavy);
      actions.chargeReleased ||=
        !chargeHeld &&
        Boolean(
          this.previous.get(active.p.index)?.buttons[GAMEPAD_ACTIONS.heavy],
        );
      actions.dodge ||= active.rising(GAMEPAD_ACTIONS.dodge);
      actions.pause ||= active.rising(GAMEPAD_ACTIONS.pause);
      actions.confirm ||= active.rising(0);
      actions.back ||= active.rising(1);
      actions.navigate = active.nav !== active.previousNav ? active.nav : 0;
    }
    for (const state of states)
      this.previous.set(state.p.index, {
        buttons: state.buttons,
        move: state.move,
        aim: state.aim,
        nav: state.nav,
      });
    const chargeCancelled =
      this.chargeWasHeld &&
      (owner !== this.chargeOwner || (!chargeHeld && !actions.chargeReleased));
    this.chargeWasHeld = chargeHeld;
    this.chargeOwner = owner;
    const chargeEvents: Controls["chargeEvents"] = [];
    if (chargeCancelled) chargeEvents.push({ type: "cancel", duration: 0 });
    if (this.source === "keyboard")
      chargeEvents.push(...this.nativeChargeEvents);
    else {
      if (actions.chargePressed)
        chargeEvents.push({ type: "press", duration: 0 });
      if (actions.chargeReleased)
        chargeEvents.push({ type: "release", duration: 0 });
    }
    this.nativeChargeEvents = [];
    this.pending = emptyActions();
    return {
      chargeEvents,
      chargeHeld,
      chargeCancelled,
      move,
      aim,
      pointer: this.pointer,
      mouseAim: this.mouseAim,
      ...actions,
      source: this.source,
      gamepad: this.active,
      pads: pads.length,
      unsupported: pads.length - supported.length,
    };
  }
  private poll() {
    const value = this.sample(),
      now = performance.now();
    for (const event of value.chargeEvents) {
      if (event.type === "press") this.downAt = now;
      if (event.type === "release" && value.source === "gamepad")
        event.duration = this.downAt === null ? 0 : (now - this.downAt) / 1000;
      if (event.type !== "press") this.downAt = null;
      this.chargeQueue.push(event);
      if (this.chargeQueue.length > 32) this.chargeQueue.shift();
    }
    const queue = this.queued;
    for (const key of [
      "attack",
      "chargePressed",
      "chargeReleased",
      "chargeCancelled",
      "dodge",
      "pause",
      "confirm",
      "back",
    ] as const)
      queue[key] ||= value[key];
    if (value.navigate) queue.navigate = value.navigate;
    if (value.chargeReleased)
      queue.chargeReleaseDuration = value.chargeReleaseDuration;
    this.latest = value;
  }
  read(): Controls {
    this.poll();
    const value = {
      ...this.latest,
      ...this.queued,
      chargeEvents: this.chargeQueue.splice(0),
    };
    this.queued = { ...emptyActions(), chargeCancelled: false };
    return value;
  }
  dispose() {
    clearInterval(this.pollTimer);
  }
}
