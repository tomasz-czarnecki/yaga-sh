/** Miss Yaga directing her agents, one per project, while her broomstick flies loops around her. Loads when the section is near. */

const AGENTS = [
  { color: '#FFA583', radius: 0.62, height: 0.78, speed: 0.22, phase: 0.0 },
  { color: '#E9C46A', radius: 0.72, height: 0.30, speed: 0.17, phase: 0.9 },
  { color: '#C9A6FF', radius: 0.58, height: 0.55, speed: 0.26, phase: 1.8 },
  { color: '#6EE7A8', radius: 0.78, height: 0.62, speed: 0.15, phase: 2.7 },
  { color: '#8FB4FF', radius: 0.66, height: 0.18, speed: 0.20, phase: 3.6 },
  { color: '#F2A0A8', radius: 0.74, height: 0.92, speed: 0.18, phase: 4.5 },
  { color: '#F4A9C8', radius: 0.60, height: 0.40, speed: 0.24, phase: 5.4 },
];
const AGENT_SIZE = 0.055;
const MODEL = 'assets/yaga-agents.glb';
const BROOM = { model: 'assets/broom.glb', scale: 0.3, radius: 0.9, height: 0.62, speed: 0.11, bank: 0.35 };
const MOVE = 'agree.001';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A cube 2 across with rounded corners: roundness 0 is sharp, 1 is a ball. */
function roundedCube(THREE, roundness, segments) {
  const g = new THREE.BoxGeometry(2, 2, 2, segments, segments, segments);
  const pos = g.attributes.position, nor = g.attributes.normal, inner = 1 - roundness;
  const p = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    c.set(Math.min(Math.max(p.x, -inner), inner), Math.min(Math.max(p.y, -inner), inner), Math.min(Math.max(p.z, -inner), inner));
    n.subVectors(p, c).normalize();
    p.copy(c).addScaledVector(n, roundness);
    pos.setXYZ(i, p.x, p.y, p.z);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

/** One agent: a soft coloured box with two eyes, like the black box from the Yaga game. */
function makeAgent(THREE, color, body, eyeWhite, eyeDark) {
  const root = new THREE.Group();
  const box = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
  root.add(box);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group();
    eye.position.set(side * 0.42, 0.2, 0.86);
    const white = new THREE.Mesh(eyeWhite.geometry, eyeWhite.material);
    const pupil = new THREE.Mesh(eyeDark.geometry, eyeDark.material);
    pupil.position.set(0, -0.02, 0.2);
    eye.add(white, pupil);
    root.add(eye);
    return eye;
  });
  root.scale.setScalar(AGENT_SIZE);
  return { root, eyes, blinkAt: 1 + Math.random() * 4 };
}

/** Builds the scene into the stage's canvas and animates it while it is on screen. */
async function start(stage) {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const canvas = stage.querySelector('canvas');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  camera.position.set(0, 0.62, 2.6);
  camera.lookAt(0, 0.48, 0);

  scene.add(new THREE.HemisphereLight('#f5e6d8', '#2a2017', 2.4));
  const key = new THREE.DirectionalLight('#ffd8b0', 3.4);
  key.position.set(-1.5, 2, 2);
  const rim = new THREE.DirectionalLight('#E0524A', 1.6);
  rim.position.set(1.8, 1.2, -1.5);
  scene.add(key, rim);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const sc = shadowCanvas.getContext('2d');
  const grad = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sc.fillStyle = grad;
  sc.fillRect(0, 0, 64, 64);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const body = roundedCube(THREE, 0.38, 6);
  const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), new THREE.MeshStandardMaterial({ color: '#eeedf3', roughness: 0.25 }));
  const eyeDark = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: '#030305', roughness: 0.2 }));
  const agents = AGENTS.map((a) => ({ ...a, ...makeAgent(THREE, a.color, body, eyeWhite, eyeDark) }));
  agents.forEach((a) => scene.add(a.root));

  const loader = new GLTFLoader();
  const [gltf, broomGltf] = await Promise.all([loader.loadAsync(MODEL), loader.loadAsync(BROOM.model)]);
  const broom = new THREE.Group();
  broomGltf.scene.rotation.x = Math.PI / 2;
  broomGltf.scene.scale.setScalar(BROOM.scale);
  broom.add(broomGltf.scene);
  scene.add(broom);
  const yaga = gltf.scene;
  yaga.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  scene.add(yaga);
  const mixer = new THREE.AnimationMixer(yaga);
  const move = THREE.AnimationClip.findByName(gltf.animations, MOVE);
  mixer.clipAction(move).play();

  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  const ahead = new THREE.Vector3();

  /** Where the broom is at time t: a slow loop around her, bobbing up and down. */
  function broomAt(t, out) {
    const angle = t * BROOM.speed * Math.PI * 2;
    return out.set(Math.cos(angle) * BROOM.radius, BROOM.height + Math.sin(t * 1.3) * 0.08, Math.sin(angle) * BROOM.radius * 0.6);
  }

  function place(t) {
    broomAt(t, broom.position);
    broom.lookAt(broomAt(t + 0.05, ahead));
    broom.rotateZ(-BROOM.bank);
    for (const a of agents) {
      const angle = a.phase + t * a.speed * Math.PI * 2;
      a.root.position.set(Math.cos(angle) * a.radius, a.height + Math.sin(t * 1.7 + a.phase) * 0.03, Math.sin(angle) * a.radius * 0.6);
      a.root.lookAt(camera.position.x, a.root.position.y, camera.position.z);
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
    mixer.update(reduceMotion ? 0 : timer.getDelta());
    place(reduceMotion ? 0 : timer.getElapsed());
    renderer.render(scene, camera);
  }

  if (reduceMotion) mixer.setTime(move.duration * 0.5);
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
