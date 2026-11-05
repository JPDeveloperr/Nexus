import * as T from "three";
export class CombatEffects {
  private samples: { base: T.Vector3; tip: T.Vector3; time: number }[] = [];
  private geometry = new T.BufferGeometry();
  private positions = new Float32Array(24 * 6);
  private alphas = new Float32Array(24 * 2);
  ribbon: T.Mesh;
  flash: T.Mesh;
  wave: T.Mesh;
  light: T.PointLight;
  private contactLife = 0;
  private fresh = false;
  constructor(scene: T.Scene) {
    this.geometry.setAttribute(
      "position",
      new T.BufferAttribute(this.positions, 3),
    );
    this.geometry.setAttribute("alpha", new T.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute(
      "edge",
      new T.BufferAttribute(
        Float32Array.from({ length: 48 }, (_, i) => i % 2),
        1,
      ),
    );
    const indices: number[] = [];
    for (let i = 0; i < 23; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(indices);
    this.ribbon = new T.Mesh(
      this.geometry,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
        vertexShader:
          "attribute float alpha; attribute float edge; varying float vAlpha; varying float vEdge; void main(){vAlpha=alpha;vEdge=edge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "varying float vAlpha;varying float vEdge;void main(){gl_FragColor=vec4(mix(vec3(.06,.45,.65),vec3(.7,1.,1.),vEdge),vAlpha*(.2+.8*vEdge));}",
      }),
    );
    this.ribbon.frustumCulled = false;
    scene.add(this.ribbon);
    this.flash = new T.Mesh(
      new T.IcosahedronGeometry(0.22, 1),
      new T.MeshBasicMaterial({
        color: 0xc9ffff,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.wave = new T.Mesh(
      new T.RingGeometry(0.2, 0.26, 40),
      new T.MeshBasicMaterial({
        color: 0x6dedfa,
        transparent: true,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.wave.rotation.x = -Math.PI / 2;
    this.light = new T.PointLight(0x72f8ff, 0, 5);
    scene.add(this.flash, this.wave, this.light);
    this.flash.visible = false;
    this.wave.visible = false;
  }
  sample(base: T.Vector3, tip: T.Vector3, time: number) {
    this.samples.push({ base: base.clone(), tip: tip.clone(), time });
    if (this.samples.length > 24) this.samples.shift();
  }
  impact(position: T.Vector3) {
    this.contactLife = 0.12;
    this.fresh = true;
    this.flash.position.copy(position);
    this.flash.position.y = 1.15;
    this.wave.position.copy(position);
    this.wave.position.y = 0.08;
    this.light.position.copy(this.flash.position);
  }
  update(time: number, dt: number) {
    this.samples = this.samples.filter((s) => time - s.time < 0.17);
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i];
      this.positions.set(s.base.toArray(), i * 6);
      this.positions.set(s.tip.toArray(), i * 6 + 3);
      this.alphas[i * 2] = this.alphas[i * 2 + 1] =
        Math.max(0, 1 - (time - s.time) / 0.17) * 0.7;
    }
    this.geometry.setDrawRange(0, Math.max(0, this.samples.length - 1) * 6);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.contactLife = Math.max(0, this.contactLife - (this.fresh ? 0 : dt));
    this.fresh = false;
    const alpha = this.contactLife / 0.12;
    this.flash.visible = this.wave.visible = alpha > 0;
    (this.flash.material as T.MeshBasicMaterial).opacity = alpha;
    this.flash.scale.setScalar(1 + (1 - alpha) * 1.4);
    (this.wave.material as T.MeshBasicMaterial).opacity = alpha * 0.5;
    this.wave.scale.setScalar(1 + (1 - alpha) * 6);
    this.light.intensity = alpha * 12;
  }
  reset() {
    this.samples = [];
    this.contactLife = 0;
    this.update(0, 0);
  }
}
