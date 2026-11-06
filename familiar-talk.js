/** Speech for the familiars scene: Miss Yaga bosses her agents around, and they mutter code back. */

const YAGA_LINES = [
  'Faster!',
  'Better!',
  'Again. Faster.',
  'Ship it!',
  'Who wrote this?',
  'Less talking, more shipping.',
  'Good. Now better.',
  'Tests first!',
  'while not done: faster()',
  'for a in agents: a.better()',
  'assert ship_it',
];

const CODE_LINES = [
  'await broom.fly()',
  'if (bug) swat(bug);',
  'ship(magic)',
  'git push --force-ish',
  'model.fit(tea_leaves)',
  'for cat in familiars:',
  'rm -rf doubts/',
  'return 42;',
  'deploy(); deploy();',
  '// TODO: sleep',
  'assert yaga.happy',
  'npm run spells',
  'SELECT * FROM cauldron;',
  'retry(faster=True)',
];

const TYPE_SPEED = 22;        // characters per second
const AGENT_TALK = 2.6;       // seconds a code bubble stays up
const YAGA_AFTER = 1.2;       // she keeps talking this long after she walks on

const pick = (list, not) => {
  const options = list.filter((s) => s !== not);
  return options[Math.floor(Math.random() * options.length)];
};

/** Adds the bubble elements to the stage and returns an update(t, …) that moves and fills them each frame. */
export function makeTalk(THREE, stage, agents) {
  const layer = document.createElement('div');
  layer.className = 'familiars-talk';
  layer.setAttribute('aria-hidden', 'true');
  stage.append(layer);

  const yaga = document.createElement('div');
  yaga.className = 'familiar-cloud';
  layer.append(yaga);
  const her = { line: '', from: -9, until: -9 };

  const bubbles = agents.map((a) => {
    const el = document.createElement('div');
    el.className = 'familiar-code';
    el.style.setProperty('--agent', a.color);
    layer.append(el);
    return { el, line: '', from: -9, until: -9, next: 1 + Math.random() * 3 };
  });

  const v = new THREE.Vector3();
  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), Math.max(lo, hi));

  /** Screen position of a world point inside the stage, in pixels. */
  function toScreen(point, camera, width, height) {
    v.copy(point).project(camera);
    return [(v.x + 1) / 2 * width, (1 - v.y) / 2 * height];
  }

  /** She says a new line; called when she reaches an agent. */
  function speak(t, until) {
    her.line = pick(YAGA_LINES, her.line);
    her.from = t;
    her.until = until + YAGA_AFTER;
  }

  /** Types, shows and places every bubble for time t. `checking` is the agent she is talking to, if any. */
  function update(t, camera, head, checking) {
    const { width, height } = stage.getBoundingClientRect();
    const most = width < 600 ? 1 : 4;

    const herOn = t < her.until;
    yaga.classList.toggle('is-on', herOn);
    if (herOn) {
      yaga.textContent = her.line.slice(0, Math.ceil((t - her.from) * TYPE_SPEED));
      const [x, y] = toScreen(head, camera, width, height);
      const left = clamp(x, 0, width - yaga.offsetWidth - 26);
      yaga.style.transform = `translate(${left.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }

    let talking = bubbles.filter((b) => t < b.until).length;
    bubbles.forEach((b, i) => {
      const a = agents[i];
      const answering = a === checking && t > her.from + 0.8 && t > b.until;
      const neighbourTalking = [bubbles[i - 1], bubbles[i + 1]].some((n) => n && t < n.until);
      if (t >= b.until && !neighbourTalking && (answering || (t >= b.next && talking < most))) {
        b.line = pick(CODE_LINES, b.line);
        b.from = t;
        b.until = t + AGENT_TALK;
        b.next = b.until + 1.5 + Math.random() * 4;
        talking++;
      }
      const on = t < b.until;
      b.el.classList.toggle('is-on', on);
      if (!on) return;
      b.el.textContent = b.line.slice(0, Math.ceil((t - b.from) * TYPE_SPEED));
      const [x, y] = toScreen(v.copy(a.root.position).setY(a.root.position.y + 0.1), camera, width, height);
      const half = b.el.offsetWidth / 2;
      b.el.style.transform = `translate(${clamp(x, half + 4, width - half - 4).toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
  }

  return { update, speak };
}
