import * as T from "three";
import { ARENA_RADIUS, type Point, type Obstacle } from "./mechanics";
export const WAVE_RADIUS = 0.85;
export function firstContact(a: Point, b: Point, c: Point, r: number) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    ox = a.x - c.x,
    oz = a.z - c.z;
  const cc = ox * ox + oz * oz - r * r;
  if (cc <= 0) return 0;
  const aa = dx * dx + dz * dz,
    bb = 2 * (ox * dx + oz * dz),
    disc = bb * bb - 4 * aa * cc;
  if (aa < 1e-12 || disc < 0) return Infinity;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : Infinity;
}
type Target = Point & { id: number; radius: number };
export type WaveCast = {
  live: boolean;
  age: number;
  distance: number;
  power: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
  hits: Set<number>;
  mesh: T.Mesh<T.BufferGeometry, T.ShaderMaterial>;
  trail: T.Mesh<T.BufferGeometry, T.ShaderMaterial>[];
};
export class CrimsonWaves {
  casts: WaveCast[] = [];
  private light = new T.PointLight(0xff1238, 0, 4);
  constructor(scene: T.Scene) {
    const positions: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32,
        angle = (t - 0.5) * 2.5;
      for (let j = 0; j < 2; j++) {
        const width = Math.sin(Math.PI * t) * 0.22;
        positions.push(
          Math.sin(angle) * 1.05,
          (j - 0.5) * width,
          Math.cos(angle) * 0.45,
        );
        uvs.push(t, j);
      }
      if (i < 32) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    for (let i = 0; i < 4; i++) {
      const material = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
        uniforms: {
          age: { value: 0 },
          fade: { value: 1 },
          power: { value: 0 },
        },
        vertexShader: `varying vec2 vUv;uniform float age;void main(){vUv=uv;vec3 p=position;p.y+=sin(uv.x*35.-age*24.)*.025*sin(uv.x*3.14159);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
        fragmentShader: `varying vec2 vUv;uniform float fade;uniform float power;uniform float age;void main(){float edge=pow(max(0.,sin(vUv.y*3.14159)),.7);float tip=pow(max(0.,sin(vUv.x*3.14159)),.4);float core=pow(edge,14.);float sparks=pow(max(0.,sin(vUv.x*87.-age*32.)),24.)*.3;vec3 col=mix(vec3(.8,.005,.055),vec3(1.,.52,.48),core);gl_FragColor=vec4(col*(1.+power*.4),min(1.,edge+sparks)*tip*fade);}`,
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      const trail = Array.from({ length: 3 }, () => {
        const ghost = new T.Mesh(geometry, material.clone());
        ghost.visible = false;
        scene.add(ghost);
        return ghost;
      });
      this.casts.push({
        trail,
        live: false,
        age: 0,
        distance: 0,
        power: 0,
        x: 0,
        z: 0,
        dx: 0,
        dz: 1,
        hits: new Set(),
        mesh,
      });
    }
    scene.add(this.light);
  }
  launch(origin: Point, facing: number, power: number, hits: Set<number>) {
    const w = this.casts.find((w) => !w.live);
    if (!w) return false;
    Object.assign(w, {
      live: true,
      age: 0,
      distance: 0,
      power,
      x: origin.x,
      z: origin.z,
      dx: Math.sin(facing),
      dz: Math.cos(facing),
      hits,
    });
    w.trail.forEach((g) => {
      g.visible = false;
      g.rotation.y = facing;
    });
    w.mesh.rotation.y = facing;
    w.mesh.position.set(w.x, 1.1, w.z);
    w.mesh.visible = true;
    return true;
  }
  update(
    dt: number,
    obstacles: Obstacle[],
    targets: Target[],
    hit: (id: number, power: number, w: WaveCast) => boolean,
  ) {
    this.light.intensity = 0;
    for (const w of this.casts) {
      if (!w.live) continue;
      w.age += dt;
      const range = 3 + 2 * w.power;
      const step = Math.min(
        range - w.distance,
        dt * (10 - (4 * w.distance) / range),
      );
      const end = { x: w.x + w.dx * step, z: w.z + w.dz * step };
      let stop = 1;
      for (const o of obstacles)
        stop = Math.min(stop, firstContact(w, end, o, o.radius + WAVE_RADIUS));
      // Arena containment uses the same finite swept substeps as the travel distance.
      if (Math.hypot(end.x, end.z) > ARENA_RADIUS - WAVE_RADIUS) stop = 0;
      const clipped = {
        x: w.x + w.dx * step * stop,
        z: w.z + w.dz * step * stop,
      };
      const sorted = targets
        .map((e) => ({
          e,
          t: firstContact(w, clipped, e, e.radius + WAVE_RADIUS),
        }))
        .filter((x) => x.t <= 1)
        .sort((a, b) => a.t - b.t);
      for (const { e } of sorted)
        if (!w.hits.has(e.id) && hit(e.id, w.power, w)) w.hits.add(e.id);
      w.x = clipped.x;
      w.z = clipped.z;
      w.distance += step * stop;
      w.mesh.position.set(w.x, 1.1, w.z);
      w.mesh.material.uniforms.age.value = w.age;
      w.mesh.material.uniforms.power.value = w.power;
      w.mesh.material.uniforms.fade.value = Math.min(
        1,
        (range - w.distance) / 0.9,
      );
      w.trail.forEach((g, i) => {
        const offset = (i + 1) * 0.17;
        g.visible = w.distance > offset;
        g.position.set(w.x - w.dx * offset, 1.1, w.z - w.dz * offset);
        g.material.uniforms.age.value = w.age - (i + 1) * 0.015;
        g.material.uniforms.power.value = w.power;
        g.material.uniforms.fade.value =
          w.mesh.material.uniforms.fade.value * (0.23 - i * 0.065);
      });
      this.light.position.copy(w.mesh.position);
      this.light.intensity = Math.max(
        this.light.intensity,
        Math.exp(-w.age * 12) * 2,
      );
      if (stop < 1 || w.distance >= range - 1e-6 || w.age > 1.1) {
        w.live = w.mesh.visible = false;
        w.trail.forEach((g) => (g.visible = false));
      }
    }
  }
  reset() {
    for (const w of this.casts) {
      w.live = w.mesh.visible = false;
      w.hits.clear();
      w.trail.forEach((g) => (g.visible = false));
    }
    this.light.intensity = 0;
  }
  snapshot() {
    return this.casts
      .filter((w) => w.live)
      .map((w) => ({
        x: w.x,
        z: w.z,
        distance: w.distance,
        power: w.power,
        hits: [...w.hits],
      }));
  }
}
