// software.js
// samaOS: a tiny computer in the page. A terminal on one side, a screen
// on the other, and every command runs a real program you can watch:
// sorting algorithms racing on the same shuffled data, a maze carved
// by depth-first search and solved by A*, Conway's Game of Life you can
// draw on, a flock of boids, and a Mandelbrot you can zoom into. Stats
// are counted, not faked: comparisons, swaps, nodes expanded, frame
// timings.

const COLORS = { bg: '#0b0d14', ink: '#e6e9f5', dim: '#6c7390', acc: '#6d8bff', hot: '#ff7a59', ok: '#5fe0a8', warn: '#ffd166' };

export function initOS(el) {
  const term = el.querySelector('.os-term'), out = term.querySelector('.os-out'), input = term.querySelector('input');
  const screen = el.querySelector('canvas'), g = screen.getContext('2d');
  const stats = el.querySelector('.os-stats'), title = el.querySelector('.os-title'), controls = el.querySelector('.os-controls');
  let W = 0, H = 0, dpr = 1;
  function fit() {
    dpr = Math.min(devicePixelRatio, 2);
    W = screen.clientWidth; H = screen.clientHeight;
    screen.width = W * dpr; screen.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (prog && prog.resize) prog.resize();
  }

  // ── terminal ────────────────────────────────────────────────────
  const history = []; let hi = 0;
  function print(html, cls = '') {
    const line = document.createElement('div'); line.className = 'ln ' + cls; line.innerHTML = html;
    out.appendChild(line); out.scrollTop = out.scrollHeight;
    return line;
  }
  async function type(text, cls = '', speed = 9) {
    const line = print('', cls);
    for (let i = 0; i <= text.length; i++) { line.textContent = text.slice(0, i); await new Promise(r => setTimeout(r, speed)); }
    out.scrollTop = out.scrollHeight;
  }
  const cmdLink = c => `<button class="cmd" data-c="${c}">${c}</button>`;

  const COMMANDS = {
    help: () => {
      print('programs you can run:', 'dim');
      for (const [c, d] of [['sort', 'three sorting algorithms race on the same data'], ['maze', 'carve a maze, then watch A* find the exit'], ['life', "Conway's Game of Life. draw on it"], ['boids', 'a flock from three simple rules'], ['mandel', 'the Mandelbrot set. click to zoom'], ['about', 'who wrote this'], ['projects', 'everything else i built'], ['clear', 'wipe the terminal']])
        print(`${cmdLink(c)} <span class="dim">${d}</span>`);
    },
    about: () => {
      print('Samahith Thellakal. I like to learn new things.');
      print('this whole computer is about 600 lines of plain JavaScript. no framework, no build step.', 'dim');
    },
    projects: () => {
      print('<a href="../sims/">~/sims</a> <span class="dim">nine physics and math simulations</span>');
      print('<a href="../bio/">~/bio</a> <span class="dim">a dish of living cells</span>');
      print('<a href="../hardware/">~/hardware</a> <span class="dim">HighTide, FRC 4414</span>');
      print('more coming soon.', 'dim');
    },
    clear: () => { out.innerHTML = ''; },
    ls: () => print('sort  maze  life  boids  mandel  about  projects', 'dim'),
    sudo: () => print('nice try.', 'hot'),
    sort: () => run(sortProg), maze: () => run(mazeProg), life: () => run(lifeProg), boids: () => run(boidsProg), mandel: () => run(mandelProg),
  };
  function exec(raw) {
    const line = raw.trim(); if (!line) return;
    print(`<span class="pr">sama@os ~ %</span> ${line.replace(/</g, '&lt;')}`);
    history.push(line); hi = history.length;
    const [c] = line.toLowerCase().split(/\s+/);
    if (COMMANDS[c]) COMMANDS[c]();
    else print(`command not found: ${c.replace(/</g, '&lt;')}. try ${cmdLink('help')}`, 'hot');
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { exec(input.value); input.value = ''; }
    else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); input.value = history[hi] || ''; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { hi = Math.min(history.length, hi + 1); input.value = history[hi] || ''; e.preventDefault(); }
    else if (e.key === 'Tab') { e.preventDefault(); const m = Object.keys(COMMANDS).find(k => k.startsWith(input.value)); if (m) input.value = m; }
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('.cmd'); if (b) { exec(b.dataset.c); input.focus({ preventScroll: true }); }
  });
  el.querySelectorAll('.dock button').forEach(b => b.addEventListener('click', () => exec(b.dataset.c)));

  // ── program host ────────────────────────────────────────────────
  let prog = null, raf = 0, active = false;
  function run(P) {
    if (prog && prog.stop) prog.stop();
    controls.innerHTML = ''; stats.innerHTML = '';
    el.querySelectorAll('.dock button').forEach(b => b.classList.toggle('on', b.dataset.c === P.id));
    title.textContent = P.title;
    prog = P.make();
    print(P.blurb, 'dim');
  }
  function setStats(obj) { stats.innerHTML = Object.entries(obj).map(([k, v]) => `<span><em>${k}</em><b>${v}</b></span>`).join(''); }
  function button(label, fn) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); controls.appendChild(b); return b; }
  function frame(t) { if (!active) return; if (prog && prog.tick) prog.tick(t); raf = requestAnimationFrame(frame); }
  const mouse = { x: 0, y: 0, down: false, in: false };
  screen.addEventListener('pointerdown', e => { mouse.down = true; move(e); screen.setPointerCapture(e.pointerId); if (prog && prog.click) prog.click(mouse.x, mouse.y, e); });
  screen.addEventListener('pointermove', e => { move(e); if (mouse.down && prog && prog.drag) prog.drag(mouse.x, mouse.y); });
  screen.addEventListener('pointerup', () => { mouse.down = false; });
  screen.addEventListener('pointerleave', () => { mouse.in = false; });
  function move(e) { const r = screen.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.in = true; }

  // ── sort: three algorithms, same data, side by side ─────────────
  const sortProg = { id: 'sort', title: 'sort.js: bubble vs merge vs quick', blurb: 'same shuffled array, three algorithms. bubble compares neighbors, merge splits and merges, quick partitions around a pivot. watch the comparison counts.',
    make() {
      const N = 90; let lanes, speed = 3;
      function* bubble(a, st) { for (let i = 0; i < a.length; i++) for (let j = 0; j < a.length - i - 1; j++) { st.cmp++; st.hl = [j, j + 1]; if (a[j] > a[j + 1]) { [a[j], a[j + 1]] = [a[j + 1], a[j]]; st.sw++; } yield; } }
      function* merge(a, st, lo = 0, hi = a.length) { if (hi - lo < 2) return; const m = (lo + hi) >> 1; yield* merge(a, st, lo, m); yield* merge(a, st, m, hi); const l = a.slice(lo, m), r = a.slice(m, hi); let i = 0, j = 0, k = lo; while (i < l.length && j < r.length) { st.cmp++; st.hl = [k]; a[k++] = l[i] <= r[j] ? l[i++] : r[j++]; st.sw++; yield; } while (i < l.length) { a[k++] = l[i++]; st.sw++; yield; } while (j < r.length) { a[k++] = r[j++]; st.sw++; yield; } }
      function* quick(a, st, lo = 0, hi = a.length - 1) { if (lo >= hi) return; const p = a[hi]; let i = lo; for (let j = lo; j < hi; j++) { st.cmp++; st.hl = [j, hi]; if (a[j] < p) { [a[i], a[j]] = [a[j], a[i]]; i++; st.sw++; } yield; } [a[i], a[hi]] = [a[hi], a[i]]; st.sw++; yield; yield* quick(a, st, lo, i - 1); yield* quick(a, st, i + 1, hi); }
      function reset() {
        const base = Array.from({ length: N }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
        lanes = [['bubble', bubble], ['merge', merge], ['quick', quick]].map(([name, f]) => { const a = base.slice(), st = { cmp: 0, sw: 0, hl: [], done: false }; return { name, a, st, it: f(a, st) }; });
      }
      reset();
      button('shuffle', reset);
      const sp = button('speed ×3', () => { speed = speed === 3 ? 12 : speed === 12 ? 1 : 3; sp.textContent = `speed ×${speed}`; });
      return { tick() {
        for (const L of lanes) for (let k = 0; k < speed && !L.st.done; k++) if (L.it.next().done) { L.st.done = true; L.st.hl = []; }
        g.fillStyle = COLORS.bg; g.fillRect(0, 0, W, H);
        const lh = H / 3;
        lanes.forEach((L, li) => {
          const y0 = li * lh, bw = W / N;
          g.fillStyle = COLORS.dim; g.font = '500 12px JetBrains Mono, monospace';
          g.fillText(`${L.name}${L.st.done ? '  done' : ''}`, 12, y0 + 20);
          L.a.forEach((v, i) => {
            const h = (v / N) * (lh - 38);
            g.fillStyle = L.st.hl.includes(i) ? COLORS.hot : L.st.done ? COLORS.ok : `hsl(${220 + v * 1.2},70%,${45 + v / N * 25}%)`;
            g.fillRect(i * bw + 0.5, y0 + lh - 6 - h, Math.max(1, bw - 1), h);
          });
        });
        setStats(Object.fromEntries(lanes.map(L => [`${L.name} compares`, L.st.cmp.toLocaleString()])));
      } };
    } };

  // ── maze: DFS carves it, A* solves it ───────────────────────────
  const mazeProg = { id: 'maze', title: 'maze.js: depth-first carve, A* solve', blurb: 'a depth-first search carves the maze, then A* hunts for the exit, always expanding the cell with the smallest (distance so far + distance left). click to move the goal.',
    make() {
      let C, R, cell, walls, carve, stack, seen, phase, open, came, gS, closed, path, goal, expanded;
      function reset() {
        cell = Math.max(14, Math.floor(Math.min(W, H) / 28)); C = Math.floor(W / cell); R = Math.floor(H / cell);
        walls = Array.from({ length: C * R }, () => [1, 1, 1, 1]); seen = new Uint8Array(C * R); stack = [0]; seen[0] = 1; phase = 'carve';
        goal = C * R - 1; path = []; expanded = 0;
      }
      const nb = i => { const x = i % C, y = (i / C) | 0; return [[x, y - 1, 0, 2], [x + 1, y, 1, 3], [x, y + 1, 2, 0], [x - 1, y, 3, 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < C && b < R).map(([a, b, w, o]) => [b * C + a, w, o]); };
      const hd = (a, b) => Math.abs(a % C - b % C) + Math.abs(((a / C) | 0) - ((b / C) | 0));
      function startSolve() { phase = 'solve'; open = new Set([0]); came = new Map(); gS = new Map([[0, 0]]); closed = new Set(); path = []; expanded = 0; }
      reset();
      button('new maze', reset);
      return {
        resize: reset,
        click(x, y) { if (phase === 'carve') return; goal = Math.min(C * R - 1, Math.floor(y / cell) * C + Math.floor(x / cell)); startSolve(); },
        tick() {
          for (let k = 0; k < 6; k++) {
            if (phase === 'carve') {
              if (!stack.length) { startSolve(); break; }
              const cur = stack[stack.length - 1], opts = nb(cur).filter(([n]) => !seen[n]);
              if (!opts.length) { stack.pop(); continue; }
              const [n, w, o] = opts[(Math.random() * opts.length) | 0];
              walls[cur][w] = 0; walls[n][o] = 0; seen[n] = 1; stack.push(n);
            } else if (phase === 'solve') {
              let cur = null, best = 1e9;
              for (const o of open) { const f = gS.get(o) + hd(o, goal); if (f < best) { best = f; cur = o; } }
              if (cur === null) { phase = 'done'; break; }
              if (cur === goal) { path = [cur]; while (came.has(path[0])) path.unshift(came.get(path[0])); phase = 'done'; break; }
              open.delete(cur); closed.add(cur); expanded++;
              for (const [n, w] of nb(cur)) {
                if (walls[cur][w] || closed.has(n)) continue;
                const t = gS.get(cur) + 1;
                if (!gS.has(n) || t < gS.get(n)) { gS.set(n, t); came.set(n, cur); open.add(n); }
              }
            }
          }
          g.fillStyle = COLORS.bg; g.fillRect(0, 0, W, H);
          const ox = (W - C * cell) / 2, oy = (H - R * cell) / 2;
          for (let i = 0; i < C * R; i++) {
            const x = ox + (i % C) * cell, y = oy + ((i / C) | 0) * cell;
            if (closed && closed.has(i)) { g.fillStyle = 'rgba(109,139,255,0.18)'; g.fillRect(x, y, cell, cell); }
            else if (open && open.has(i)) { g.fillStyle = 'rgba(255,209,102,0.3)'; g.fillRect(x, y, cell, cell); }
          }
          g.strokeStyle = '#2a3150'; g.lineWidth = 2; g.beginPath();
          for (let i = 0; i < C * R; i++) {
            const x = ox + (i % C) * cell, y = oy + ((i / C) | 0) * cell, w = walls[i];
            if (w[0]) { g.moveTo(x, y); g.lineTo(x + cell, y); } if (w[1]) { g.moveTo(x + cell, y); g.lineTo(x + cell, y + cell); }
            if (w[2]) { g.moveTo(x, y + cell); g.lineTo(x + cell, y + cell); } if (w[3]) { g.moveTo(x, y); g.lineTo(x, y + cell); }
          }
          g.stroke();
          if (phase === 'carve' && stack.length) { const i = stack[stack.length - 1]; g.fillStyle = COLORS.hot; g.fillRect(ox + (i % C) * cell + 3, oy + ((i / C) | 0) * cell + 3, cell - 6, cell - 6); }
          if (path.length) { g.strokeStyle = COLORS.hot; g.lineWidth = Math.max(3, cell / 3); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); path.forEach((i, k) => { const x = ox + (i % C + 0.5) * cell, y = oy + (((i / C) | 0) + 0.5) * cell; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
          g.fillStyle = COLORS.ok; g.beginPath(); g.arc(ox + cell / 2, oy + cell / 2, cell / 3, 0, 7); g.fill();
          g.fillStyle = COLORS.hot; g.beginPath(); g.arc(ox + (goal % C + 0.5) * cell, oy + (((goal / C) | 0) + 0.5) * cell, cell / 3, 0, 7); g.fill();
          setStats({ phase, 'cells expanded': expanded, 'path length': path.length ? path.length - 1 : '…', grid: `${C}×${R}` });
        } };
    } };

  // ── life: Conway's Game of Life ─────────────────────────────────
  const lifeProg = { id: 'life', title: "life.js: Conway's Game of Life", blurb: 'each cell lives or dies by its 8 neighbors: fewer than 2 dies, 2 or 3 survives, exactly 3 is born. drag to draw. the glider guns are in there somewhere.',
    make() {
      let C, R, a, b, gen = 0, paused = false, cs = 8;
      function reset(rand = true) { cs = Math.max(6, Math.floor(Math.min(W, H) / 70)); C = Math.floor(W / cs); R = Math.floor(H / cs); a = new Uint8Array(C * R); b = new Uint8Array(C * R); gen = 0; if (rand) for (let i = 0; i < a.length; i++) a[i] = Math.random() < 0.22; }
      function gun(x0, y0) { const G = [[0, 4], [0, 5], [1, 4], [1, 5], [10, 4], [10, 5], [10, 6], [11, 3], [11, 7], [12, 2], [12, 8], [13, 2], [13, 8], [14, 5], [15, 3], [15, 7], [16, 4], [16, 5], [16, 6], [17, 5], [20, 2], [20, 3], [20, 4], [21, 2], [21, 3], [21, 4], [22, 1], [22, 5], [24, 0], [24, 1], [24, 5], [24, 6], [34, 2], [34, 3], [35, 2], [35, 3]]; for (const [x, y] of G) a[(y0 + y) * C + x0 + x] = 1; }
      reset();
      const paint = (x, y) => { const cx = Math.floor(x / cs), cy = Math.floor(y / cs); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < C && Y < R && Math.random() < 0.7) a[Y * C + X] = 1; } };
      button('random', () => reset(true));
      button('glider gun', () => { reset(false); gun(4, 4); });
      const pb = button('pause', () => { paused = !paused; pb.textContent = paused ? 'play' : 'pause'; });
      let acc = 0, last = 0;
      return { resize: () => reset(true), click: paint, drag: paint,
        tick(t) {
          acc += Math.min(t - last, 100); last = t;
          if (!paused && acc > 60) {
            acc = 0; gen++;
            for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
              let n = 0;
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += a[((y + dy + R) % R) * C + (x + dx + C) % C];
              const i = y * C + x; b[i] = n === 3 || (n === 2 && a[i]) ? 1 : 0;
            }
            [a, b] = [b, a];
          }
          g.fillStyle = 'rgba(11,13,20,0.55)'; g.fillRect(0, 0, W, H);
          let pop = 0;
          for (let i = 0; i < a.length; i++) if (a[i]) { pop++; g.fillStyle = `hsl(${220 + ((i * 7) % 60)},80%,68%)`; g.fillRect((i % C) * cs, ((i / C) | 0) * cs, cs - 1, cs - 1); }
          setStats({ generation: gen, alive: pop, grid: `${C}×${R}`, rule: 'B3/S23' });
        } };
    } };

  // ── boids: separation, alignment, cohesion ──────────────────────
  const boidsProg = { id: 'boids', title: 'boids.js: a flock from three rules', blurb: 'every bird follows three rules: do not crowd your neighbors, steer the way they steer, drift toward their center. nobody leads. your cursor is a hawk.',
    make() {
      const N = 260; let w = { sep: 1.6, ali: 1, coh: 0.9 };
      const B = Array.from({ length: N }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1 }));
      const mk = (k, label) => { const b = button(`${label} ${w[k]}`, () => { w[k] = w[k] >= 2.4 ? 0 : +(w[k] + 0.4).toFixed(1); b.textContent = `${label} ${w[k]}`; }); };
      mk('sep', 'separation'); mk('ali', 'alignment'); mk('coh', 'cohesion');
      return { tick() {
        const R2 = 55 * 55, S2 = 20 * 20;
        let order = 0;
        for (const b of B) {
          let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0;
          for (const o of B) { if (o === b) continue; const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy; if (d2 < R2) { n++; cx += o.x; cy += o.y; ax += o.vx; ay += o.vy; if (d2 < S2) { sx -= dx / (d2 + 1) * 20; sy -= dy / (d2 + 1) * 20; } } }
          if (n) { b.vx += ((cx / n - b.x) * 0.002 * w.coh + (ax / n - b.vx) * 0.05 * w.ali + sx * 0.05 * w.sep); b.vy += ((cy / n - b.y) * 0.002 * w.coh + (ay / n - b.vy) * 0.05 * w.ali + sy * 0.05 * w.sep); }
          if (mouse.in) { const dx = b.x - mouse.x, dy = b.y - mouse.y, d2 = dx * dx + dy * dy; if (d2 < 120 * 120) { b.vx += dx / (d2 + 1) * 30; b.vy += dy / (d2 + 1) * 30; } }
          const sp = Math.hypot(b.vx, b.vy) || 1, lim = Math.min(4, Math.max(2, sp)); b.vx = b.vx / sp * lim; b.vy = b.vy / sp * lim;
        }
        let mvx = 0, mvy = 0;
        for (const b of B) { b.x = (b.x + b.vx + W) % W; b.y = (b.y + b.vy + H) % H; const s = Math.hypot(b.vx, b.vy) || 1; mvx += b.vx / s; mvy += b.vy / s; }
        order = Math.hypot(mvx, mvy) / N;
        g.fillStyle = 'rgba(11,13,20,0.3)'; g.fillRect(0, 0, W, H);
        for (const b of B) {
          const a = Math.atan2(b.vy, b.vx);
          g.fillStyle = `hsl(${200 + a * 20},80%,70%)`;
          g.beginPath(); g.moveTo(b.x + Math.cos(a) * 7, b.y + Math.sin(a) * 7); g.lineTo(b.x + Math.cos(a + 2.5) * 4, b.y + Math.sin(a + 2.5) * 4); g.lineTo(b.x + Math.cos(a - 2.5) * 4, b.y + Math.sin(a - 2.5) * 4); g.fill();
        }
        if (mouse.in) { g.strokeStyle = COLORS.hot; g.beginPath(); g.arc(mouse.x, mouse.y, 10, 0, 7); g.stroke(); }
        setStats({ birds: N, 'flock alignment': `${(order * 100).toFixed(0)}%`, leaders: 0 });
      } };
    } };

  // ── mandel: the Mandelbrot set ──────────────────────────────────
  const mandelProg = { id: 'mandel', title: 'mandel.js: z → z² + c', blurb: 'color each point c by how fast z → z² + c escapes to infinity, starting from zero. click to zoom in 3×, shift-click to zoom out. it never stops being detailed.',
    make() {
      let cx = -0.6, cy = 0, span = 3.2, row = 0, img, maxIt = 120, rendered = 0;
      function restart() { row = 0; img = g.createImageData(Math.floor(W * dpr), Math.floor(H * dpr)); maxIt = Math.floor(120 + 60 * Math.log2(3.2 / span)); }
      restart();
      button('reset', () => { cx = -0.6; cy = 0; span = 3.2; restart(); });
      return { resize: restart,
        click(x, y, e) { const s = span / W; cx += (x - W / 2) * s; cy += (y - H / 2) * s; span *= e.shiftKey ? 3 : 1 / 3; restart(); },
        tick() {
          const w = img.width, h = img.height, s = span / w, t0 = performance.now();
          while (row < h && performance.now() - t0 < 12) {
            const ci = cy + (row - h / 2) * s;
            for (let x = 0; x < w; x++) {
              const cr = cx + (x - w / 2) * s; let zr = 0, zi = 0, i = 0;
              while (i < maxIt && zr * zr + zi * zi < 16) { const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; i++; }
              const o = (row * w + x) * 4;
              if (i === maxIt) { img.data[o] = 8; img.data[o + 1] = 10; img.data[o + 2] = 18; }
              else { const sm = i + 1 - Math.log2(Math.log2(zr * zr + zi * zi) / 2), k = sm / maxIt;
                img.data[o] = 255 * Math.pow(k, 0.5) * 0.45; img.data[o + 1] = 255 * Math.pow(k, 0.35) * 0.55; img.data[o + 2] = 255 * Math.min(1, Math.pow(k, 0.2) * 1.05); }
              img.data[o + 3] = 255;
            }
            row++;
          }
          g.putImageData(img, 0, 0);
          setStats({ zoom: `${(3.2 / span).toExponential(1)}×`, iterations: maxIt, rendered: `${Math.round(row / h * 100)}%`, center: `${cx.toFixed(5)}, ${cy.toFixed(5)}i` });
        } };
    } };

  addEventListener('resize', fit);
  fit();

  (async () => {
    await type('samaOS 1.0 · booting', 'dim', 14);
    await type('memory ok · three.js not required · coffee low', 'dim', 8);
    print(`type ${cmdLink('help')}, or click a program in the dock below.`);
    run(sortProg);
  })();

  return { setActive(on) { if (on && !active) { active = true; raf = requestAnimationFrame(frame); } else if (!on) { active = false; cancelAnimationFrame(raf); } } };
}
