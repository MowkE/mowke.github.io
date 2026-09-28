// shell.js
// The samaOS shell: pipes (|), redirection (> and >>), background jobs (&),
// and a set of commands that read and write the kernel's file system.

import { resolve, disassemble, BUILTINS } from './kernel.js';

export function makeShell(os, term) {
  const { fs, kernel } = os;
  const sh = { cwd: fs.HOME, history: [], fg: null };
  const pretty = p => p.startsWith(fs.HOME) ? '~' + p.slice(fs.HOME.length) : p;
  const node = p => fs.find(resolve(sh.cwd, p));
  const need = (p, what = 'file') => { const n = node(p); if (!n) throw new Error(`${p}: no such file or folder`); if (what === 'file' && n.type !== 'file') throw new Error(`${p} is a folder`); return n; };

  // every command takes (args, input lines) and returns output lines
  const CMD = {
    help: a => a[0] === 'sama' ? [
      'sama, the samaOS language:',
      '  let x = 10;            make a variable',
      '  x = x + 1;             change it',
      '  fn add(a, b) { return a + b; }',
      '  if (x > 3) { ... } else { ... }',
      '  while (x < 100) { ... }',
      '  // comments',
      'built-in functions:',
      ...Object.entries(BUILTINS).map(([k, v]) => `  ${k.padEnd(8)}${v}`),
    ] : [
      'files     ls  cd  pwd  cat  echo  mkdir  touch  rm  mv  cp',
      'text      grep  wc  head  sort',
      'programs  run <file.sm> [&]   sc [-S] <file.sm>   ps   kill <pid>',
      'apps      edit <file>   open terminal|editor|files|monitor|display',
      'system    clear  history  uptime  uname  whoami  date  reset',
      '',
      'Pipe with |, save output with > or >>, run in the background with &.',
      'help sama   explains the language programs are written in.',
    ],
    ls: a => {
      const all = a.includes('-a'), p = a.find(x => !x.startsWith('-')) || '.';
      const n = need(p, 'any');
      if (n.type === 'file') return [p];
      return Object.entries(n.children).filter(([k]) => all || !k.startsWith('.')).sort().map(([k, v]) => v.type === 'dir' ? `${k}/` : k);
    },
    cd: a => { const p = resolve(sh.cwd, a[0] || fs.HOME), n = fs.find(p); if (!n || n.type !== 'dir') throw new Error(`${a[0]}: no such folder`); sh.cwd = p; term.prompt(); return []; },
    pwd: () => [sh.cwd],
    cat: (a, inp) => a.length ? a.flatMap(p => need(p).text.split('\n')) : inp,
    echo: a => [a.join(' ')],
    mkdir: a => { if (!a[0]) throw new Error('mkdir needs a name'); fs.find(resolve(sh.cwd, a[0]), true); fs.save(); return []; },
    touch: a => { if (!a[0]) throw new Error('touch needs a name'); if (!node(a[0])) fs.write(resolve(sh.cwd, a[0]), ''); return []; },
    rm: a => { if (!a[0]) throw new Error('rm needs a name'); fs.remove(resolve(sh.cwd, a[0])); return []; },
    cp: a => { if (a.length < 2) throw new Error('cp needs a file and a new name'); fs.write(resolve(sh.cwd, a[1]), need(a[0]).text); return []; },
    mv: a => { if (a.length < 2) throw new Error('mv needs a file and a new name'); const t = need(a[0]).text; fs.write(resolve(sh.cwd, a[1]), t); fs.remove(resolve(sh.cwd, a[0])); return []; },
    grep: (a, inp) => { if (!a[0]) throw new Error('grep needs a pattern'); const lines = a[1] ? need(a[1]).text.split('\n') : inp; return lines.filter(l => l.includes(a[0])); },
    wc: (a, inp) => { const lines = a[0] ? need(a[0]).text.split('\n') : inp; const words = lines.join(' ').split(/\s+/).filter(Boolean).length; return [`${lines.length} lines  ${words} words  ${lines.join('\n').length} characters`]; },
    head: (a, inp) => { let n = 10; const i = a.indexOf('-n'); if (i >= 0) { n = +a[i + 1] || 10; a = a.filter((_, k) => k !== i && k !== i + 1); } return (a[0] ? need(a[0]).text.split('\n') : inp).slice(0, n); },
    sort: (a, inp) => [...(a[0] ? need(a[0]).text.split('\n') : inp)].sort(),
    ps: () => [
      '  PID  STATE     CPU   INSTRUCTIONS  NAME',
      ...kernel.procs.map(p => `${String(p.pid).padStart(5)}  ${p.state.padEnd(8)} ${(p.share * 100).toFixed(0).padStart(3)}%  ${String(p.ins).padStart(12)}  ${p.name}`),
      ...(kernel.procs.length ? [] : ['  (nothing is running)']),
    ],
    kill: a => { const pid = +a[0]; if (!kernel.kill(pid)) throw new Error(`there's no running process ${a[0] || ''}`); return [`killed ${pid}`]; },
    sc: a => {
      const f = a.find(x => !x.startsWith('-')); if (!f) throw new Error('sc needs a .sm file');
      const prog = kernel.compile(need(f).text, f);
      const n = prog.fns.reduce((s, fn) => s + fn.code.length, 0);
      return a.includes('-S') ? disassemble(prog) : [`compiled ${f}: ${prog.fns.length} function${prog.fns.length === 1 ? '' : 's'}, ${n} instructions`];
    },
    edit: a => { os.open('editor', { path: resolve(sh.cwd, a[0] || 'untitled.sm') }); return []; },
    open: a => { const app = (a[0] || '').toLowerCase(); if (!os.apps[app]) throw new Error(`there's no app called ${a[0] || ''}; try terminal, editor, files, monitor or display`); os.open(app); return []; },
    clear: () => { term.clear(); return []; },
    history: () => sh.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`),
    uptime: () => { const s = Math.floor(kernel.uptime() / 1000); return [`up ${Math.floor(s / 60)}m ${s % 60}s, ${kernel.procs.filter(p => p.state !== 'done').length} processes`]; },
    uname: () => ['samaOS 1.0 (sama VM, round-robin scheduler, 400-instruction quantum)'],
    whoami: () => ['sama'],
    date: () => [new Date().toString()],
    reset: () => { fs.reset(); sh.cwd = fs.HOME; term.prompt(); return ['Files restored to how samaOS shipped.']; },
  };

  // run a .sm program; foreground runs hold the prompt until they finish
  function runProgram(args, bg) {
    const f = args[0]; if (!f) throw new Error('run needs a .sm file, like  run hello.sm');
    const p = kernel.spawn(f, { stdout: s => term.write(bg ? `[${p.pid}] ${s}` : s), cwd: sh.cwd });
    if (bg) { term.write(`[${p.pid}] started ${p.name}`, 'dim'); return; }
    sh.fg = p; term.busy(true);
    p.onExit = why => { if (why === 'crashed' || why === 'killed') term.write(`${p.name} ${why}`, 'err'); sh.fg = null; term.busy(false); };
  }

  function exec(line) {
    line = line.trim();
    if (!line) return;
    sh.history.push(line);
    let bg = false;
    if (line.endsWith('&')) { bg = true; line = line.slice(0, -1).trim(); }
    let target = null, append = false;
    const m = line.match(/\s(>>?)\s*(\S+)\s*$/);
    if (m) { append = m[1] === '>>'; target = m[2]; line = line.slice(0, m.index).trim(); }
    const stages = line.split('|').map(s => s.trim().split(/\s+/).filter(Boolean));
    try {
      if (stages.length === 1 && (stages[0][0] === 'run' || stages[0][0]?.endsWith('.sm'))) {
        const args = stages[0][0] === 'run' ? stages[0].slice(1) : stages[0];
        return runProgram(args, bg);
      }
      let data = [];
      for (const [cmd, ...args] of stages) {
        const fn = CMD[cmd];
        if (!fn) throw new Error(`${cmd}: command not found. Type help to see what samaOS can do.`);
        data = fn(args, data) || [];
      }
      if (target) fs.write(resolve(sh.cwd, target), data.join('\n') + (data.length ? '\n' : ''), append);
      else data.forEach(l => term.write(l));
    } catch (e) { term.write(e.message, 'err'); }
  }
  // Ctrl-C stops whatever is running in the foreground
  function interrupt() { if (sh.fg) kernel.kill(sh.fg.pid, 'killed'); }
  const complete = word => {
    const dir = word.includes('/') ? word.slice(0, word.lastIndexOf('/') + 1) : '';
    const n = fs.find(resolve(sh.cwd, dir || '.'));
    if (!n || n.type !== 'dir') return [];
    return Object.keys(n.children).filter(k => k.startsWith(word.slice(dir.length))).map(k => dir + k + (n.children[k].type === 'dir' ? '/' : ''));
  };
  return { exec, interrupt, complete, get cwd() { return pretty(sh.cwd); }, sh, commands: Object.keys(CMD) };
}
