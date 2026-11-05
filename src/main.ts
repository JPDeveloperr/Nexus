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

type Mode = "menu" | "playing" | "paused" | "defeat" | "victory";
type EnemyState =
  | "patrol"
  | "chase"
  | "windup"
  | "attack"
  | "recover"
  | "hurt"
  | "dead";
type Enemy = {
  body: Warrior;
  hp: number;
  state: EnemyState;
  timer: number;
  hurt: number;
  id: number;
  attackHit: boolean;
  telegraph: T.Mesh;
  origin: T.Vector3;
};
const $ = <E extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<E>(s)!;
$("#interface").innerHTML = `
  <header><a class="brand" href="#" aria-label="Nexus"><span class="sigil">⟐</span><span>NEXUS<small>SHATTERED REALMS</small></span></a><div class="chapter"><span class="status-dot"></span> FRAGMENTO 01 <i></i> TEMPLO DAS RUÍNAS SUSPENSAS</div><button id="pause" class="quiet">II <span>PAUSAR</span> <kbd>ESC</kbd></button></header>
  <section id="mission" class="hidden"><span class="eyebrow">ECOS DE UM MUNDO PARTIDO</span><h2>O último santuário</h2><p id="objective">Derrote as sentinelas corrompidas <b>0 / 3</b></p><div class="objective-line"></div><p class="seed">◇ SEMENTE <span id="seed"></span></p></section>
  <aside id="zone"><span class="zone-diamond">◇</span><div>RUÍNAS SUSPENSAS<small>Santuário do limiar</small></div></aside>
  <div id="crosshair">＋</div><div id="damage-flash"></div><div class="vignette"></div>
  <div id="toast" role="status"></div>
  <footer id="hud" class="hidden"><div class="vitals"><div class="identity"><span class="portrait">⟐</span><div><span class="eyebrow">ANDARILHO DIMENSIONAL</span><h3>Kaeron <small>01</small></h3></div></div><div class="bar-label"><span>VITALIDADE</span><span id="hp-text">100 / 100</span></div><div class="bar health"><div id="hp"></div></div><div class="bar-label energy-label"><span>ENERGIA</span><span id="energy-text">100 / 100</span></div><div class="bar energy"><div id="energy"></div></div></div><div class="combat"><button id="attack-button" title="Ataque leve — clique esquerdo"><span class="ability-icon">╱</span><span>CORTE DO LIMIAR</span><kbd>CLIQUE ESQUERDO</kbd><div id="cooldown"></div></button><div class="future"><span>◇</span><small>OUTROS PODERES<br>EM BREVE</small></div></div><div class="hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVER</span><span>⌖ MOUSE PARA MIRAR</span><span><kbd>ESC</kbd> PAUSAR</span></div></footer>
  <div id="overlay"><div class="menu-copy"><span class="eyebrow">UMA JORNADA ENTRE FRAGMENTOS</span><h1>NEXUS<span>SHATTERED REALMS</span></h1><div class="gold-rule"></div><p class="intro">O mundo se partiu.<br>A última centelha ainda resiste.</p><p class="description">Atravesse as ruínas de um reino suspenso no vazio.<br>Enfrente a corrupção. Restaure o que restou.</p><button id="start" class="primary">INICIAR JORNADA <span>→</span></button><div class="menu-controls"><span>WASD <small>MOVER</small></span><span>MOUSE <small>MIRAR E ATACAR</small></span></div><label class="quality-label">QUALIDADE GRÁFICA <select id="quality"><option value="low">Baixa</option><option value="medium" selected>Média</option><option value="high">Alta</option></select></label></div><div class="menu-bottom"><span>FASE 1 · FUNDAÇÃO JOGÁVEL</span><span>UM MUNDO CONSTRUÍDO POR MATEMÁTICA</span></div></div>
  <div id="dialog" class="hidden" role="dialog" aria-modal="true"><div><span class="eyebrow" id="dialog-kicker"></span><h1 id="dialog-title"></h1><p id="dialog-copy"></p><button id="resume" class="primary"></button><button id="menu-button" class="secondary">VOLTAR AO MENU</button></div></div>
  <div id="metrics"></div>`;

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
const enemies: Enemy[] = [];
for (let i = 0; i < 3; i++) {
  const body = new Warrior(true);
  body.root.scale.setScalar(1.03);
  scene.add(body.root);
  const a = (i * Math.PI * 2) / 3;
  const origin = new T.Vector3(Math.sin(a) * 6, 0, Math.cos(a) * 6 - 3);
  body.root.position.copy(origin);
  const telegraph = mesh(
    new T.RingGeometry(0.2, 2.65, 48, 1, 0, Math.PI * 2),
    new T.MeshBasicMaterial({
      color: 0xf94566,
      transparent: true,
      opacity: 0.0,
      side: T.DoubleSide,
      depthWrite: false,
    }),
    scene,
  );
  telegraph.rotation.x = -Math.PI / 2;
  telegraph.visible = false;
  enemies.push({
    body,
    hp: 100,
    state: "patrol",
    timer: 0,
    hurt: 0,
    id: i,
    attackHit: false,
    telegraph,
    origin,
  });
}
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
const slash = mesh(
  new T.RingGeometry(1, 2.7, 40, 1, 0.1, 2.2),
  new T.MeshBasicMaterial({
    color: 0x83ffff,
    side: T.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: T.AdditiveBlending,
  }),
  scene,
);
slash.rotation.x = -Math.PI / 2;
slash.visible = false;
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
  attackHit = false,
  hurt = 0,
  shake = 0,
  time = 0,
  kills = 0;
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
  if(next === "playing") renderer.domElement.focus({preventScroll:true});
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
          : "As três sentinelas caíram. Você concluiu a Fase 1.";
    $("#resume").textContent =
      next === "paused" ? "CONTINUAR JORNADA" : "RECOMEÇAR NO LIMIAR";
    $("#resume").focus();
  }
}
function reset() {
  health = 100;
  energy = 100;
  attack = 0;
  hurt = 0;
  shake = 0;
  kills = 0;
  player.root.position.set(0, 0, 5);
  player.root.rotation.set(0, Math.PI, 0);
  cameraTarget.set(0, 0, -1);
  enemies.forEach((e) => {
    e.hp = 100;
    e.state = "patrol";
    e.timer = 0;
    e.hurt = 0;
    e.body.root.visible = true;
    e.body.root.position.copy(e.origin);
    e.body.root.rotation.set(0, 0, 0);
    e.telegraph.visible = false;
  });
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
    `Derrote as sentinelas corrompidas <b>${kills} / 3</b>`;
  $("#cooldown").style.transform = `scaleX(${attack / ATTACK.duration})`;
}
function startAttack() {
  if (mode !== "playing" || attack > 0 || hurt > 0.22) return;
  if (energy < ATTACK.cost) {
    notify("A energia precisa se recompor");
    return;
  }
  if (mouseAiming)
    player.root.rotation.y = Math.atan2(
      aim.x - player.root.position.x,
      aim.z - player.root.position.z,
    );
  attack = ATTACK.duration;
  attackHit = false;
  energy -= ATTACK.cost;
  sound(260, 0.16, 0.015);
}
$("#start").onclick = () => {
  try { audio ??= new AudioContext(); void audio.resume().catch(()=>{}); } catch { /* Audio must never block play. */ }
  reset();
};
$("#resume").onclick = () => (mode === "paused" ? setMode("playing") : reset());
$("#menu-button").onclick = () => setMode("menu");
$("#pause").onclick = () => {
  if (mode === "playing") setMode("paused");
  else if (mode === "paused") setMode("playing");
};
$("#attack-button").onclick = startAttack;
window.addEventListener("blur", () => { if(mode === "playing") setMode("paused"); });
document.addEventListener("visibilitychange", () => { if(document.hidden && mode === "playing") setMode("paused"); });
function applyQuality(value: string) {
  const high = value === "high",
    low = value === "low";
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : high ? 2 : 1.5));
  renderer.shadowMap.enabled = !low;
  bloom.enabled = !low;
  bloom.strength = high ? 0.55 : 0.42;
  resize();
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
function updateEnemy(e: Enemy, dt: number) {
  const p = e.body.root.position;
  e.timer += dt;
  e.hurt = Math.max(0, e.hurt - dt);
  if (e.state === "dead") {
    e.telegraph.visible = false;
    e.body.animate(time, 0, 0, 0, true);
    p.y -= dt * 0.25;
    if (e.timer > 2) e.body.root.visible = false;
    return;
  }
  const distance = p.distanceTo(player.root.position);
  let speed = 0;
  if (e.state === "patrol") {
    if (distance < 8.5) {
      e.state = "chase";
      e.timer = 0;
    } else {
      const dest = e.origin
        .clone()
        .add(
          new T.Vector3(
            Math.sin(time * 0.4 + e.id) * 1.2,
            0,
            Math.cos(time * 0.4 + e.id) * 1.2,
          ),
        );
      moveEnemy(dest, 0.7);
    }
  } else if (e.state === "chase") {
    if (distance < 2.25) {
      e.state = "windup";
      e.timer = 0;
      e.attackHit = false;
    } else moveEnemy(player.root.position, 1.85);
  } else if (e.state === "windup") {
    e.body.root.rotation.y = dampAngle(
      e.body.root.rotation.y,
      Math.atan2(player.root.position.x - p.x, player.root.position.z - p.z),
      8,
      dt,
    );
    e.telegraph.visible = true;
    e.telegraph.position.set(p.x, 0.065, p.z);
    e.telegraph.scale.setScalar(0.65 + e.timer * 0.4);
    (e.telegraph.material as T.MeshBasicMaterial).opacity =
      0.07 + e.timer * 0.18;
    if (e.timer > 0.8) {
      e.state = "attack";
      e.timer = 0;
      e.telegraph.visible = false;
    }
  } else if (e.state === "attack") {
    if (e.timer > 0.17 && !e.attackHit) {
      e.attackHit = true;
      if (
        hurt === 0 &&
        insideStrike(p, e.body.root.rotation.y, player.root.position, 2.8)
      ) {
        health = Math.max(0, health - 14);
        hurt = 0.6;
        shake = 0.16;
        burst(player.root.position, true);
        sound(80, 0.2, 0.04);
        notify("Impacto recebido · Afaste-se do círculo vermelho");
        if (health === 0) setMode("defeat");
      }
    }
    if (e.timer > 0.52) {
      e.state = "recover";
      e.timer = 0;
    }
  } else if (e.state === "recover" && e.timer > 0.9) {
    e.state = "chase";
    e.timer = 0;
  } else if (e.state === "hurt" && e.timer > 0.4) {
    e.state = "chase";
    e.timer = 0;
  }
  e.body.animate(
    time + e.id,
    speed,
    e.state === "attack" ? 0.52 - e.timer : 0,
    e.hurt,
  );
  function moveEnemy(dest: T.Vector3, s: number) {
    const dx = dest.x - p.x,
      dz = dest.z - p.z,
      length = Math.hypot(dx, dz);
    if (length < 0.1) return;
    const next = moveCircle(
      p,
      { x: (dx / length) * s * dt, z: (dz / length) * s * dt },
      0.5,
      temple.obstacles
        .concat(
          enemies
            .filter((other) => other !== e && other.state !== "dead")
            .map((other) => ({
              x: other.body.root.position.x,
              z: other.body.root.position.z,
              radius: 0.5,
            })),
        )
        .concat([
          {
            x: player.root.position.x,
            z: player.root.position.z,
            radius: PLAYER_RADIUS,
          },
        ]),
    );
    p.x = next.x;
    p.z = next.z;
    e.body.root.rotation.y = dampAngle(
      e.body.root.rotation.y,
      Math.atan2(dx, dz),
      9,
      dt,
    );
    speed = s;
  }
}
function simulate(dt:number) {
  if (mode === "playing" || mode === "menu") time += dt;
  if (mode === "playing") {
    ray.setFromCamera(pointer, camera);
    ray.ray.intersectPlane(plane, aim);
    const dx=controls.move.x, dz=controls.move.y;
    // Project keyboard axes onto the isometric ground plane: W always moves up-screen.
    const forward = new T.Vector3(
        -cameraOffset.x,
        0,
        -cameraOffset.z,
      ).normalize(),
      right = new T.Vector3(-forward.z, 0, forward.x);
    const direction = right.multiplyScalar(dx).add(forward.multiplyScalar(-dz));
    if (direction.lengthSq() > 1) direction.normalize();
    const speed = attack > 0 ? 1.65 : 4.6;
    const blockers = temple.obstacles.concat(
      enemies
        .filter((e) => e.state !== "dead")
        .map((e) => ({
          x: e.body.root.position.x,
          z: e.body.root.position.z,
          radius: 0.5,
        })),
    );
    const smoothing=1-Math.exp(-14*dt);
    velocity.lerp(new T.Vector2(direction.x*speed,direction.z*speed),smoothing);
    const before=player.root.position.clone();
    const next = moveCircle(
      player.root.position,
      { x: velocity.x * dt, z: velocity.y * dt },
      PLAYER_RADIUS,
      blockers,
    );
    player.root.position.x = next.x;
    player.root.position.z = next.z;
    actualSpeed=Math.hypot(next.x-before.x,next.z-before.z)/dt;
    if (attack === 0) {
      if (mouseAiming)
        player.root.rotation.y = dampAngle(
          player.root.rotation.y,
          Math.atan2(aim.x - next.x, aim.z - next.z),
          18,
          dt,
        );
      else if (direction.lengthSq() > 0.01)
        player.root.rotation.y = dampAngle(
          player.root.rotation.y,
          Math.atan2(direction.x, direction.z),
          14,
          dt,
        );
    }
    if (attack > 0) {
      const elapsed = ATTACK.duration - attack;
      if (elapsed >= ATTACK.impact && !attackHit) {
        attackHit = true;
        for (const e of enemies)
          if (
            e.state !== "dead" &&
            insideStrike(
              player.root.position,
              player.root.rotation.y,
              e.body.root.position,
            )
          ) {
            e.hp = Math.max(0, e.hp - ATTACK.damage);
            e.hurt = 0.35;
            e.timer = 0;
            e.telegraph.visible = false;
            e.state = e.hp === 0 ? "dead" : "hurt";
            burst(e.body.root.position);
            shake = 0.1;
            sound(e.hp === 0 ? 120 : 180, 0.16, 0.04);
            const push = new T.Vector3()
              .subVectors(e.body.root.position, player.root.position)
              .normalize()
              .multiplyScalar(0.5);
            const moved = moveCircle(
              e.body.root.position,
              push,
              0.5,
              temple.obstacles,
            );
            e.body.root.position.x = moved.x;
            e.body.root.position.z = moved.z;
            if (e.hp === 0) {
              kills++;
              notify(`Sentinela dissipada · ${kills} de 3`);
            }
          }
        if (kills === 3) setMode("victory");
      }
      slash.visible = elapsed > 0.12 && elapsed < 0.37;
      slash.position.copy(player.root.position);
      slash.position.y = 0.9;
      slash.rotation.z = -player.root.rotation.y + elapsed * 8;
      (slash.material as T.MeshBasicMaterial).opacity =
        Math.max(0, Math.sin(((elapsed - 0.12) / 0.25) * Math.PI)) * 0.65;
      attack = Math.max(0, attack - dt);
    } else slash.visible = false;
    hurt = Math.max(0, hurt - dt);
    energy = Math.min(100, energy + dt * 15);
    player.animate(time, actualSpeed, attack, hurt);
    for (const e of enemies) {
      if (mode !== "playing") break;
      updateEnemy(e, dt);
    }
    const follow = player.root.position.clone().multiplyScalar(0.33);
    follow.z -= 1.5;
    cameraTarget.lerp(follow, 1 - Math.exp(-3 * dt));
    updateHUD();
  } else if (mode === "menu") {
    player.animate(time, 0, 0, 0);
    enemies.forEach((e) => e.body.animate(time + e.id, 0, 0, 0));
    cameraTarget.lerp(new T.Vector3(-2, 0, -1.5), 0.02);
    slash.visible = false;
  }
}
let previous=performance.now();
let frameTimes:number[]=[];
let metricsTimer=0;
function frame(now:number) {
  requestAnimationFrame(frame);
  const frameMs=Math.max(0,now-previous);previous=now;
  const dt=Math.min(frameMs/1000,.5);
  controls=input.read();
  pointer.set(controls.pointer.x,controls.pointer.y);mouseAiming=controls.mouseAim;
  if(controls.pause){if(mode==='playing')setMode('paused');else if(mode==='paused')setMode('playing');}
  if(controls.attack)startAttack();
  if(mode==='playing'||mode==='menu')clock.advance(dt,simulate);else clock.reset();
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
  renderer.info.reset();
  composer.render();
  if (frameMs > 0) frameTimes.push(frameMs);
  if (frameTimes.length > 180) frameTimes.shift();
  metricsTimer += dt;
  if (metricsTimer > 1) {
    metricsTimer = 0;
    $("#metrics").textContent =
      `${Math.round(1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length))} FPS · ${renderer.info.render.calls} DC`;
  }
}
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
        actualSpeed, velocity:velocity.toArray(), input:controls, focus:document.activeElement?.tagName,
        player: {
          x: player.root.position.x,
          z: player.root.position.z,
          facing: player.root.rotation.y,
        },
        enemies: enemies.map((e) => ({
          hp: e.hp,
          state: e.state,
          timer: e.timer,
          x: e.body.root.position.x,
          z: e.body.root.position.z,
        })),
        camera: camera.position.toArray(),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        frames: frameTimes.slice(),
        geometries: renderer.info.memory.geometries,
      }),
      place: (x: number, z: number) => {
        const p = moveCircle(
          { x, z },
          { x: 0, z: 0 },
          PLAYER_RADIUS,
          temple.obstacles,
        );
        player.root.position.set(p.x, 0, p.z); velocity.set(0,0);
      },
      face: (a: number) => {
        mouseAiming = false; input.clearAim();
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
  composer.dispose();
  renderer.dispose();
  void audio?.close();
});
