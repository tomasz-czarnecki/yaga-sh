/** Miss Yaga walks from agent to agent, broomstick in hand, telling them to work faster. Loads when the section is near. */

import { makeTalk } from './familiar-talk.js';
import { roundedCube, makeAgent } from './familiar-agent.js';

const AGENT_COLORS = ['#FFA583', '#E9C46A', '#C9A6FF', '#6EE7A8', '#8FB4FF', '#F2A0A8', '#F4A9C8'];
const AGENT_HEIGHTS = [0.55, 0.32, 0.62, 0.4, 0.58, 0.3, 0.5];
const AGENT_FACES = ['grin', 'grumpy', 'smile', 'snarl', 'grin', 'smile', 'grumpy'];
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
  const agents = AGENT_COLORS.map((color, i) => ({ color, height: AGENT_HEIGHTS[i], phase: i * 1.3, spot: new THREE.Vector3(), blinkAt: 1 + Math.random() * 4, ...makeAgent(THREE, color, body, AGENT_FACES[i], AGENT_SIZE) }));
  agents.forEach((a) => scene.add(a.root));

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

  /** Lines the agents up across the stage's width, alternating back and front. */
  function layout(aspect, distance) {
    const halfWidth = Math.tan((CAMERA.fov / 2) * Math.PI / 180) * distance * aspect;
    const rx = halfWidth * 0.8;
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

  const her = { at: 0, step: 1, mode: 'check', until: CHECK_SECONDS, goal: new THREE.Vector3() };
  const standAt = (a, out) => out.set(a.spot.x - (Math.sign(a.spot.x) || her.step) * BESIDE.x, 0, a.spot.z + BESIDE.z);
  standAt(agents[0], yaga.position);
  yaga.rotation.y = Math.atan2(agents[0].spot.x - yaga.position.x, agents[0].spot.z - yaga.position.z);
  play('agree');
  talk.speak(0, CHECK_SECONDS);

  /** Walks her along the line of agents and back, stopping to nod at each one. */
  function walk(t, dt) {
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

  /** The agents hover at their spots and wiggle as they work; the one she is scolding looks startled. */
  function work(t) {
    const scolded = her.mode === 'check' ? agents[her.at] : null;
    for (const a of agents) {
      a.setFace(a === scolded ? 'oh' : a.face);
      a.root.position.set(a.spot.x, a.spot.y + Math.abs(Math.sin(t * 5 + a.phase)) * 0.03, a.spot.z);
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
