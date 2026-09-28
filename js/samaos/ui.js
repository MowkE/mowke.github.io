// ui.js
// The samaOS desktop: menu bar, dock, windows, and five apps.
// The wallpaper is drawn by the scheduler itself: each frame adds a column
// split between the processes that got CPU time, in their colours.

import { makeFS, makeKernel, resolve } from './kernel.js';
import { makeShell } from './shell.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const ICONS = {
  terminal: '<svg viewBox="0 0 24 24"><path d="M6 8l4 4-4 4M12 17h6" /></svg>',
  editor: '<svg viewBox="0 0 24 24"><path d="M9 6l-5 6 5 6M15 6l5 6-5 6" /></svg>',
  files: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>',
  monitor: '<svg viewBox="0 0 24 24"><path d="M5 19V13M10 19V6M15 19V10M20 19V15" /></svg>',
  display: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 12h16M12 4v16" /></svg>',
  sims: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6" /><ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-25 12 12)" /><circle cx="19.4" cy="8.6" r="1.2" /></svg>',
  resume: '<svg viewBox="0 0 24 24"><path d="M6.5 3.5h7l4 4v13h-11z M13.5 3.5v4h4 M9 12h6 M9 15.5h6" /></svg>',
};
const NAMES = { resume: 'Résumé', sims: 'Orrery', terminal: 'Terminal', editor: 'Editor', files: 'Files', monitor: 'Monitor', display: 'Display' };

export function boot(root) {
  const fs = makeFS(), kernel = makeKernel(fs);
  const os = { fs, kernel, apps: {}, open };
  const $ = s => root.querySelector(s);
  const desk = $('#desk'), dock = $('#dock');
  const wins = [];
  let z = 10;

  // ---------------------------------------------------------------- dock
  for (const key of Object.keys(NAMES)) {
    const b = h(`<button class="dock-app" data-app="${key}" aria-label="Open ${NAMES[key]}"><span class="tile">${ICONS[key]}</span><span class="tip">${NAMES[key]}</span><i class="dot"></i></button>`);
    b.addEventListener('click', () => open(key, { fromDock: true }));
    dock.appendChild(b);
  }
  const refreshDock = () => dock.querySelectorAll('.dock-app').forEach(b => b.classList.toggle('running', wins.some(w => w.app === b.dataset.app)));

  // ---------------------------------------------------------------- windows
  function open(app, opts = {}) {
    // one of each, except terminals and editors on different files
    // the dock brings back what's already open; `open terminal` and edit <file> can make more
    let existing = null;
    if (app === 'editor') existing = wins.find(w => w.app === 'editor' && (!opts.path || opts.fromDock || w.path === opts.path));
    else if (app === 'terminal') existing = opts.fromDock ? wins.find(w => w.app === 'terminal') : null;
    else existing = wins.find(w => w.app === app);
    if (existing) { if (opts.path && existing.load) existing.load(opts.path); focus(existing); unminimize(existing); return existing; }
    const size = { terminal: [620, 420], editor: [700, 520], files: [520, 420], monitor: [620, 440], display: [440, 520], resume: [470, 620], sims: [940, 620] }[app];
    const W = Math.min(size[0], innerWidth - 24), H = Math.min(size[1], innerHeight - 140);
    // each app has a home on the desk; extra terminals and editors cascade from it
    const home = { terminal: [0.05, 0.1], editor: [0.28, 0.14], files: [0.08, 0.3], monitor: [0.5, 0.22], display: [0.62, 0.3], resume: [0.97, 0.05], sims: [0.14, 0.06] }[app];
    const same = wins.filter(o => o.app === app).length;
    const x = Math.max(12, Math.min(innerWidth - W - 12, home[0] * innerWidth - (home[0] > 0.5 ? W : 0) + same * 30));
    const y = Math.max(44, Math.min(innerHeight - H - 100, 34 + home[1] * innerHeight + same * 28));
    const el = h(`<section class="win" role="dialog" aria-label="${NAMES[app]}" style="left:${x}px;top:${y}px;width:${W}px;height:${H}px">
      <header class="bar"><button class="light close" aria-label="Close ${NAMES[app]}"><i></i></button><button class="light min" aria-label="Minimize ${NAMES[app]}"><i></i></button><span class="title">${NAMES[app]}</span></header>
      <div class="body"></div><span class="grip" aria-hidden="true"></span></section>`);
    desk.appendChild(el);
    const w = { app, el, body: el.querySelector('.body'), title: el.querySelector('.title'), path: opts.path };
    wins.push(w);
    os.apps[app].mount(w, opts);
    el.addEventListener('pointerdown', () => focus(w), true);
    el.querySelector('.close').addEventListener('click', e => { e.stopPropagation(); close(w); });
    el.querySelector('.min').addEventListener('click', e => { e.stopPropagation(); minimize(w); });
    drag(w, el.querySelector('.bar'), false); drag(w, el.querySelector('.grip'), true);
    focus(w);
    fromDock(w, true);
    refreshDock();
    return w;
  }
  const dockRect = app => dock.querySelector(`[data-app="${app}"] .tile`).getBoundingClientRect();
  // windows grow out of their dock icon and shrink back into it
  function fromDock(w, entering) {
    if (REDUCED) { if (!entering) w.el.remove(); return Promise.resolve(); }
    const r = w.el.getBoundingClientRect(), d = dockRect(w.app);
    const tf = `translate(${d.left + d.width / 2 - (r.left + r.width / 2)}px, ${d.top + d.height / 2 - (r.top + r.height / 2)}px) scale(${d.width / r.width}, ${d.height / r.height})`;
    const frames = [{ transform: tf, opacity: 0.2 }, { transform: 'none', opacity: 1 }];
    return w.el.animate(entering ? frames : frames.reverse(), { duration: entering ? 420 : 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'both' }).finished;
  }
  function focus(w) {
    wins.forEach(o => o.el.classList.toggle('focused', o === w));
    w.el.style.zIndex = ++z;
    $('#app-name').textContent = NAMES[w.app];
    w.onFocus && w.onFocus();
  }
  async function close(w) {
    w.onClose && w.onClose();
    await fromDock(w, false);
    w.el.remove(); wins.splice(wins.indexOf(w), 1); refreshDock();
    const top = wins.filter(o => !o.min).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
    if (top) focus(top); else $('#app-name').textContent = 'Desktop';
  }
  async function minimize(w) { await fromDock(w, false); w.el.hidden = true; w.min = true; w.el.getAnimations().forEach(a => a.cancel()); }
  function unminimize(w) { if (!w.min) return; w.min = false; w.el.hidden = false; fromDock(w, true); }
  function drag(w, handle, resize) {
    handle.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || innerWidth < 700) return;
      e.preventDefault(); handle.setPointerCapture(e.pointerId);
      const r = w.el.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      const move = ev => {
        if (resize) { w.el.style.width = `${Math.max(320, r.width + ev.clientX - sx)}px`; w.el.style.height = `${Math.max(220, r.height + ev.clientY - sy)}px`; w.onResize && w.onResize(); }
        else { w.el.style.left = `${Math.min(innerWidth - 80, Math.max(-r.width + 80, r.left + ev.clientX - sx))}px`; w.el.style.top = `${Math.max(34, Math.min(innerHeight - 60, r.top + ev.clientY - sy))}px`; }
      };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
  }

  // ---------------------------------------------------------------- Terminal
  os.apps.terminal = {
    mount(w) {
      w.body.innerHTML = `<div class="term"><div class="t-out" aria-live="polite"></div><label class="t-in"><span class="t-pr"></span><input spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Command" /></label></div>`;
      const outEl = w.body.querySelector('.t-out'), input = w.body.querySelector('input'), pr = w.body.querySelector('.t-pr'), line = w.body.querySelector('.t-in');
      const term = {
        write(s, cls = '') { const p = document.createElement('p'); if (cls) p.className = cls; p.textContent = s === '' ? ' ' : s; outEl.appendChild(p); while (outEl.children.length > 600) outEl.firstChild.remove(); outEl.scrollTop = outEl.scrollHeight; },
        clear() { outEl.innerHTML = ''; },
        prompt() { pr.textContent = `sama@os ${sh.cwd} %`; },
        busy(b) { line.classList.toggle('busy', b); if (!b) { term.prompt(); input.focus(); } },
      };
      const sh = makeShell(os, term);
      term.prompt();
      if (!os.greeted) { os.greeted = true; fs.find('/etc/motd')?.text.split('\n').forEach(l => term.write(l, 'dim')); term.write('Start with  cat readme.txt', 'dim'); term.write(''); }
      let hi = 0;
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { const v = input.value; input.value = ''; term.write(`${pr.textContent} ${v}`, 'echo'); sh.exec(v); hi = sh.sh.history.length; }
        else if (e.key === 'ArrowUp') { if (hi > 0) { hi--; input.value = sh.sh.history[hi]; } e.preventDefault(); }
        else if (e.key === 'ArrowDown') { hi = Math.min(sh.sh.history.length, hi + 1); input.value = sh.sh.history[hi] || ''; e.preventDefault(); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          const parts = input.value.split(' '), last = parts.pop();
          const opts = parts.length ? sh.complete(last) : sh.commands.filter(c => c.startsWith(last));
          if (opts.length === 1) input.value = [...parts, opts[0]].join(' ') + (opts[0].endsWith('/') ? '' : ' ');
          else if (opts.length > 1) term.write(opts.join('   '), 'dim');
        }
        else if (e.key === 'c' && e.ctrlKey) { sh.interrupt(); term.write('^C', 'dim'); }
        else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); term.clear(); }
      });
      document.addEventListener('keydown', e => { if (e.key === 'c' && e.ctrlKey && w.el.classList.contains('focused') && sh.sh.fg) { sh.interrupt(); } });
      w.body.addEventListener('click', () => { if (!getSelection().toString()) input.focus(); });
      w.onFocus = () => setTimeout(() => input.focus(), 0);
      w.onClose = () => sh.interrupt();
      w.shell = sh;
    },
  };

  // ---------------------------------------------------------------- Editor
  os.apps.editor = {
    mount(w, opts) {
      w.body.innerHTML = `<div class="ed">
        <div class="ed-tools"><input class="ed-path" spellcheck="false" aria-label="File name" /><span class="ed-state"></span><button class="btn quiet ed-save">Save</button><button class="btn primary ed-run">Run</button></div>
        <div class="ed-main"><pre class="ed-gut" aria-hidden="true"></pre><textarea class="ed-text" spellcheck="false" autocapitalize="off" aria-label="Code"></textarea></div>
        <div class="ed-out"><div class="ed-out-head"><span>Output</span><button class="btn quiet ed-stop" hidden>Stop</button></div><div class="ed-log" aria-live="polite"></div></div>
      </div>`;
      const q = s => w.body.querySelector(s);
      const text = q('.ed-text'), gut = q('.ed-gut'), path = q('.ed-path'), log = q('.ed-log'), state = q('.ed-state'), stop = q('.ed-stop');
      let file = null, dirty = false, proc = null, errLine = 0;
      const lines = () => { const n = text.value.split('\n').length; gut.textContent = Array.from({ length: n }, (_, i) => (i + 1 === errLine ? '▸' : '') + (i + 1)).join('\n'); gut.scrollTop = text.scrollTop; };
      const setDirty = d => { dirty = d; state.textContent = d ? 'Edited' : 'Saved'; };
      function load(p) {
        file = p; w.path = p;
        const n = fs.find(p);
        text.value = n && n.type === 'file' ? n.text : '// a new program\nprint("hello");\n';
        path.value = p.startsWith(fs.HOME) ? p.slice(fs.HOME.length + 1) : p;
        w.title.textContent = `Editor · ${path.value}`; errLine = 0; lines(); setDirty(!n);
      }
      function save() { file = resolve(fs.HOME, path.value.trim() || 'untitled.sm'); w.path = file; fs.write(file, text.value); w.title.textContent = `Editor · ${path.value}`; setDirty(false); }
      const say = (s, cls = '') => { const p = document.createElement('p'); p.className = cls; p.textContent = s; log.appendChild(p); log.scrollTop = log.scrollHeight; };
      function run() {
        save(); log.innerHTML = ''; errLine = 0; lines();
        if (proc && proc.state !== 'done') kernel.kill(proc.pid);
        try {
          proc = kernel.spawn(file, { stdout: s => { const m = s.match(/:(\d+):? /); say(s); if (m && /crash|division|overflow|stack/.test(s)) { errLine = +m[1]; lines(); } } });
          say(`Running ${proc.name} as process ${proc.pid}`, 'dim'); stop.hidden = false;
          proc.onExit = why => { stop.hidden = true; say(why === 'exited' ? 'Finished.' : why === 'killed' ? 'Stopped.' : 'The program crashed.', why === 'exited' ? 'dim' : 'err'); };
        } catch (e) {
          const m = e.message.match(/:(\d+): /); if (m) { errLine = +m[1]; lines(); }
          say(e.message, 'err');
        }
      }
      text.addEventListener('input', () => { setDirty(true); lines(); });
      text.addEventListener('scroll', () => { gut.scrollTop = text.scrollTop; });
      text.addEventListener('keydown', e => {
        if (e.key === 'Tab') { e.preventDefault(); const s = text.selectionStart; text.setRangeText('  ', s, text.selectionEnd, 'end'); lines(); setDirty(true); }
        if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
      });
      q('.ed-save').addEventListener('click', save);
      q('.ed-run').addEventListener('click', run);
      stop.addEventListener('click', () => proc && kernel.kill(proc.pid));
      w.load = load; w.onFocus = () => setTimeout(() => text.focus(), 0);
      w.onClose = () => { if (proc && proc.state !== 'done') kernel.kill(proc.pid); };
      load(opts.path || resolve(fs.HOME, 'hello.sm'));
    },
  };

  // ---------------------------------------------------------------- Files
  os.apps.files = {
    mount(w) {
      let cwd = fs.HOME, sel = null;
      w.body.innerHTML = `<div class="files"><div class="f-tools"><button class="btn quiet f-up" aria-label="Go to the enclosing folder">‹</button><span class="f-path"></span></div><ul class="f-list" role="listbox" aria-label="Files"></ul></div>`;
      const list = w.body.querySelector('.f-list');
      function draw() {
        const n = fs.find(cwd);
        w.body.querySelector('.f-path').textContent = cwd.replace(fs.HOME, '~');
        list.innerHTML = Object.entries(n.children).sort(([a, x], [b, y]) => (x.type === y.type ? a.localeCompare(b) : x.type === 'dir' ? -1 : 1)).map(([k, v]) =>
          `<li role="option" tabindex="0" data-k="${esc(k)}" class="${k === sel ? 'sel' : ''}"><span class="f-ic ${v.type}">${v.type === 'dir' ? ICONS.files : ''}</span><b>${esc(k)}</b><em>${v.type === 'dir' ? `${Object.keys(v.children).length} items` : `${v.text.length} bytes`}</em></li>`).join('');
      }
      const openItem = k => { const p = resolve(cwd, k), n = fs.find(p); if (n.type === 'dir') { cwd = p; sel = null; draw(); } else open('editor', { path: p }); };
      list.addEventListener('click', e => { const li = e.target.closest('li'); if (!li) return; sel = li.dataset.k; draw(); });
      list.addEventListener('dblclick', e => { const li = e.target.closest('li'); if (li) openItem(li.dataset.k); });
      list.addEventListener('keydown', e => { const li = e.target.closest('li'); if (li && e.key === 'Enter') openItem(li.dataset.k); });
      w.body.querySelector('.f-up').addEventListener('click', () => { if (cwd !== '/') { cwd = resolve(cwd, '..'); draw(); } });
      w.onFocus = draw; draw();
    },
  };

  // ---------------------------------------------------------------- Monitor
  os.apps.monitor = {
    mount(w) {
      w.body.innerHTML = `<div class="mon"><div class="m-head"><canvas class="m-graph" width="600" height="90" aria-label="CPU usage over the last few seconds"></canvas><p class="m-sum"></p></div>
        <table class="m-table"><thead><tr><th></th><th>PID</th><th>Name</th><th>State</th><th>CPU</th><th>Instructions</th><th></th></tr></thead><tbody></tbody></table>
        <p class="m-empty">Nothing is running. Try  run primes.sm &  in a Terminal.</p></div>`;
      const tb = w.body.querySelector('tbody'), g = w.body.querySelector('.m-graph').getContext('2d'), sum = w.body.querySelector('.m-sum');
      const hist = []; let arm = null;
      tb.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const pid = +b.dataset.pid;
        if (arm === pid) { kernel.kill(pid); arm = null; } else { arm = pid; }
        draw();
      });
      function draw() {
        tb.innerHTML = kernel.procs.map(p => `<tr class="${p.state}"><td><i style="--h:${p.hue}"></i></td><td>${p.pid}</td><td>${esc(p.name)}</td><td class="st">${p.state === 'done' ? p.exitMsg : p.state}</td><td>${(p.share * 100).toFixed(0)}%</td><td>${p.ins.toLocaleString()}</td>
          <td>${p.state === 'done' ? '' : `<button class="btn ${arm === p.pid ? 'danger' : 'quiet'}" data-pid="${p.pid}">${arm === p.pid ? `Quit ${p.pid}?` : 'Quit'}</button>`}</td></tr>`).join('');
        w.body.querySelector('.m-empty').hidden = kernel.procs.length > 0;
      }
      w.frame = (t) => {
        hist.push(t); if (hist.length > 150) hist.shift();
        const W = 600, H = 90, bw = W / 150;
        g.clearRect(0, 0, W, H);
        hist.forEach((f, i) => { let y = H; for (const s of f.slices) { const hgt = s.n / f.budget * H; g.fillStyle = `hsl(${s.hue} 70% 60%)`; g.fillRect(i * bw, y - hgt, bw + 0.5, hgt); y -= hgt; } });
        const busy = hist.slice(-60).reduce((a, f) => a + f.used / f.budget, 0) / Math.min(60, hist.length);
        sum.innerHTML = `<b>${(busy * 100).toFixed(0)}%</b> CPU · <b>${(busy * kernel.BUDGET * 60 / 1e6).toFixed(1)}M</b> instructions a second · <b>${kernel.procs.filter(p => p.state !== 'done').length}</b> running`;
      };
      w.slow = draw; draw();
    },
  };

  // ---------------------------------------------------------------- Display
  os.apps.display = {
    mount(w) {
      w.body.innerHTML = `<div class="disp"><canvas width="128" height="128" aria-label="The display, 128 by 128 pixels"></canvas><div class="d-foot"><span>128 × 128 · programs draw here with draw(x, y, r, g, b)</span><button class="btn quiet d-clear">Clear</button></div></div>`;
      const c = w.body.querySelector('canvas').getContext('2d'), img = c.createImageData(128, 128);
      w.body.querySelector('.d-clear').addEventListener('click', () => { kernel.display.px.fill(0); kernel.display.dirty = true; });
      w.frame = () => { if (!kernel.display.dirty && w.drawn) return; img.data.set(kernel.display.px); c.putImageData(img, 0, 0); kernel.display.dirty = false; w.drawn = true; };
    },
  };

  // ---------------------------------------------------------------- Orrery (the sims page, live)
  os.apps.sims = {
    mount(w) {
      w.body.innerHTML = `<div class="sims"><iframe src="../sims/?v=2" title="Orrery: nine interactive simulations" loading="lazy"></iframe><div class="s-foot"><span>The Orrery: nine simulations in orbit. Throw one, or click it to open it.</span><a class="btn quiet" href="../sims/" target="_blank" rel="noopener">Open in a new tab</a></div></div>`;
    },
  };

  // ---------------------------------------------------------------- Résumé
  os.apps.resume = {
    mount(w) {
      const job = (name, role, when, pts, links = []) => `<article class="r-job"><header><b>${name}</b><span>${when}</span></header>${role ? `<p class="r-role">${role}</p>` : ''}<ul>${pts.map(p => `<li>${p}</li>`).join('')}</ul>${links.length ? `<p class="r-links">${links.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${t} ↗</a>`).join('')}</p>` : ''}</article>`;
      w.body.innerHTML = `<div class="resume">
        <header class="r-head"><h2>Samahith</h2><p>Electrical &amp; Computer Engineering · University of Washington</p>
          <div class="r-actions"><a class="btn primary" href="../assets/samahith-resume.pdf" target="_blank" rel="noopener">Open the full résumé</a><a class="btn quiet" href="https://www.linkedin.com/in/samahith-thellakal-50a3a5290/" target="_blank" rel="noopener">LinkedIn</a><a class="btn quiet" href="https://github.com/MowkE" target="_blank" rel="noopener">GitHub</a></div></header>
        <p class="r-sec">Software</p>
        ${job('Monkeyless', 'Lead Developer &amp; Marketer · mindfulness screen-time app', 'Jan 2026 – now', [
          'Built and launched iOS and Android features that interrupt screen addiction with a mindful breathing block, using native system-level hooks and background permissions.',
          'Shipped a production MVP to the App Store in under 4 weeks with AI-augmented React Native development.',
          'Iterated on new UI with the startup team from user feedback, aimed at managing ADHD symptoms.',
          'Ran the social campaigns: 5,000+ organic downloads and 144k+ Instagram views.'])}
        ${job('OpenTrade (YC S26)', 'Growth Outreach &amp; Front-End Design · San Francisco', '2026', [
          'School outreach campaign: 1,000+ emails to educators and institutions for product demos in India and Singapore.',
          'Front-end product design: UI layouts, visual components and overall usability.'])}
        ${job('Substep', '', '', ['Details coming soon.'])}
        ${job('Propel', '', '', ['Details coming soon.'])}
        ${job('ShogunAI', 'Software Engineering Contractor · AI product engineering', '2026 · one week', [
          'Rebuilt the end-to-end living knowledge-base workflow of GodHands and integrated it into ShogunAI\'s local-first desktop agent, keeping evidence-linked context across people, projects, decisions and handoffs.',
          'Delivered a working integration in one week, adapting ingestion, retrieval and UI flows to the existing architecture.'],
          [['ShogunAI on Product Hunt', 'https://www.producthunt.com/products/shogunai?launch=shogunai'], ['godhands.dev', 'https://godhands.dev/']])}
        ${job('BioSim', 'Founder &amp; Lead Developer · 3D science simulation platform', 'Oct 2022 – now', [
          'A 3D simulation platform in the browser, built with Babylon.js and WebGL, rendering cells, organ systems and atoms.',
          'An interactive 3D periodic table with spatial structures for all 118 elements, built out for AP Chemistry.',
          'Custom prompt pipelines that generate WebGL coordinate math cut asset creation time 10×.',
          'Grew from 6 local schools to 79 school districts across 98 countries through educator outreach and SEO.'],
          [['bio-sim.us', 'https://bio-sim.us/'], ['bio-sim.us/chemistry', 'https://bio-sim.us/chemistry/']])}
        ${job('Orrery', 'Nine interactive simulations, orbiting one sun · no frameworks, no build step', '2026', [
          'Nine browser simulations that each measure something real and print it beside the textbook value.',
          'APSIS raymarches light around a black hole along Schwarzschild geodesics; VALENCE raymarches hydrogen orbitals from the Schrödinger equation; HYPERSHAPE rotates four-dimensional shapes.',
          'LUMA and LUMASHAPE test color models against human and bird vision; QUASI cuts quasicrystals from five dimensions; DIFFUSE rediscovers Fick\'s laws from random walkers; META shows geometry deciding how a material behaves; GOLDILOCKS checks whether a planet keeps liquid water.'])}
        <p class="r-sims-row"><button class="btn quiet r-sims">Open the Orrery</button></p>
        <p class="r-foot">Y Combinator Startup School 2026</p>
      </div>`;
      w.body.querySelector('.r-sims').addEventListener('click', () => open('sims'));
    },
  };

  // ---------------------------------------------------------------- menu bar
  const menu = $('#sys-menu'), menuBtn = $('#sys-btn');
  menuBtn.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', !menu.hidden); });
  addEventListener('click', () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); });
  $('#about-open').addEventListener('click', () => { $('#about').hidden = false; $('#about').animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: REDUCED ? 1 : 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }); });
  $('#about-close').addEventListener('click', () => { $('#about').hidden = true; });
  $('#reset-files').addEventListener('click', () => { fs.reset(); menu.hidden = true; });
  const clock = $('#clock'), cpu = $('#cpu');
  const tickClock = () => { clock.textContent = new Date().toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); };
  tickClock(); setInterval(tickClock, 5000);

  // ---------------------------------------------------------------- the wallpaper: the CPU, live
  const wall = $('#wall'), wg = wall.getContext('2d');
  const WW = 160, WH = 90; wall.width = WW; wall.height = WH;
  wg.fillStyle = '#101216'; wg.fillRect(0, 0, WW, WH);
  let wallAcc = 0;
  function paintWall(t) {
    wallAcc++; if (wallAcc % 3) return;                // one column every third frame
    wg.drawImage(wall, -1, 0);
    let y = 0;
    for (const s of t.slices) {
      const hgt = s.n / t.budget * WH;
      const grd = wg.createLinearGradient(0, y, 0, y + hgt);
      grd.addColorStop(0, `hsl(${s.hue} 75% 55%)`); grd.addColorStop(1, `hsl(${s.hue + 25} 70% 40%)`);
      wg.fillStyle = grd; wg.fillRect(WW - 1, y, 1, hgt); y += hgt;
    }
    wg.fillStyle = '#101216'; wg.fillRect(WW - 1, y, 1, WH - y);
  }

  // ---------------------------------------------------------------- main loop
  let slow = 0, cpuAvg = 0;
  function frame() {
    const t = kernel.tick();
    paintWall(t);
    cpuAvg += (t.used / t.budget - cpuAvg) * 0.05;
    for (const w of wins) if (!w.min && w.frame) w.frame(t);
    if (++slow % 15 === 0) { cpu.textContent = `CPU ${(cpuAvg * 100).toFixed(0)}%`; for (const w of wins) if (!w.min && w.slow) w.slow(); }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot
  const bootEl = $('#boot');
  setTimeout(() => {
    bootEl.classList.add('gone'); root.classList.add('up');
    open('terminal');
    open('resume');
    requestAnimationFrame(frame);
    setTimeout(() => bootEl.remove(), 800);
  }, REDUCED ? 50 : 1100);

  window.__samaos = { os, wins, open };
  return os;
}
