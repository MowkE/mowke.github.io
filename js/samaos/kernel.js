// kernel.js
// The samaOS kernel. It's small, but every part of it is real:
//   - sama, a little language, with a lexer, a Pratt parser and a compiler
//     that emits bytecode for a stack machine
//   - a virtual CPU that executes that bytecode
//   - a preemptive round-robin scheduler that time-slices every process
//   - system calls: print, sleep, draw, spawn, time, ...
//   - a hierarchical file system, saved in the browser between visits
//   - a shell with pipes, redirection and background jobs

// ================================================================ compiler
const KEYWORDS = new Set(['let', 'fn', 'if', 'else', 'while', 'return', 'true', 'false']);
export const BUILTINS = {
  print: 'print its arguments', sleep: 'pause for n milliseconds', time: 'milliseconds since boot', pid: 'this process id',
  rand: 'a random number from 0 to 1', floor: 'round down', sqrt: 'square root', len: 'length of a string', str: 'turn a value into text',
  draw: 'draw(x, y, r, g, b): set a pixel on the display', clear: 'clear the display', spawn: 'spawn(path): start another program', yield: 'give up the CPU early',
};

function lex(src, file) {
  const toks = []; let i = 0, line = 1;
  const err = m => { throw new Error(`${file}:${line}: ${m}`); };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) { let j = i; while (/[0-9.]/.test(src[j] || '')) j++; toks.push({ t: 'num', v: parseFloat(src.slice(i, j)), line }); i = j; continue; }
    if (c === '"') { let j = i + 1, s = ''; while (j < src.length && src[j] !== '"') { if (src[j] === '\\' && src[j + 1] === 'n') { s += '\n'; j += 2; continue; } if (src[j] === '\n') err('unfinished string'); s += src[j++]; } if (j >= src.length) err('unfinished string'); toks.push({ t: 'str', v: s, line }); i = j + 1; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (/[A-Za-z0-9_]/.test(src[j] || '')) j++; const w = src.slice(i, j); toks.push({ t: KEYWORDS.has(w) ? w : 'id', v: w, line }); i = j; continue; }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { toks.push({ t: two, line }); i += 2; continue; }
    if ('+-*/%<>=!(){},;'.includes(c)) { toks.push({ t: c, line }); i++; continue; }
    err(`unexpected "${c}"`);
  }
  toks.push({ t: 'eof', line });
  return toks;
}

const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
function parse(toks, file) {
  let k = 0;
  const peek = () => toks[k], next = () => toks[k++];
  const err = (m, t = peek()) => { throw new Error(`${file}:${t.line}: ${m}`); };
  const want = (t, what) => { if (peek().t !== t) err(`expected ${what || `"${t}"`}`); return next(); };
  function primary() {
    const t = next();
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v, line: t.line };
    if (t.t === 'true' || t.t === 'false') return { k: 'lit', v: t.t === 'true' ? 1 : 0, line: t.line };
    if (t.t === '(') { const e = expr(0); want(')'); return e; }
    if (t.t === '-' || t.t === '!') return { k: 'un', op: t.t, e: expr(7), line: t.line };
    if (t.t === 'id') {
      if (peek().t === '(') { next(); const args = []; if (peek().t !== ')') { do args.push(expr(0)); while (peek().t === ',' && next()); } want(')'); return { k: 'call', name: t.v, args, line: t.line }; }
      return { k: 'var', name: t.v, line: t.line };
    }
    err('expected a value', t);
  }
  function expr(min) {
    let left = primary();
    while (PREC[peek().t] > min) { const op = next(); left = { k: 'bin', op: op.t, a: left, b: expr(PREC[op.t]), line: op.line }; }
    return left;
  }
  function block() { want('{'); const body = []; while (peek().t !== '}') { if (peek().t === 'eof') err('missing "}"'); body.push(stmt()); } next(); return body; }
  function stmt() {
    const t = peek();
    if (t.t === 'let') { next(); const name = want('id', 'a name').v; want('='); const e = expr(0); want(';'); return { k: 'let', name, e, line: t.line }; }
    if (t.t === 'fn') { next(); const name = want('id', 'a function name').v; want('('); const params = []; if (peek().t !== ')') { do params.push(want('id', 'a parameter name').v); while (peek().t === ',' && next()); } want(')'); return { k: 'fn', name, params, body: block(), line: t.line }; }
    if (t.t === 'if') { next(); want('('); const c = expr(0); want(')'); const a = block(); let b = null; if (peek().t === 'else') { next(); b = peek().t === 'if' ? [stmt()] : block(); } return { k: 'if', c, a, b, line: t.line }; }
    if (t.t === 'while') { next(); want('('); const c = expr(0); want(')'); return { k: 'while', c, body: block(), line: t.line }; }
    if (t.t === 'return') { next(); const e = peek().t === ';' ? null : expr(0); want(';'); return { k: 'ret', e, line: t.line }; }
    if (t.t === '{') return { k: 'blk', body: block(), line: t.line };
    if (t.t === 'id' && toks[k + 1].t === '=') { next(); next(); const e = expr(0); want(';'); return { k: 'set', name: t.v, e, line: t.line }; }
    const e = expr(0); want(';'); return { k: 'expr', e, line: t.line };
  }
  const prog = []; while (peek().t !== 'eof') prog.push(stmt());
  return prog;
}

// bytecode: [op, arg]; each function gets its own code array and local slots
export function compile(src, file = 'program') {
  const ast = parse(lex(src, file), file);
  const fns = [{ name: 'main', params: [], code: [], nlocals: 0 }];
  const index = { main: 0 };
  const globals = new Set();
  for (const s of ast) {
    if (s.k === 'fn') { if (index[s.name] !== undefined) throw new Error(`${file}:${s.line}: ${s.name} is defined twice`); index[s.name] = fns.length; fns.push({ name: s.name, params: s.params, code: [], nlocals: 0, ast: s }); }
  }
  // every let outside a function is a global, however deeply it's nested in loops
  const collect = list => list.forEach(s => { if (s.k === 'let') globals.add(s.name); if (s.k === 'if') { collect(s.a); if (s.b) collect(s.b); } if (s.k === 'while' || s.k === 'blk') collect(s.body); });
  collect(ast);
  function gen(fn, body, scope) {
    const emit = (op, arg, line) => fn.code.push([op, arg, line]);
    const slot = name => scope.has(name) ? scope.get(name) : null;
    function ex(e) {
      switch (e.k) {
        case 'lit': return emit('CONST', e.v, e.line);
        case 'var': { const s = slot(e.name); if (s !== null) return emit('LOAD', s, e.line); if (globals.has(e.name)) return emit('GLOAD', e.name, e.line); throw new Error(`${file}:${e.line}: ${e.name} isn't defined`); }
        case 'un': ex(e.e); return emit(e.op === '-' ? 'NEG' : 'NOT', null, e.line);
        case 'bin':
          if (e.op === '&&' || e.op === '||') {
            ex(e.a); const j = fn.code.length; emit(e.op === '&&' ? 'JF' : 'JT', 0); emit('POP'); ex(e.b); fn.code[j][1] = fn.code.length; return;   // short-circuit: the jump keeps a as the result
          }
          ex(e.a); ex(e.b); return emit({ '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD', '==': 'EQ', '!=': 'NE', '<': 'LT', '<=': 'LE', '>': 'GT', '>=': 'GE' }[e.op], null, e.line);
        case 'call':
          e.args.forEach(ex);
          if (index[e.name] !== undefined) { const f = fns[index[e.name]]; if (f.params.length !== e.args.length) throw new Error(`${file}:${e.line}: ${e.name} takes ${f.params.length} argument${f.params.length === 1 ? '' : 's'}`); return emit('CALL', index[e.name], e.line); }
          if (BUILTINS[e.name]) return emit('SYS', [e.name, e.args.length], e.line);
          throw new Error(`${file}:${e.line}: there's no function called ${e.name}`);
      }
    }
    function st(s) {
      switch (s.k) {
        case 'let': ex(s.e); if (fn.name === 'main' && !scope.size) return emit('GSTORE', s.name, s.line); scope.set(s.name, fn.nlocals++); return emit('STORE', scope.get(s.name), s.line);
        case 'set': { ex(s.e); const sl = slot(s.name); if (sl !== null) return emit('STORE', sl, s.line); if (globals.has(s.name)) return emit('GSTORE', s.name, s.line); throw new Error(`${file}:${s.line}: ${s.name} isn't defined; use let first`); }
        case 'expr': ex(s.e); return emit('POP', null, s.line);
        case 'if': { ex(s.c); const jf = fn.code.length; emit('JF', 0, s.line); emit('POP'); s.a.forEach(st); const je = fn.code.length; emit('JMP', 0); fn.code[jf][1] = fn.code.length; emit('POP'); (s.b || []).forEach(st); fn.code[je][1] = fn.code.length; return; }
        case 'while': { const top = fn.code.length; ex(s.c); const jf = fn.code.length; emit('JF', 0, s.line); emit('POP'); s.body.forEach(st); emit('JMP', top); fn.code[jf][1] = fn.code.length; emit('POP'); return; }
        case 'ret': if (fn.name === 'main') throw new Error(`${file}:${s.line}: return only works inside a function`); s.e ? ex(s.e) : emit('CONST', 0); return emit('RET', null, s.line);
        case 'blk': return s.body.forEach(st);
        case 'fn': return;
      }
    }
    body.forEach(st);
    if (fn.name === 'main') emit('HALT'); else { emit('CONST', 0); emit('RET'); }
  }
  gen(fns[0], ast, new Map());
  for (const f of fns.slice(1)) { const scope = new Map(); f.params.forEach(p => scope.set(p, f.nlocals++)); gen(f, f.ast.body, scope); delete f.ast; }
  return { file, fns };
}
// a readable listing, for `sc -S`
export function disassemble(prog) {
  const out = [];
  for (const f of prog.fns) {
    out.push(`${f.name}(${f.params.join(', ')}):`);
    f.code.forEach(([op, arg], i) => out.push(`  ${String(i).padStart(3, '0')}  ${op.padEnd(6)} ${arg === null || arg === undefined ? '' : Array.isArray(arg) ? `${arg[0]}/${arg[1]}` : typeof arg === 'string' && op === 'CONST' ? JSON.stringify(arg) : op === 'CALL' ? prog.fns[arg].name : arg}`));
  }
  return out;
}

// ================================================================ file system
const HOME = '/home/sama';
const DEFAULT_FILES = {
  '/etc/motd': 'Welcome to samaOS 1.0.\nType help to see what it can do.',
  [`${HOME}/readme.txt`]: [
    'samaOS is a small operating system that runs inside this page.',
    '',
    'Programs are written in sama, its own language, compiled to bytecode,',
    'and run on a virtual CPU. The scheduler shares that CPU between every',
    'program that is running, a few hundred instructions at a time.',
    '',
    'Try:',
    '  run hello.sm',
    '  run primes.sm &        (& runs it in the background)',
    '  run mandel.sm &        (then open the Display)',
    '  ps',
    '  sc -S fib.sm           (see the bytecode)',
    '  edit fib.sm',
    '  ls | grep sm',
    '',
    'The wallpaper is the CPU: every band is a process getting its turn.',
  ].join('\n'),
  [`${HOME}/hello.sm`]: '// your first program\nprint("hello from samaOS");\nprint("I am process", pid());\n',
  [`${HOME}/fib.sm`]: '// recursion on a stack machine\nfn fib(n) {\n  if (n < 2) { return n; }\n  return fib(n - 1) + fib(n - 2);\n}\n\nlet i = 0;\nwhile (i < 20) {\n  print("fib", i, "=", fib(i));\n  i = i + 1;\n}\n',
  [`${HOME}/primes.sm`]: '// counts primes forever; run it with & and watch ps\nfn isPrime(n) {\n  let d = 2;\n  while (d * d <= n) {\n    if (n % d == 0) { return false; }\n    d = d + 1;\n  }\n  return true;\n}\n\nlet n = 2;\nlet found = 0;\nwhile (true) {\n  if (isPrime(n)) {\n    found = found + 1;\n    if (found % 500 == 0) { print(found, "primes so far, latest", n); }\n  }\n  n = n + 1;\n}\n',
  [`${HOME}/mandel.sm`]: '// draws the Mandelbrot set on the display, one pixel at a time\nclear();\nlet y = 0;\nwhile (y < 128) {\n  let x = 0;\n  while (x < 128) {\n    let cr = x / 128 * 3 - 2.2;\n    let ci = y / 128 * 3 - 1.5;\n    let zr = 0;\n    let zi = 0;\n    let i = 0;\n    while (i < 40 && zr * zr + zi * zi < 4) {\n      let t = zr * zr - zi * zi + cr;\n      zi = 2 * zr * zi + ci;\n      zr = t;\n      i = i + 1;\n    }\n    if (i == 40) { draw(x, y, 12, 14, 20); }\n    else { draw(x, y, i * i / 6, i * 4, 40 + i * 5); }\n    x = x + 1;\n  }\n  y = y + 1;\n}\nprint("done");\n',
  [`${HOME}/rings.sm`]: '// ripples on the display that never stop\nlet t = 0;\nwhile (true) {\n  let y = 0;\n  while (y < 128) {\n    let x = 0;\n    while (x < 128) {\n      let dx = x - 64;\n      let dy = y - 64;\n      let d = floor(sqrt(dx * dx + dy * dy) - t);\n      let v = d % 16;\n      draw(x, y, v * 16, 60 + v * 8, 200);\n      x = x + 4;\n    }\n    y = y + 4;\n  }\n  t = t + 1;\n  sleep(30);\n}\n',
  [`${HOME}/clock.sm`]: '// ticks once a second, sleeping in between\nlet s = 0;\nwhile (s < 10) {\n  print("tick", s);\n  sleep(1000);\n  s = s + 1;\n}\nprint("ten seconds, done");\n',
  [`${HOME}/notes/todo.txt`]: 'write a program\nrun two at once\nkill one\n',
};
export function makeFS() {
  const root = { type: 'dir', children: {} };
  const split = p => p.split('/').filter(Boolean);
  function find(path, make = false) {
    let n = root;
    for (const part of split(path)) {
      if (n.type !== 'dir') return null;
      if (!n.children[part]) { if (!make) return null; n.children[part] = { type: 'dir', children: {} }; }
      n = n.children[part];
    }
    return n;
  }
  function write(path, text, append = false) {
    const parts = split(path), name = parts.pop();
    const dir = find('/' + parts.join('/'), true);
    if (!dir || dir.type !== 'dir') throw new Error(`can't write ${path}`);
    const f = dir.children[name];
    if (f && f.type === 'dir') throw new Error(`${path} is a directory`);
    dir.children[name] = { type: 'file', text: append && f ? f.text + text : text, mtime: Date.now() };
    save();
  }
  function remove(path) { const parts = split(path), name = parts.pop(), dir = find('/' + parts.join('/')); if (!dir || !dir.children[name]) throw new Error(`no such file: ${path}`); delete dir.children[name]; save(); }
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('samaos.fs', JSON.stringify(root)); } catch {} }, 250); }
  function reset() { root.children = {}; for (const [p, t] of Object.entries(DEFAULT_FILES)) write(p, t); find('/bin', true); find('/tmp', true); }
  let loaded = false;
  try { const s = JSON.parse(localStorage.getItem('samaos.fs')); if (s && s.type === 'dir') { root.children = s.children; loaded = true; } } catch {}
  if (!loaded) reset();
  return { root, find, write, remove, reset, save, HOME };
}

// ================================================================ processes
const QUANTUM = 400;                  // instructions per turn before the scheduler switches
const MAXDEPTH = 400;
export function makeKernel(fs) {
  const procs = [];
  let nextPid = 100;
  const bootAt = performance.now();
  const listeners = new Set();
  const display = { w: 128, h: 128, px: new Uint8ClampedArray(128 * 128 * 4), dirty: true };
  const HUES = [205, 330, 150, 40, 265, 10, 180, 90, 290, 55];
  let hueI = 0;

  function spawn(path, { stdout, name, cwd = fs.HOME } = {}) {
    const full = resolve(cwd, path);
    const node = fs.find(full);
    if (!node || node.type !== 'file') throw new Error(`no such program: ${path}`);
    const prog = compile(node.text, full.split('/').pop());
    const p = {
      pid: nextPid++, name: name || full.split('/').pop(), prog, state: 'ready', stack: [], frames: [{ fn: 0, pc: 0, locals: [] }], globals: {},
      ins: 0, window: [], share: 0, wake: 0, started: performance.now(), stdout: stdout || (() => {}), hue: HUES[hueI++ % HUES.length], exitMsg: null,
    };
    procs.push(p); emit();
    return p;
  }
  function kill(pid, why = 'killed') {
    const p = procs.find(q => q.pid === pid);
    if (!p || p.state === 'done') return false;
    p.state = 'done'; p.exitMsg = why; p.onExit && p.onExit(why); emit(); return true;
  }
  const emit = () => listeners.forEach(f => f());

  // ---------- the CPU ----------
  function sys(p, name, args) {
    switch (name) {
      case 'print': p.stdout(args.map(v => typeof v === 'number' ? +v.toFixed(6) : v).join(' ')); return 0;
      case 'sleep': p.state = 'sleeping'; p.wake = performance.now() + Math.max(0, args[0] || 0); return 0;
      case 'yield': p.yielded = true; return 0;
      case 'time': return Math.round(performance.now() - bootAt);
      case 'pid': return p.pid;
      case 'rand': return Math.random();
      case 'floor': return Math.floor(args[0]);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'len': return String(args[0]).length;
      case 'str': return String(args[0]);
      case 'draw': { const [x, y, r, g, b] = args.map(v => Math.floor(v)); if (x >= 0 && y >= 0 && x < 128 && y < 128) { const i = (y * 128 + x) * 4; display.px[i] = r; display.px[i + 1] = g; display.px[i + 2] = b; display.px[i + 3] = 255; display.dirty = true; } return 0; }
      case 'clear': display.px.fill(0); display.dirty = true; return 0;
      case 'spawn': try { return spawn(String(args[0]), { stdout: p.stdout, cwd: fs.HOME }).pid; } catch (e) { p.stdout(e.message); return -1; }
    }
    return 0;
  }
  function run(p, budget) {
    const S = p.stack; let n = 0;
    try {
      while (n < budget && p.state === 'ready' && !p.yielded) {
        const fr = p.frames[p.frames.length - 1], code = p.prog.fns[fr.fn].code, ins = code[fr.pc++]; n++;
        const [op, a] = ins;
        switch (op) {
          case 'CONST': S.push(a); break;
          case 'LOAD': S.push(fr.locals[a] ?? 0); break;
          case 'STORE': fr.locals[a] = S.pop(); break;
          case 'GLOAD': S.push(p.globals[a] ?? 0); break;
          case 'GSTORE': p.globals[a] = S.pop(); break;
          case 'DUP': S.push(S[S.length - 1]); break;
          case 'POP': S.pop(); break;
          case 'ADD': { const b = S.pop(); S.push(S.pop() + b); break; }
          case 'SUB': { const b = S.pop(); S.push(S.pop() - b); break; }
          case 'MUL': { const b = S.pop(); S.push(S.pop() * b); break; }
          case 'DIV': { const b = S.pop(); if (b === 0) throw new Error('division by zero'); S.push(S.pop() / b); break; }
          case 'MOD': { const b = S.pop(); if (b === 0) throw new Error('division by zero'); S.push(S.pop() % b); break; }
          case 'EQ': { const b = S.pop(); S.push(S.pop() === b ? 1 : 0); break; }
          case 'NE': { const b = S.pop(); S.push(S.pop() !== b ? 1 : 0); break; }
          case 'LT': { const b = S.pop(); S.push(S.pop() < b ? 1 : 0); break; }
          case 'LE': { const b = S.pop(); S.push(S.pop() <= b ? 1 : 0); break; }
          case 'GT': { const b = S.pop(); S.push(S.pop() > b ? 1 : 0); break; }
          case 'GE': { const b = S.pop(); S.push(S.pop() >= b ? 1 : 0); break; }
          case 'NOT': S.push(S.pop() ? 0 : 1); break;
          case 'NEG': S.push(-S.pop()); break;
          case 'JMP': fr.pc = a; break;
          case 'JF': if (!S[S.length - 1]) fr.pc = a; break;
          case 'JT': if (S[S.length - 1]) fr.pc = a; break;
          case 'CALL': {
            if (p.frames.length > MAXDEPTH) throw new Error('stack overflow (too much recursion)');
            const f = p.prog.fns[a], locals = [];
            for (let k = f.params.length - 1; k >= 0; k--) locals[k] = S.pop();
            p.frames.push({ fn: a, pc: 0, locals }); break;
          }
          case 'RET': p.frames.pop(); break;
          case 'SYS': { const [name, argc] = a; const args = S.splice(S.length - argc, argc); S.push(sys(p, name, args)); break; }
          case 'HALT': p.state = 'done'; p.exitMsg = 'exited'; break;
        }
      }
    } catch (e) {
      const fr = p.frames[p.frames.length - 1], line = fr && p.prog.fns[fr.fn].code[fr.pc - 1]?.[2];
      p.stdout(`${p.name}${line ? `:${line}` : ''}: ${e.message}`); p.state = 'done'; p.exitMsg = 'crashed';
    }
    p.yielded = false;
    p.ins += n;
    if (p.state === 'done') { p.onExit && p.onExit(p.exitMsg); emit(); }
    return n;
  }

  // ---------- the scheduler: round robin, a quantum at a time ----------
  const BUDGET = 60000;                 // instructions per frame, about 3.6 million a second
  let rr = 0, lastSlices = [];
  function tick() {
    const now = performance.now();
    for (const p of procs) if (p.state === 'sleeping' && now >= p.wake) p.state = 'ready';
    const used = new Map();
    let left = BUDGET, guard = 0;
    while (left > 0 && guard++ < 1000) {
      const ready = procs.filter(p => p.state === 'ready');
      if (!ready.length) break;
      const p = ready[rr++ % ready.length];
      const n = run(p, Math.min(QUANTUM, left));
      used.set(p, (used.get(p) || 0) + n);
      left -= n;
      if (n === 0) break;
    }
    // CPU share over the last second, for ps and the monitor
    for (const p of procs) { p.window.push(used.get(p) || 0); if (p.window.length > 60) p.window.shift(); p.share = p.window.reduce((a, b) => a + b, 0) / (BUDGET * p.window.length); }
    lastSlices = [...used].map(([p, n]) => ({ hue: p.hue, n, pid: p.pid }));
    // reap finished processes after a moment so ps can still show them
    for (let i = procs.length - 1; i >= 0; i--) if (procs[i].state === 'done' && now - (procs[i].doneAt ??= now) > 4000) { procs.splice(i, 1); emit(); }
    return { used: BUDGET - left, budget: BUDGET, slices: lastSlices };
  }

  return {
    procs, spawn, kill, tick, display, compile, BUDGET, QUANTUM,
    uptime: () => performance.now() - bootAt,
    on(f) { listeners.add(f); return () => listeners.delete(f); },
  };
}

export function resolve(cwd, path) {
  if (!path) return cwd;
  const parts = (path.startsWith('/') ? path : `${cwd}/${path}`).split('/');
  const out = [];
  for (const p of parts) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p); }
  return '/' + out.join('/');
}
