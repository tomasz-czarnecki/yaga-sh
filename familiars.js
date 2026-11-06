/** Miss Yaga walks from agent to agent, broomstick in hand, telling them to work faster. Loads when the section is near. */

import { makeTalk } from './familiar-talk.js';
import { roundedCube, makeAgent } from './familiar-agent.js';

const AGENT_COLORS = ['#FFA583', '#E9C46A', '#F2A0A8', '#C9A6FF', '#6EE7A8', '#8FB4FF', '#F4A9C8'];  // one per project, in page order
const AGENT_HEIGHTS = [0.55, 0.32, 0.3, 0.62, 0.4, 0.58, 0.5];
const AGENT_FACES = ['grin', 'grumpy', 'smile', 'smile', 'snarl', 'grin', 'grumpy'];
const AGENT_SIZE = 0.075;
const MODEL = 'assets/yaga-agents.glb';
const BROOM = 'assets/broom.glb';
// where the broom's grip sits in her right-hand bone, taken from the Yaga game (play/code/tools.js)
const GRIP = { pos: [-0.0286, 0.0534, -0.0215], quat: [0.5843, 0, 0.3404, 0.7367], scale: 0.51149 };
const WALK_SPEED = 0.562;   // model units per second that the walk clip covers, so her feet don't slide
const CHECK_SECONDS = 2.4;  // how long she nods at each agent
const BESIDE = { x: 0.26, z: -0.16 };  // where she stands to check an agent: beside it on the middle's side, a little behind
const TURN_SPEED = 7;       // radians per second
const FADE = 0.25;
const FLEE = { seconds: 1.1, hop: 0.12, least: 0.45 };  // a touched agent hops at least 'least' to a new spot, then gets back to work
const ANGRY_SECONDS = 2.8;  // how long she tells you off
const CAMERA = { fov: 30, distance: 3.1, farthest: 4.6, height: 1.6, lookY: 0.55 };  // narrow stages pull back towards 'farthest'

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A soft dark ellipse for under her feet. */
function makeShadow(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

/** Shortest signed turn from angle a to angle b. */
function turnTo(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** Builds the scene into the stage's canvas and animates it while it is on screen. */
async function start(stage) {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

  const renderer = new THREE.WebGLRenderer({ canvas: stage.querySelector('canvas'), antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.05, 30);

  scene.add(new THREE.HemisphereLight('#f5e6d8', '#2a2017', 2.4));
  const key = new THREE.DirectionalLight('#ffd8b0', 3.4);
  key.position.set(-1.5, 2, 2);
  const rim = new THREE.DirectionalLight('#E0524A', 1.6);
  rim.position.set(1.8, 1.2, -1.5);
  scene.add(key, rim);

  const body = roundedCube(THREE, 0.38, 6);
  const agents = AGENT_COLORS.map((color, i) => ({ color, height: AGENT_HEIGHTS[i], phase: i * 1.3, spot: new THREE.Vector3(), blinkAt: 1 + Math.random() * 4, fleeFrom: -99, fleeUntil: -99, ...makeAgent(THREE, color, body, AGENT_FACES[i], AGENT_SIZE) }));
  // a bigger invisible target round each agent, so it is easy to tap
  const hitShape = new THREE.SphereGeometry(1.8, 8, 6), hitMat = new THREE.MeshBasicMaterial({ visible: false });
  agents.forEach((a) => { a.hit = new THREE.Mesh(hitShape, hitMat); a.root.add(a.hit); scene.add(a.root); });

  const loader = new GLTFLoader();
  const [gltf, broomGltf] = await Promise.all([loader.loadAsync(MODEL), loader.loadAsync(BROOM)]);
  const yaga = gltf.scene;
  yaga.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const grip = new THREE.Group();
  grip.position.fromArray(GRIP.pos);
  grip.quaternion.fromArray(GRIP.quat);
  grip.scale.setScalar(GRIP.scale);
  grip.add(broomGltf.scene);
  yaga.getObjectByName('mixamorigRightHand').add(grip);
  const shadow = makeShadow(THREE);
  scene.add(yaga, shadow);
  const headBone = yaga.getObjectByName('mixamorigHead');
  const head = new THREE.Vector3();
  const talk = makeTalk(THREE, stage, agents);

  const mixer = new THREE.AnimationMixer(yaga);
  const actions = Object.fromEntries(gltf.animations.map((c) => [c.name.replace(/\.\d+$/, ''), mixer.clipAction(c)]));
  let current = null;

  /** Crossfades her into the named clip. */
  function play(name) {
    const next = actions[name];
    if (next === current) return;
    next.reset().fadeIn(FADE).play();
    if (current) current.fadeOut(FADE);
    current = next;
  }

  let layoutWidth = 1;

  /** Lines the agents up across the stage's width, alternating back and front. */
  function layout(aspect, distance) {
    const halfWidth = Math.tan((CAMERA.fov / 2) * Math.PI / 180) * distance * aspect;
    const rx = halfWidth * 0.8;
    layoutWidth = rx;
    agents.forEach((a, i) => {
      a.spot.set(-rx + (2 * rx * i) / (agents.length - 1), a.height, i % 2 ? -0.45 : 0.4);
    });
  }

  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const distance = Math.min(CAMERA.farthest, Math.max(CAMERA.distance, (CAMERA.distance * 1.4) / camera.aspect));
    camera.position.set(0, CAMERA.height * (distance / CAMERA.distance), distance);
    camera.lookAt(0, CAMERA.lookY, 0);
    layout(camera.aspect, distance);
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  const her = { at: 0, step: 1, mode: 'check', until: CHECK_SECONDS, goal: new THREE.Vector3(), resume: 'check', angryFrom: -99 };
  const standAt = (a, out) => out.set(a.spot.x - (Math.sign(a.spot.x) || her.step) * BESIDE.x, 0, a.spot.z + BESIDE.z);
  standAt(agents[0], yaga.position);
  yaga.rotation.y = Math.atan2(agents[0].spot.x - yaga.position.x, agents[0].spot.z - yaga.position.z);
  play('agree');
  talk.speak(0, CHECK_SECONDS);

  /** A free spot for an agent: inside the stage, a good hop from where it is, away from her and the other agents. */
  function freeSpot(agent) {
    let best = null, bestGap = -1;
    for (let i = 0; i < 40; i++) {
      const p = new THREE.Vector3((Math.random() * 2 - 1) * layoutWidth, agent.height, -0.5 + Math.random() * 0.95);
      if (p.distanceTo(agent.spot) < Math.min(FLEE.least, layoutWidth * 0.6)) continue;
      const gap = Math.min(p.distanceTo(yaga.position) - 0.2, ...agents.filter((o) => o !== agent).map((o) => p.distanceTo(o.spot)));
      if (gap > bestGap) { best = p; bestGap = gap; }
    }
    return best;
  }

  /** Someone touched an agent: it flees to a new spot and works on there; she turns round to tell you off. */
  function disturb(agent, t) {
    if (t < agent.fleeUntil) return;
    agent.from = agent.root.position.clone().setY(agent.spot.y);
    agent.spot.copy(freeSpot(agent));
    agent.fleeFrom = t;
    agent.fleeUntil = t + FLEE.seconds;
    talk.panic(agents.indexOf(agent), t);
    if (her.mode !== 'angry') { her.resume = her.mode; her.mode = 'angry'; play('angry_01'); }
    her.angryFrom = t;
    talk.scold(t, t + ANGRY_SECONDS);
  }

  /** Walks her along the line of agents and back, stopping to nod at each one. */
  function walk(t, dt) {
    if (her.mode === 'angry') {
      yaga.rotation.y += turnTo(yaga.rotation.y, 0) * Math.min(1, dt * TURN_SPEED);
      if (t - her.angryFrom < ANGRY_SECONDS) return;
      her.mode = her.resume === 'check' ? 'check' : 'walk';
      her.until = t + 0.6;
      play(her.mode === 'check' ? 'agree' : 'walk');
    }
    const a = agents[her.at];
    if (her.mode === 'check') {
      const face = Math.atan2(a.spot.x - yaga.position.x, a.spot.z - yaga.position.z);
      yaga.rotation.y += turnTo(yaga.rotation.y, face) * Math.min(1, dt * TURN_SPEED);
      if (t < her.until) return;
      if (her.at + her.step < 0 || her.at + her.step >= agents.length) her.step = -her.step;
      her.at += her.step;
      her.mode = 'walk';
      play('walk');
    }
    standAt(agents[her.at], her.goal);
    const dx = her.goal.x - yaga.position.x, dz = her.goal.z - yaga.position.z, dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    yaga.rotation.y += turnTo(yaga.rotation.y, Math.atan2(dx, dz)) * Math.min(1, dt * TURN_SPEED);
    if (dist <= step) {
      yaga.position.copy(her.goal);
      her.mode = 'check';
      her.until = t + CHECK_SECONDS;
      play('agree');
      talk.speak(t, her.until);
      return;
    }
    yaga.position.x += (dx / dist) * step;
    yaga.position.z += (dz / dist) * step;
  }

  const ease = (x) => x * x * (3 - 2 * x);

  /** The agents hover at their spots and wiggle as they work; the one she is scolding looks startled, and a touched one hops off to its new spot. */
  function work(t) {
    const scolded = her.mode === 'check' ? agents[her.at] : null;
    for (const a of agents) {
      const fleeing = t < a.fleeUntil;
      a.setFace(fleeing || a === scolded ? 'oh' : a.face);
      if (fleeing) {
        const k = (t - a.fleeFrom) / FLEE.seconds;
        a.root.position.lerpVectors(a.from, a.spot, ease(k));
        a.root.position.y += Math.abs(Math.sin(k * Math.PI * 4)) * FLEE.hop * (1 - k);
      } else {
        a.root.position.set(a.spot.x, a.spot.y + Math.abs(Math.sin(t * 5 + a.phase)) * 0.03, a.spot.z);
      }
      a.root.lookAt(camera.position.x, a.root.position.y, camera.position.z);
      a.root.rotateZ(Math.sin(t * 7 + a.phase) * 0.12);
      const blink = t > a.blinkAt && t < a.blinkAt + 0.14;
      if (t > a.blinkAt + 0.14) a.blinkAt = t + 2 + Math.random() * 4;
      a.eyes.forEach((e) => { e.scale.y = blink ? 0.12 : 1; });
    }
  }

  const timer = new THREE.Timer();
  let visible = false;
  let raf = 0;

  function frame(now) {
    raf = visible && !reduceMotion ? requestAnimationFrame(frame) : 0;
    timer.update(now);
    const dt = reduceMotion ? 0 : Math.min(timer.getDelta(), 0.1);
    const t = reduceMotion ? 0 : timer.getElapsed();
    walk(t, dt);
    work(t);
    shadow.position.set(yaga.position.x, 0.002, yaga.position.z);
    mixer.update(dt);
    headBone.getWorldPosition(head);
    talk.update(t, camera, head.setY(head.y + 0.1), her.mode === 'check' ? agents[her.at] : null);
    renderer.render(scene, camera);
    lastT = t;
  }

  let lastT = 0;
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();

  /** The agent under the pointer, if any. */
  function agentAt(event) {
    const r = stage.getBoundingClientRect();
    pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(agents.map((a) => a.hit))[0];
    return hit && agents.find((a) => a.hit === hit.object);
  }

  if (!reduceMotion) {
    stage.addEventListener('click', (event) => { const a = agentAt(event); if (a) disturb(a, lastT); });
    stage.addEventListener('pointermove', (event) => { stage.style.cursor = agentAt(event) ? 'pointer' : ''; });
  }

  if (reduceMotion) mixer.update(actions.agree.getClip().duration * 0.5);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }).observe(stage);
  stage.classList.add('is-ready');
}

document.querySelectorAll('.familiars-stage').forEach((stage) => {
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    start(stage);
  }, { rootMargin: '400px 0px' });
  io.observe(stage);
});
