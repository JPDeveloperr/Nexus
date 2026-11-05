import { CUT } from "./combat";
export const HEAVY = {
  windup: 0.04,
  activeEnd: 0.22,
  duration: 0.58,
  minCharge: 0.2,
  maxCharge: 1.2,
  minCost: 18,
  maxCost: 38,
};
export const DODGE = {
  duration: 0.3,
  invulnerableStart: 0.055,
  invulnerableEnd: 0.215,
  cooldown: 0.55,
  cost: 18,
};
export type ActionKind = "idle" | "charging" | "strike" | "dodge";
export class PlayerActions {
  kind: ActionKind = "idle";
  heavy = false;
  elapsed = 0;
  charge = 0;
  power = 0;
  energy = 100;
  cooldown = 0;
  buffer = 0;
  sequence = 0;
  get profile() {
    return this.heavy ? HEAVY : CUT;
  }
  get invulnerable() {
    return (
      this.kind === "dodge" &&
      this.elapsed >= DODGE.invulnerableStart &&
      this.elapsed < DODGE.invulnerableEnd
    );
  }
  get active() {
    return (
      this.kind === "strike" &&
      this.elapsed >= this.profile.windup &&
      this.elapsed <= this.profile.activeEnd
    );
  }
  get damage() {
    return 34 * (this.heavy ? 1 + 1.5 * this.power : 1);
  }
  basic() {
    if (this.kind === "charging") return false;
    this.buffer = CUT.buffer;
    return true;
  }
  startCharge() {
    if (this.kind !== "idle" || this.energy < HEAVY.minCost) return false;
    this.kind = "charging";
    this.elapsed = 0;
    this.charge = 0;
    this.buffer = 0;
    return true;
  }
  releaseCharge() {
    if (this.kind !== "charging") return false;
    if (this.charge + 1e-9 < HEAVY.minCharge) {
      this.cancel();
      return false;
    }
    this.power = Math.min(
      this.charge / HEAVY.maxCharge,
      Math.max(
        0,
        (this.energy - HEAVY.minCost) / (HEAVY.maxCost - HEAVY.minCost),
      ),
    );
    this.energy -= HEAVY.minCost + (HEAVY.maxCost - HEAVY.minCost) * this.power;
    this.heavy = true;
    this.kind = "strike";
    this.elapsed = 0;
    this.sequence++;
    return true;
  }
  dodge() {
    if (
      this.cooldown > 0 ||
      this.energy < DODGE.cost ||
      this.kind === "dodge" ||
      (this.kind === "strike" && this.elapsed < this.profile.activeEnd)
    )
      return false;
    this.kind = "dodge";
    this.elapsed = 0;
    this.buffer = 0;
    this.charge = 0;
    this.energy -= DODGE.cost;
    this.cooldown = DODGE.cooldown;
    return true;
  }
  update(dt: number, canAttack = true) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.kind === "charging") {
      this.charge = Math.min(HEAVY.maxCharge, this.charge + dt);
      return;
    }
    this.energy = Math.min(100, this.energy + dt * 15);
    if (this.kind === "strike" || this.kind === "dodge") {
      this.elapsed += dt;
      if (
        this.elapsed + 1e-9 >=
        (this.kind === "strike" ? this.profile.duration : DODGE.duration)
      ) {
        this.kind = "idle";
        this.elapsed = 0;
        this.charge = 0;
      }
    }
    if (
      this.kind === "idle" &&
      this.buffer > 0 &&
      this.energy >= 8 &&
      canAttack
    ) {
      this.kind = "strike";
      this.heavy = false;
      this.power = 0;
      this.elapsed = 0;
      this.energy -= 8;
      this.sequence++;
      this.buffer = 0;
    }
    this.buffer = Math.max(0, this.buffer - dt);
  }
  cancel() {
    this.kind = "idle";
    this.elapsed = 0;
    this.charge = 0;
    this.buffer = 0;
    this.heavy = false;
  }
  reset() {
    this.cancel();
    this.cooldown = 0;
    this.energy = 100;
    this.sequence = 0;
    this.power = 0;
  }
}
export function dodgeSpeed(elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / DODGE.duration));
  return 4 + 13 * Math.sin(Math.PI * t);
}
