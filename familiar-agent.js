/** One agent for the familiars scene: a soft coloured box with eyes and a face, after the black box in the Yaga game. */

const INK = '#22181c';
const TEETH = '#f4f1ea';
// faces from the Yaga game's black box: mouth shape, eye size, and brow tilt (positive is cross)
export const FACES = {
  grin: { eyes: 1, brow: null },
  smile: { eyes: 1, brow: null },
  oh: { eyes: 1.18, brow: -0.25 },
  grumpy: { eyes: 0.9, brow: 0.42 },
  snarl: { eyes: 0.85, brow: 0.5 },
};

/** A cube 2 across with rounded corners: roundness 0 is sharp, 1 is a ball. */
export function roundedCube(THREE, roundness, segments) {
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

/** A crescent mouth: top edge y = T0 + H·k·u², bottom edge y = T0 + H·(−1 + (1+k)·u²), for u from −1 to 1. */
function crescent(THREE, { w, H, k, T0 }, teeth) {
  const top = (u) => T0 + H * k * u * u, bottom = (u) => T0 + H * (-1 + (1 + k) * u * u);
  const outline = (lower) => {
    const s = new THREE.Shape();
    for (let i = 0; i <= 24; i++) { const u = -1 + i / 12; s[i ? 'lineTo' : 'moveTo'](u * w, top(u)); }
    for (let i = 24; i >= 0; i--) { const u = -1 + i / 12; s.lineTo(u * w, lower(u)); }
    return s;
  };
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(outline(bottom)), new THREE.MeshBasicMaterial({ color: INK })));
  const band = new THREE.Mesh(new THREE.ShapeGeometry(outline((u) => Math.max(bottom(u), top(u) - teeth))), new THREE.MeshStandardMaterial({ color: TEETH, roughness: 0.4 }));
  band.position.z = 0.01;
  g.add(band);
  return g;
}

/** A drawn line for a mouth, through the given points. */
function line(THREE, points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius, 8), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5 }));
}

/** All five mouths, each hidden until its face is shown. */
function makeMouths(THREE) {
  const smile = [];
  for (let i = 0; i <= 8; i++) { const x = -0.44 + i * 0.11; smile.push([x, -0.045 + 0.12 * (x / 0.44) ** 2]); }
  const oh = new THREE.Group();
  oh.add(new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ color: INK })));
  return {
    grin: crescent(THREE, { w: 0.5, H: 0.4, k: 0.2, T0: 0.16 }, 0.11),
    smile: line(THREE, smile, 0.045),
    oh,
    grumpy: line(THREE, [[-0.44, 0.0], [-0.27, -0.08], [-0.1, 0.005], [0.08, -0.09], [0.26, 0.01], [0.42, 0.08]], 0.045),
    snarl: crescent(THREE, { w: 0.46, H: 0.3, k: -0.55, T0: 0.18 }, 0.14),
  };
}

/** Builds an agent of the given colour showing `face`; returns its root, eyes and a setFace(name). */
export function makeAgent(THREE, color, body, face, size) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color, roughness: 0.55 })));
  const white = new THREE.MeshStandardMaterial({ color: '#eeedf3', roughness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: '#030305', roughness: 0.2 });
  const eyeGeo = new THREE.SphereGeometry(0.28, 20, 14), pupilGeo = new THREE.SphereGeometry(0.14, 16, 12);
  const browGeo = new THREE.CapsuleGeometry(0.055, 0.32, 4, 10);
  const browMat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5 });

  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group();   // blinks
    const ball = new THREE.Group();  // sized by the face
    eye.position.set(side * 0.42, 0.22, 0.86);
    const pupil = new THREE.Mesh(pupilGeo, dark);
    pupil.position.set(0, -0.02, 0.19);
    ball.add(new THREE.Mesh(eyeGeo, white), pupil);
    eye.add(ball);
    const brow = new THREE.Mesh(browGeo, browMat);
    brow.rotation.z = Math.PI / 2;
    brow.position.set(side * 0.42, 0.62, 0.98);
    root.add(eye, brow);
    return { eye, ball, brow, side };
  });

  const mouths = makeMouths(THREE);
  for (const m of Object.values(mouths)) {
    m.position.set(0, -0.4, 1.005);
    m.visible = false;
    root.add(m);
  }

  let current = null;
  function setFace(name) {
    if (name === current) return;
    current = name;
    const f = FACES[name];
    for (const [key, m] of Object.entries(mouths)) m.visible = key === name;
    for (const { ball, brow, side } of eyes) {
      ball.scale.setScalar(f.eyes);
      brow.visible = f.brow !== null;
      if (f.brow !== null) brow.rotation.z = Math.PI / 2 + side * f.brow;
    }
  }
  setFace(face);
  root.scale.setScalar(size);
  return { root, eyes: eyes.map((e) => e.eye), setFace, face };
}
