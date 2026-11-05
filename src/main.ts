import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Warrior, Temple, mesh } from "./visuals";
import {
  ATTACK,
  PLAYER_RADIUS,
  dampAngle,
  insideStrike,
  moveCircle,
} from "./mechanics";
import "./style.css";
import { InputSystem } from "./input";
import { FixedStepClock } from "./timing";
import { CUT, cutPose, sweptBladeHits } from "./combat";
import { CombatEffects } from "./combat-effects";
import { PlayerActions, HEAVY, DODGE, dodgeSpeed } from "./actions";
import { EnemySystem } from "./enemies";
import { SpectralEffects } from "./spectral-effects";

type Mode = "menu" | "playing" | "paused" | "defeat" | "victory";
const $ = <E extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<E>(s)!;
$("#interface").innerHTML = `
  <header><a class="brand" href="#" aria-label="Nexus"><span class="sigil">⟐</span><span>NEXUS<small>SHATTERED REALMS</small></span></a><div class="chapter"><span class="status-dot"></span> FRAGMENTO 01 <i></i> TEMPLO DAS RUÍNAS SUSPENSAS</div><button id="pause" class="quiet">II <span>PAUSAR</span> <kbd>ESC</kbd></button></header>
  <section id="mission" class="hidden"><span class="eyebrow">CRIMSON FURY · QUATRO ONDAS</span><h2>O último santuário</h2><p id="objective">Derrote as sentinelas corrompidas <b>0 / 3</b></p><div class="objective-line"></div><p class="seed">◇ SEMENTE <span id="seed"></span></p></section>
  <aside id="zone"><span class="zone-diamond">◇</span><div>RUÍNAS SUSPENSAS<small>Santuário do limiar</small></div></aside>
  <div id="crosshair">＋</div><div id="damage-flash"></div><div class="vignette"></div>
  <div id="toast" role="status"></div>
  <footer id="hud" class="hidden"><div class="vitals"><div class="identity"><span class="portrait">⟐</span><div><span class="eyebrow">ANDARILHO DIMENSIONAL</span><h3>Kaeron <small>01</small></h3></div></div><div class="bar-label"><span>VITALIDADE</span><span id="hp-text">100 / 100</span></div><div class="bar health"><div id="hp"></div></div><div class="bar-label energy-label"><span>ENERGIA</span><span id="energy-text">100 / 100</span></div><div class="bar energy"><div id="energy"></div></div></div><div class="combat"><button id="attack-button" title="Ataque leve — clique esquerdo"><span class="ability-icon">╱</span><span>CORTE DO LIMIAR</span><kbd>CLIQUE ESQUERDO</kbd><div id="cooldown"></div></button><div class="skill crimson"><span>⟐</span><strong>CRIMSON STRIKE</strong><small id="charge-text">SEGURE J / Y / △</small><div class="charge-track"><div id="charge-meter"></div></div></div><button id="dodge-button" class="skill phantom"><span>◇</span><strong>PHANTOM DODGE</strong><kbd>ESPAÇO / B / ○</kbd><small id="dodge-ready">PRONTO</small></button></div><div class="hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVER</span><span>⌖ MOUSE PARA MIRAR</span><span><kbd>ESC</kbd> PAUSAR</span></div></footer>
  <div id="overlay"><div class="menu-copy"><span class="eyebrow">UMA JORNADA ENTRE FRAGMENTOS</span><h1>NEXUS<span>SHATTERED REALMS</span></h1><div class="gold-rule"></div><p class="intro">O mundo se partiu.<br>A última centelha ainda resiste.</p><p class="description">Atravesse as ruínas de um reino suspenso no vazio.<br>Enfrente a corrupção. Restaure o que restou.</p><button id="start" class="primary">INICIAR JORNADA <span>→</span></button><div class="menu-controls"><span>WASD <small>MOVER</small></span><span>MOUSE <small>MIRAR E ATACAR</small></span></div><label class="quality-label">QUALIDADE GRÁFICA <select id="quality"><option value="low">Baixa</option><option value="medium" selected>Média</option><option value="high">Alta</option></select></label><label class="quality-label">DEADZONE <input id="deadzone" type="range" min="0.05" max="0.4" step="0.01" aria-label="Deadzone dos analógicos"><output id="deadzone-value"></output></label><label class="quality-label">CONTROLE ATIVO <select id="gamepad-select" aria-label="Controle ativo"><option value="auto">Automático</option></select></label></div><div class="menu-bottom"><span>VERSÃO 1.2 · CRIMSON FURY</span><span>UM MUNDO CONSTRUÍDO POR MATEMÁTICA</span></div></div>
  <div id="dialog" class="hidden" role="dialog" aria-modal="true"><div><span class="eyebrow" id="dialog-kicker"></span><h1 id="dialog-title"></h1><p id="dialog-copy"></p><button id="resume" class="primary"></button><button id="menu-button" class="secondary">VOLTAR AO MENU</button></div></div>
  <div id="input-status" role="status"></div><div id="metrics"></div>`;

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") || 7341) >>> 0;
$("#seed").textContent = String(seed);
const scene = new T.Scene();
scene.background = new T.Color(0x090d1d);
scene.fog = new T.FogExp2(0x11162d, 0.018);
let renderer: T.WebGLRenderer;
try {
  renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
} catch {
  $("#overlay").innerHTML =
    '<div class="menu-copy"><h1>WebGL2 indisponível</h1><p>Ative a aceleração gráfica e use um navegador atualizado.</p></div>';
  throw Error("WebGL2 unavailable");
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
$("#game").append(renderer.domElement);
renderer.domElement.setAttribute("aria-label", "Arena tridimensional de Nexus");
const camera = new T.OrthographicCamera(-20, 20, 12, -12, 0.1, 160);
const cameraTarget = new T.Vector3(0, 0, -1);
const cameraOffset = new T.Vector3(21, 26, 30);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new T.Vector2(innerWidth, innerHeight),
  0.42,
  0.6,
  1.15,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());
scene.add(new T.HemisphereLight(0xb0c8ef, 0x252034, 2.2));
const moon = new T.DirectionalLight(0xb4ceff, 3.7);
moon.position.set(-12, 24, -8);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, {
  left: -22,
  right: 22,
  top: 22,
  bottom: -22,
  near: 1,
  far: 65,
});
moon.shadow.bias = -0.0005;
moon.shadow.normalBias = 0.04;
scene.add(moon);
const fill = new T.DirectionalLight(0xa373d5, 1.7);
fill.position.set(12, 10, 4);
scene.add(fill);
const rim = new T.PointLight(0x42ecff, 28, 24, 2);
rim.position.set(0, 6, -12);
scene.add(rim);
const temple = new Temple(seed);
scene.add(temple.root);
const player = new Warrior();
scene.add(player.root);
player.root.position.set(0, 0, 5);
const playerLight = new T.PointLight(0x3dcfe0, 2, 4);
playerLight.position.y = 2;
player.root.add(playerLight);
const enemySystem = new EnemySystem(
  scene,
  temple.obstacles,
  seed,
  Number(params.get("enemyLimit") || 6),
);
const enemies = enemySystem.enemies;
const actions = new PlayerActions();
const spectral = new SpectralEffects(scene);
const dodgeDirection = new T.Vector3();
// Fixed-capacity particle pool; no geometry allocation during impacts.
const particleCount = 200,
  positions = new Float32Array(particleCount * 3),
  colors = new Float32Array(particleCount * 3);
const particleGeo = new T.BufferGeometry();
particleGeo.setAttribute("position", new T.BufferAttribute(positions, 3));
particleGeo.setAttribute("color", new T.BufferAttribute(colors, 3));
const particles = new T.Points(
  particleGeo,
  new T.PointsMaterial({
    size: 0.11,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: T.AdditiveBlending,
    depthWrite: false,
  }),
);
scene.add(particles);
const sparks = Array.from({ length: particleCount }, () => ({
  life: 0,
  v: new T.Vector3(),
}));
let particleIndex = 0;
positions.fill(-999);
const effects = new CombatEffects(scene);
const clock = new FixedStepClock();
const input = new InputSystem(renderer.domElement, () => mode === "playing");
let controls = input.read();
const velocity = new T.Vector2();
let actualSpeed = 0;
const pointer = new T.Vector2(0, 0);
const aim = new T.Vector3(0, 0, -1);
const ray = new T.Raycaster();
const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
let mouseAiming = false;
let mode: Mode = "menu",
  health = 100,
  energy = 100,
  attack = 0,
  hurt = 0,
  shake = 0,
  time = 0,
  kills = 0;
let attackBuffered = 0,
  hitstop = 0,
  attackSequence = 0;
const hitTargets = new Set<number>();
let previousBlade = player.bladeSample();
const combatEvents: Record<string, unknown>[] = [];
function recordCombat(event: Record<string, unknown>) {
  if (params.has("test")) {
    combatEvents.push({ ...event, time, sequence: attackSequence });
    if (combatEvents.length > 100) combatEvents.shift();
  }
}
let toastTimer = 0;
let audio: AudioContext | undefined;
function sound(frequency: number, duration: number, volume = 0.025) {
  if (!audio) return;
  const o = audio.createOscillator(),
    g = audio.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(frequency, audio.currentTime);
  o.frequency.exponentialRampToValueAtTime(
    frequency * 0.3,
    audio.currentTime + duration,
  );
  g.gain.setValueAtTime(volume, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  o.connect(g).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + duration);
}
function burst(p: T.Vector3, corrupted = false) {
  for (let i = 0; i < 23; i++) {
    const j = particleIndex++ % particleCount;
    const s = sparks[j];
    s.life = 0.35 + Math.random() * 0.4;
    s.v.set(
      (Math.random() - 0.5) * 7,
      Math.random() * 5,
      (Math.random() - 0.5) * 7,
    );
    positions.set([p.x, p.y + 1, p.z], j * 3);
    const c = new T.Color(corrupted ? 0xff5779 : 0x7dfaff);
    colors.set([c.r, c.g, c.b], j * 3);
  }
  particleGeo.attributes.color.needsUpdate = true;
}
function notify(text: string) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  toastTimer = 3;
}
function setMode(next: Mode) {
  if (next !== "playing" && actions.kind === "charging") {
    actions.cancel();
    spectral.reset();
    player.animate(time, 0, 0, 0);
    recordCombat({ kind: "chargeCancel", reason: next });
  }
  if (next === "menu" || next === "defeat" || next === "victory") {
    actions.cancel();
    spectral.reset();
  }
  mode = next;
  input.reset();
  clock.reset();
  velocity.set(0, 0);
  $("#overlay").classList.toggle("hidden", next !== "menu");
  $("#hud").classList.toggle("hidden", next === "menu");
  $("#mission").classList.toggle("hidden", next === "menu");
  $("#dialog").classList.toggle(
    "hidden",
    next === "menu" || next === "playing",
  );
  if (next === "playing") renderer.domElement.focus({ preventScroll: true });
  if (next === "paused" || next === "defeat" || next === "victory") {
    $("#dialog-kicker").textContent =
      next === "paused"
        ? "ENTRE DOIS MUNDOS"
        : next === "defeat"
          ? "A CHAMA AINDA EXISTE"
          : "FRAGMENTO PURIFICADO";
    $("#dialog-title").textContent =
      next === "paused"
        ? "Tempo suspenso"
        : next === "defeat"
          ? "O vazio chamou."
          : "O santuário resiste.";
    $("#dialog-copy").textContent =
      next === "paused"
        ? "Respire. As ruínas podem esperar."
        : next === "defeat"
          ? "Kaeron pode retornar ao limiar e tentar novamente."
          : "As quatro ondas foram vencidas. O santuário está seguro.";
    $("#resume").textContent =
      next === "paused" ? "CONTINUAR JORNADA" : "RECOMEÇAR NO LIMIAR";
    $("#resume").focus();
  }
}
function reset(wave = 1) {
  health = 100;
  energy = 100;
  attack = 0;
  hurt = 0;
  shake = 0;
  kills = 0;
  attackBuffered = 0;
  hitstop = 0;
  hitTargets.clear();
  effects.reset();
  player.root.position.set(0, 0, 5);
  player.root.rotation.set(0, Math.PI, 0);
  cameraTarget.set(0, 0, -1);
  actions.reset();
  enemySystem.reset(player.root.position, wave - 1);
  spectral.reset();
  combatEvents.length = 0;
  attackSequence = 0;
  sparks.forEach((s) => (s.life = 0));
  positions.fill(-999);
  updateHUD();
  setMode("playing");
  notify("Santuário descoberto · Elimine a corrupção");
}
function updateHUD() {
  $("#hp").style.width = `${health}%`;
  $("#hp-text").textContent = `${Math.ceil(health)} / 100`;
  $("#energy").style.width = `${energy}%`;
  $("#energy-text").textContent = `${Math.floor(energy)} / 100`;
  $("#objective").innerHTML =
    enemySystem.director.state === "intermission"
      ? `Próxima onda em <b>${Math.ceil(enemySystem.director.timer)}s</b>`
      : `ONDA ${enemySystem.director.wave + 1} / 4 <b>${enemySystem.aliveCount + enemySystem.director.pending.length} inimigos restantes</b>`;
  $("#cooldown").style.transform =
    `scaleX(${actions.kind === "strike" ? 1 - actions.elapsed / actions.profile.duration : 0})`;
  $("#charge-meter").style.width =
    `${(actions.charge / HEAVY.maxCharge) * 100}%`;
  $("#charge-text").textContent =
    actions.kind === "charging"
      ? `CARGA ${Math.round((actions.charge / HEAVY.maxCharge) * 100)}%`
      : "SEGURE J / Y / △";
  $("#dodge-ready").textContent =
    actions.cooldown > 0 ? actions.cooldown.toFixed(1) + "s" : "PRONTO";
}
function startAttack() {
  if (mode === "playing") actions.basic();
}
function worldDirection(x: number, y: number) {
  return new T.Vector3(cameraOffset.z, 0, -cameraOffset.x)
    .normalize()
    .multiplyScalar(x)
    .add(
      new T.Vector3(-cameraOffset.x, 0, -cameraOffset.z)
        .normalize()
        .multiplyScalar(-y),
    );
}
function lockFacing() {
  if (controls.aim) {
    const d = worldDirection(controls.aim.x, controls.aim.y);
    player.root.rotation.y = Math.atan2(d.x, d.z);
  } else if (mouseAiming)
    player.root.rotation.y = Math.atan2(
      aim.x - player.root.position.x,
      aim.z - player.root.position.z,
    );
}
function actionStarted() {
  hitTargets.clear();
  attackSequence = actions.sequence;
  lockFacing();
  previousBlade = player.bladeSample();
  effects.color(actions.heavy);
  recordCombat({
    kind: "start",
    heavy: actions.heavy,
    power: actions.power,
    damage: actions.damage,
    duration: actions.profile.duration,
  });
  sound(actions.heavy ? 120 : 320, 0.1, 0.018);
}
function receiveDamage(amount: number, source: string) {
  if (mode !== "playing") return false;
  if (actions.invulnerable) {
    recordCombat({ kind: "evade", source, dodgeTime: actions.elapsed });
    return false;
  }
  if (hurt > 0) return false;
  health = Math.max(0, health - amount);
  hurt = 0.6;
  shake = 0.13;
  burst(player.root.position, true);
  sound(80, 0.15, 0.03);
  if (actions.kind === "charging") {
    actions.cancel();
    recordCombat({ kind: "chargeCancel", reason: "damage" });
  }
  recordCombat({ kind: "receivedDamage", amount, source });
  if (health === 0) setMode("defeat");
  return true;
}
$("#start").onclick = () => {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {
    /* Audio must never block play. */
  }
  reset();
};
$("#resume").onclick = () => (mode === "paused" ? setMode("playing") : reset());
$("#menu-button").onclick = () => setMode("menu");
$("#pause").onclick = () => {
  if (mode === "playing") setMode("paused");
  else if (mode === "paused") setMode("playing");
};
$("#attack-button").onclick = () => input.requestBasic();
$("#dodge-button").onclick = () => input.requestDodge();
window.addEventListener("blur", () => {
  if (mode === "playing") setMode("paused");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "playing") setMode("paused");
});
function applyQuality(value: string) {
  const high = value === "high",
    low = value === "low";
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : high ? 2 : 1.5));
  renderer.shadowMap.enabled = !low;
  bloom.enabled = !low;
  bloom.strength = high ? 0.55 : 0.42;
  resize();
}
const deadzoneSlider = $<HTMLInputElement>("#deadzone");
deadzoneSlider.value = String(input.deadzone);
$("#deadzone-value").textContent = Math.round(input.deadzone * 100) + "%";
deadzoneSlider.oninput = () => {
  input.saveDeadzone(Number(deadzoneSlider.value));
  $("#deadzone-value").textContent = Math.round(input.deadzone * 100) + "%";
};
$("#gamepad-select").onchange = (e) => {
  const value = (e.target as HTMLSelectElement).value;
  input.selectGamepad(value === "auto" ? null : Number(value));
};
let padListSignature = "";
function updateInputUI() {
  const pads = input.available(),
    signature = pads
      .map((p) => p.index + ":" + p.id + ":" + p.mapping)
      .join("|");
  if (signature !== padListSignature) {
    padListSignature = signature;
    const select = $<HTMLSelectElement>("#gamepad-select");
    select.replaceChildren(new Option("Automático", "auto"));
    for (const p of pads) {
      const option = new Option(
        `${p.index + 1}: ${p.id.slice(0, 45)}`,
        String(p.index),
      );
      option.disabled = p.mapping !== "standard";
      select.add(option);
    }
  }
  $("#input-status").textContent = controls.unsupported
    ? "Mapeamento não padrão · use teclado ou um controle padrão"
    : controls.source === "gamepad"
      ? `CONTROLE ${Number(controls.gamepad) + 1} · X / □ CORTE · Y / △ CARGA · B / ○ ESQUIVA`
      : `TECLADO / MOUSE${controls.pads ? " · CONTROLE CONECTADO" : ""}`;
}
function handleMenuInput() {
  if (mode === "playing") return;
  const candidates =
    mode === "menu"
      ? ["#start", "#quality", "#deadzone", "#gamepad-select"]
      : ["#resume", "#menu-button"];
  const elements = candidates.map((s) => $(s));
  let index = elements.indexOf(document.activeElement as HTMLElement);
  if (controls.navigate) {
    const focused = elements[index];
    if (focused instanceof HTMLSelectElement) {
      focused.selectedIndex = Math.max(
        0,
        Math.min(
          focused.options.length - 1,
          focused.selectedIndex + controls.navigate,
        ),
      );
      focused.dispatchEvent(new Event("change"));
    } else if (focused instanceof HTMLInputElement) {
      focused.value = String(
        Math.max(
          0.05,
          Math.min(0.4, Number(focused.value) + controls.navigate * 0.01),
        ),
      );
      focused.dispatchEvent(new Event("input"));
    } else {
      index = (index + controls.navigate + elements.length) % elements.length;
      elements[index].focus();
    }
  }
  if (controls.confirm) {
    if (index < 0) index = 0;
    const selected = elements[index];
    if (selected instanceof HTMLButtonElement) selected.click();
    else elements[(index + 1) % elements.length].focus();
  }
  if (controls.back && mode === "paused") setMode("playing");
  else if (controls.back && mode !== "menu") setMode("menu");
}
$("#quality").onchange = (e) =>
  applyQuality((e.target as HTMLSelectElement).value);
function resize() {
  const aspect = innerWidth / innerHeight;
  const view = innerWidth < 800 ? 18 : 15;
  camera.left = -view * aspect;
  camera.right = view * aspect;
  camera.top = view;
  camera.bottom = -view;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}
window.addEventListener("resize", resize);
resize();
function simulate(dt: number) {
  if (mode === "playing" && hitstop > 0) {
    hitstop = Math.max(0, hitstop - dt);
    return;
  }
  if (mode === "playing" || mode === "menu") time += dt;
  if (mode === "playing") {
    ray.setFromCamera(pointer, camera);
    ray.ray.intersectPlane(plane, aim);
    const oldKind = actions.kind,
      sequence = actions.sequence;
    actions.update(dt, hurt <= 0.22);
    if (actions.sequence !== sequence) actionStarted();
    if (oldKind === "strike" && actions.kind === "idle")
      recordCombat({ kind: "end" });
    const direction = worldDirection(controls.move.x, controls.move.y);
    if (direction.lengthSq() > 1) direction.normalize();
    const speed =
      actions.kind === "charging"
        ? 1.0
        : actions.kind === "strike"
          ? actions.heavy
            ? 0.8
            : 2.8
          : 4.6;
    if (actions.kind === "dodge")
      velocity.set(
        dodgeDirection.x * dodgeSpeed(actions.elapsed),
        dodgeDirection.z * dodgeSpeed(actions.elapsed),
      );
    else
      velocity.lerp(
        new T.Vector2(direction.x * speed, direction.z * speed),
        1 - Math.exp(-14 * dt),
      );
    const before = player.root.position.clone();
    const next = moveCircle(
      before,
      { x: velocity.x * dt, z: velocity.y * dt },
      PLAYER_RADIUS,
      temple.obstacles.concat(enemySystem.blockers()),
    );
    player.root.position.x = next.x;
    player.root.position.z = next.z;
    actualSpeed = Math.hypot(next.x - before.x, next.z - before.z) / dt;
    if (actions.kind !== "strike" && actions.kind !== "dodge") {
      if (controls.aim || mouseAiming) {
        const previousAngle = player.root.rotation.y;
        lockFacing();
        player.root.rotation.y = dampAngle(
          previousAngle,
          player.root.rotation.y,
          18,
          dt,
        );
      } else if (direction.lengthSq() > 0.01)
        player.root.rotation.y = dampAngle(
          player.root.rotation.y,
          Math.atan2(direction.x, direction.z),
          14,
          dt,
        );
    }
    const charge =
      actions.kind === "charging"
        ? Math.max(0.001, actions.charge / HEAVY.maxCharge)
        : 0;
    attack =
      actions.kind === "strike"
        ? actions.profile.duration - actions.elapsed
        : 0;
    player.animate(time, actualSpeed, attack, hurt, false, dt, {
      elapsed: actions.elapsed,
      profile: actions.profile,
      charge,
      heavy: actions.kind === "strike" && actions.heavy,
      dodge: actions.kind === "dodge" ? actions.elapsed : -1,
    });
    const blade = player.bladeSample();
    if (actions.active) {
      effects.sample(blade.base, blade.tip, time);
      for (const e of enemySystem.alive)
        if (
          !hitTargets.has(e.id) &&
          e.state !== "spawn" &&
          player.root.position.distanceTo(e.body.root.position) <=
            (actions.heavy ? 3.8 : ATTACK.reach) &&
          sweptBladeHits(
            previousBlade,
            blade,
            e.body.root.position,
            e.kind === "brute" ? 0.95 : 0.64,
          )
        ) {
          const dead = e.hp === 0;
          const damage = enemySystem.hit(
            e,
            actions.damage,
            actions.heavy,
            actions.power,
            player.root.position,
          );
          if (damage <= 0) continue;
          hitTargets.add(e.id);
          effects.impact(e.body.root.position);
          hitstop = actions.heavy ? 0.04 : CUT.hitstop;
          shake = actions.heavy ? 0.22 : 0.07;
          burst(e.body.root.position, actions.heavy);
          sound(actions.heavy ? 90 : 180, 0.12, 0.03);
          recordCombat({
            kind: "hit",
            heavy: actions.heavy,
            power: actions.power,
            damage,
            elapsed: actions.elapsed,
            phase: cutPose(actions.elapsed, actions.profile).phase,
            target: e.id,
            archetype: e.kind,
            base: blade.base.toArray(),
            tip: blade.tip.toArray(),
          });
          if (!dead && e.hp === 0) {
            kills++;
            recordCombat({
              kind: "enemyDeath",
              target: e.id,
              archetype: e.kind,
            });
          }
        }
    }
    previousBlade = blade;
    hurt = Math.max(0, hurt - dt);
    energy = actions.energy;
    attackBuffered = actions.buffer;
    spectral.update(
      time,
      dt,
      blade.base,
      blade.tip,
      charge,
      actions.kind === "dodge",
      player.root,
    );
    const oldWave = enemySystem.director.wave,
      oldState = enemySystem.director.state;
    enemySystem.update({
      dt,
      time,
      player: player.root.position,
      damage: receiveDamage,
      event: (kind, data) =>
        recordCombat({ ...data, archetype: data.kind, kind }),
    });
    if (enemySystem.director.wave !== oldWave)
      notify(`Onda ${enemySystem.director.wave + 1} · A corrupção retorna`);
    if (
      oldState !== "intermission" &&
      enemySystem.director.state === "intermission"
    )
      notify("Onda concluída · Prepare-se");
    if (enemySystem.director.state === "completed") setMode("victory");
    const follow = player.root.position.clone().multiplyScalar(0.33);
    follow.z -= 1.5;
    cameraTarget.lerp(follow, 1 - Math.exp(-3 * dt));
    updateHUD();
  } else if (mode === "menu") {
    player.animate(time, 0, 0, 0);
    enemies.forEach((e) => {
      if (e.body.root.visible) e.body.animate(time + e.id, 0, 0, 0);
    });
    cameraTarget.lerp(new T.Vector3(-2, 0, -1.5), 0.02);
    effects.reset();
  }
}
let previous = performance.now();
let frameTimes: number[] = [];
let metricsTimer = 0;
let updateMs = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const frameMs = Math.max(0, now - previous);
  previous = now;
  const dt = Math.min(frameMs / 1000, 0.5);
  const wasPlaying = mode === "playing";
  controls = input.read();
  pointer.set(controls.pointer.x, controls.pointer.y);
  mouseAiming = controls.mouseAim;
  if (controls.pause) {
    if (mode === "playing") setMode("paused");
    else if (mode === "paused") setMode("playing");
  }
  handleMenuInput();
  updateInputUI();
  ray.setFromCamera(pointer, camera);
  ray.ray.intersectPlane(plane, aim);
  if (mode === "playing" && wasPlaying) {
    for (const event of controls.chargeEvents) {
      if (event.type === "cancel" && actions.kind === "charging") {
        actions.cancel();
        recordCombat({ kind: "chargeCancel", reason: "inputDisconnected" });
      }
      if (event.type === "press" && actions.startCharge())
        recordCombat({ kind: "chargeStart" });
      if (event.type === "release" && actions.kind === "charging") {
        actions.charge = Math.max(
          actions.charge,
          Math.min(HEAVY.maxCharge, event.duration),
        );
        if (actions.releaseCharge()) actionStarted();
        else {
          notify("Carga curta demais · Segure por 0,2s");
          recordCombat({ kind: "chargeCancel", reason: "tooShort" });
        }
      }
    }
    if (controls.dodge && actions.dodge()) {
      const move = worldDirection(controls.move.x, controls.move.y);
      dodgeDirection.copy(
        move.lengthSq() > 0.01
          ? move.normalize()
          : new T.Vector3(
              Math.sin(player.root.rotation.y),
              0,
              Math.cos(player.root.rotation.y),
            ),
      );
      velocity.set(0, 0);
      burst(player.root.position);
      recordCombat({ kind: "dodgeStart", direction: dodgeDirection.toArray() });
    }
    if (controls.attack) startAttack();
  }
  const updateStarted = performance.now();
  if (mode === "playing" || mode === "menu") clock.advance(dt, simulate);
  else clock.reset();
  updateMs = performance.now() - updateStarted;
  if (mode === "playing" || mode === "menu") temple.update(time);
  for (let i = 0; i < particleCount; i++) {
    const s = sparks[i];
    if (s.life > 0 && mode === "playing") {
      s.life -= dt;
      s.v.y -= dt * 7;
      positions[i * 3] += s.v.x * dt;
      positions[i * 3 + 1] += s.v.y * dt;
      positions[i * 3 + 2] += s.v.z * dt;
    }
    if (s.life <= 0) positions[i * 3 + 1] = -999;
  }
  particleGeo.attributes.position.needsUpdate = true;
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $("#toast").classList.remove("show");
  }
  shake = Math.max(0, shake - dt);
  camera.position.copy(cameraTarget).add(cameraOffset);
  if (shake > 0 && mode === "playing")
    camera.position.x += Math.sin(now * 0.14) * shake * 1.5;
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld();
  $("#damage-flash").style.opacity = String(hurt * 0.5);
  effects.update(time, mode === "playing" ? dt : 0);
  renderer.info.reset();
  composer.render();
  if (frameMs > 0) frameTimes.push(frameMs);
  if (frameTimes.length > 180) frameTimes.shift();
  metricsTimer += dt;
  if (metricsTimer > 1) {
    metricsTimer = 0;
    $("#metrics").textContent =
      `${Math.round(1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length))} FPS · ${renderer.info.render.calls} DC${params.has("diagnostics") ? ` · ${enemySystem.aliveCount} ENEMIES · ${updateMs.toFixed(2)}ms UPDATE` : ""}`;
  }
}
enemySystem.reset(player.root.position);
requestAnimationFrame(frame);
// Explicit opt-in inspection API for real browser tests; absent during normal play.
if (params.has("test")) {
  Object.assign(window, {
    __nexus: {
      snapshot: () => ({
        mode,
        time,
        health,
        energy,
        kills,
        attack,
        action: {
          kind: actions.kind,
          heavy: actions.heavy,
          elapsed: actions.elapsed,
          charge: actions.charge,
          power: actions.power,
          energy: actions.energy,
          cooldown: actions.cooldown,
          invulnerable: actions.invulnerable,
        },
        world: enemySystem.snapshot(),
        updateMs,
        bladeColor: (
          player.blade.material as T.MeshStandardMaterial
        ).color.getHex(),
        bladeEmissive: (
          player.blade.material as T.MeshStandardMaterial
        ).emissive.getHex(),
        attackBuffered,
        hitstop,
        attackSequence,
        combatEvents: combatEvents.slice(),
        blade: player.bladeSample(),
        animationPhase:
          attack > 0 ? cutPose(actions.elapsed, actions.profile).phase : "idle",
        actualSpeed,
        velocity: velocity.toArray(),
        input: controls,
        focus: document.activeElement?.tagName,
        player: {
          x: player.root.position.x,
          z: player.root.position.z,
          facing: player.root.rotation.y,
        },
        enemies: enemySystem.snapshot().enemies,
        camera: camera.position.toArray(),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        frames: frameTimes.slice(),
        geometries: renderer.info.memory.geometries,
      }),
      scenario: (wave: number) => {
        if (!Number.isInteger(wave) || wave < 1 || wave > 4)
          throw Error("Invalid test wave");
        reset(wave);
      },
      placeEnemy: (id: number, x: number, z: number) => {
        const e = enemies.find((e) => e.id === id);
        if (!e) throw Error("Unknown enemy");
        const p = moveCircle(
          { x, z },
          { x: 0, z: 0 },
          e.kind === "brute" ? 0.85 : 0.5,
          temple.obstacles,
        );
        e.body.root.position.set(p.x, 0, p.z);
      },
      place: (x: number, z: number) => {
        const p = moveCircle(
          { x, z },
          { x: 0, z: 0 },
          PLAYER_RADIUS,
          temple.obstacles,
        );
        player.root.position.set(p.x, 0, p.z);
        velocity.set(0, 0);
      },
      face: (a: number) => {
        mouseAiming = false;
        input.clearAim();
        player.root.rotation.y = a;
      },
      inspect: (zoom: number) => {
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
        if (zoom !== 1) {
          cameraTarget.copy(player.root.position);
          cameraTarget.y = 0.8;
        } else cameraTarget.y = 0;
      },
      project: (x: number, y: number, z: number) => {
        const v = new T.Vector3(x, y, z).project(camera);
        return {
          x: ((v.x + 1) * innerWidth) / 2,
          y: ((1 - v.y) * innerHeight) / 2,
        };
      },
    },
  });
}
window.addEventListener("pagehide", () => {
  scene.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Points) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        m.dispose();
    }
  });
  input.dispose();
  composer.dispose();
  renderer.dispose();
  void audio?.close();
});
