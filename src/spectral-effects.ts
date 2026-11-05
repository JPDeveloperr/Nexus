import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
export class SpectralEffects {
  private positions = new Float32Array(40 * 3);
  private points: T.Points;
  private halo: T.Mesh;
  private light: T.PointLight;
  private ghosts: { mesh: T.Mesh; life: number }[] = [];
  private nextGhost = 0;
  private ghostTime = 0;
  constructor(scene: T.Scene) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.BufferAttribute(this.positions, 3));
    this.points = new T.Points(
      geometry,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        uniforms: { power: { value: 0 } },
        vertexShader:
          "uniform float power;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(180.*(.4+power)/-p.z,1.,7.);gl_Position=projectionMatrix*p;}",
        fragmentShader:
          "uniform float power;void main(){float a=smoothstep(.5,.05,length(gl_PointCoord-.5));gl_FragColor=vec4(1.,.04+.15*power,.16,a*.8);}",
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.halo = new T.Mesh(
      new T.SphereGeometry(0.4, 16, 10),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
        uniforms: { power: { value: 0 }, time: { value: 0 }, tint:{value:new T.Color(0xff0420)} },
        vertexShader:
          "varying vec2 vUv;uniform float time;uniform float power;void main(){vUv=uv;vec3 p=position+normal*sin(position.y*24.+time*16.)*.025*power;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}",
        fragmentShader:
          "varying vec2 vUv;uniform float time;uniform float power;uniform vec3 tint;void main(){float r=pow(.5+.5*sin(vUv.y*70.-time*9.),12.);gl_FragColor=vec4(tint,r*power*.25);}",
      }),
    );
    scene.add(this.halo);
    this.points.visible = this.halo.visible = false;
    this.light = new T.PointLight(0xff1645, 0, 5);
    scene.add(this.light);
    const torso = new T.ConeGeometry(0.48, 1.4, 6);
    torso.translate(0, 0.95, 0);
    const helmet = new T.OctahedronGeometry(0.24);
    helmet.translate(0, 2.0, 0);
    const shoulders = new T.SphereGeometry(0.62, 6, 4);
    shoulders.scale(1, 0.42, 0.45);
    shoulders.translate(0, 1.55, 0);
    const silhouette = mergeGeometries([
      torso.toNonIndexed(),
      helmet.toNonIndexed(),
      shoulders.toNonIndexed(),
    ]);
    for (let i = 0; i < 6; i++) {
      const mesh = new T.Mesh(
        silhouette,
        new T.MeshBasicMaterial({
          color: 0x72edff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.ghosts.push({ mesh, life: 0 });
    }
  }
  update(
    time: number,
    dt: number,
    base: T.Vector3,
    tip: T.Vector3,
    charge: number,
    dodging: boolean,
    root: T.Group,
  ) {
    this.points.visible=charge>0;this.halo.visible=charge>0||dodging;
    this.light.intensity = charge * 10;
    if (charge > 0) {
      for (let i = 0; i < 40; i++) {
        const t = (i * 0.6180339) % 1,
          a = time * (6 + charge * 5) + i * 2.4,
          r = 0.15 + charge * 0.14;
        this.positions[i * 3] =
          T.MathUtils.lerp(base.x, tip.x, t) + Math.cos(a) * r;
        this.positions[i * 3 + 1] =
          T.MathUtils.lerp(base.y, tip.y, t) + Math.sin(a) * r;
        this.positions[i * 3 + 2] =
          T.MathUtils.lerp(base.z, tip.z, t) + Math.sin(a * 0.8) * r;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      (this.points.material as T.ShaderMaterial).uniforms.power.value = charge;
      this.halo.position.copy(base).lerp(tip, 0.5);
      this.halo.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        tip.clone().sub(base).normalize(),
      );
      this.halo.scale.set(1, 2, 1);
      const uniforms = (this.halo.material as T.ShaderMaterial).uniforms;
      uniforms.tint.value.set(0xff0420);
      uniforms.power.value = charge;
      uniforms.time.value = time;
      this.light.position.copy(this.halo.position);
    }
    if(dodging){
      const uniforms=(this.halo.material as T.ShaderMaterial).uniforms;
      uniforms.tint.value.set(0x60dfff);uniforms.power.value=.7;uniforms.time.value=time;
      this.halo.position.copy(root.position);this.halo.position.y+=.75;
      this.halo.quaternion.copy(root.quaternion);this.halo.rotateX(Math.PI/2);this.halo.scale.set(.7,2.1,.7);
    }
    this.ghostTime -= dt;
    if (dodging && this.ghostTime <= 0) {
      const ghost = this.ghosts[this.nextGhost++ % this.ghosts.length];
      ghost.life = 0.25;
      ghost.mesh.position.copy(root.position);
      ghost.mesh.rotation.copy(root.rotation);
      ghost.mesh.rotation.x = -0.35;
      this.ghostTime = 0.05;
    }
    for (const ghost of this.ghosts) {
      ghost.life = Math.max(0, ghost.life - dt);
      ghost.mesh.visible = ghost.life > 0;
      (ghost.mesh.material as T.MeshBasicMaterial).opacity =
        (ghost.life / 0.25) * 0.2;
    }
  }
  reset() {
    this.ghosts.forEach((g) => {
      g.life = 0;
      g.mesh.visible = false;
    });
    this.points.visible = this.halo.visible = false;
    this.light.intensity = 0;
    this.ghostTime = 0;
  }
}
