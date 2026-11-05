/** Catch up rendering stalls with bounded fixed physics steps, never one giant move. */
export class FixedStepClock {
  private accumulator = 0;
  readonly step = 1 / 60;
  advance(seconds: number, update: (dt: number) => void) {
    this.accumulator += Math.max(0, Math.min(seconds, 0.5));
    let steps = 0;
    while (this.accumulator + 1e-10 >= this.step) {
      this.accumulator -= this.step;
      update(this.step);
      steps++;
    }
    return steps;
  }
  reset() {
    this.accumulator = 0;
  }
}
