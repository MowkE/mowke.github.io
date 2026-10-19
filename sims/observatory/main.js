import { projects, exhibitPosition } from './projects.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const touch = matchMedia('(pointer: coarse)');
const state = { ready: false, started: false, mode: 'orbit', selected: -1, hovered: -1, nearby: -1, paused: reducedMotion.matches, sound: false, time: 0, transition: null };
let THREE, renderer, scene, camera, controls, world;
let lastFrame = 0, pointerDown = null, dragging = false, lookYaw = 0, lookPitch = 0;
let audioContext, masterGain, audioVoices = [];
const keys = new Set(), padKeys = new Set();
const activePointers = new Set();
let multiTouch = false;
const markers = [];
let projected, raycaster, pointer, lookDirection, moveVector;

// The directory remains usable even if the graphics module cannot load.
projects.forEach((project, index) => {
  const item = document.createElement('li'); item.style.setProperty('--item-color', project.color);
  const visit = document.createElement('button'); visit.type = 'button'; visit.className = 'directory-visit';
  visit.setAttribute('aria-label', `Visit ${project.name} in the observatory`);
  const number = document.createElement('span'); number.className = 'directory-number'; number.textContent = project.symbol;
  const name = document.createElement('span'); name.className = 'directory-name'; name.textContent = project.name;
  const field = document.createElement('span'); field.className = 'directory-field'; field.textContent = project.field;
  visit.append(number, name, field);
  visit.addEventListener('click', () => { if (state.ready) { closeDialog('directory'); selectExhibit(index); } else window.open(project.url, '_blank', 'noopener'); });
  const direct = document.createElement('a'); direct.className = 'directory-direct'; direct.href = project.url; direct.target = '_blank'; direct.rel = 'noopener'; direct.textContent = '↗'; direct.setAttribute('aria-label', `Open ${project.name} in a new tab`);
  item.append(visit, direct); $('directory-list').append(item);
  const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'exhibit-marker'; marker.style.setProperty('--marker', project.color); marker.setAttribute('aria-label', `Explore ${project.name}`);
  const badge = document.createElement('span'); badge.className = 'marker-number'; badge.textContent = project.symbol;
  const caption = document.createElement('span'); caption.className = 'marker-name'; caption.textContent = project.name;
  marker.append(badge, caption); marker.addEventListener('click', () => selectExhibit(index));
  marker.addEventListener('pointerenter', () => { state.hovered = index; }); marker.addEventListener('pointerleave', () => { state.hovered = -1; });
  marker.tabIndex = -1; $('labels').append(marker); markers.push(marker);
});

function announce(message) { $('announcement').textContent = message; }
function modalOpen() { return $('directory').open || $('help').open; }
function showDialog(id) { keys.clear(); padKeys.clear(); $(id).showModal(); }
function closeDialog(id) { $(id).close(); }
$('directory-open').addEventListener('click', () => showDialog('directory'));
$('directory-close').addEventListener('click', () => closeDialog('directory'));
$('help-open').addEventListener('click', () => showDialog('help'));
$('help-close').addEventListener('click', () => closeDialog('help'));
$('help-done').addEventListener('click', () => closeDialog('help'));
$('fallback-index').addEventListener('click', () => showDialog('directory'));
for (const id of ['directory', 'help']) $(id).addEventListener('click', event => {
  const bounds = $(id).getBoundingClientRect();
  if (event.target === $(id) && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeDialog(id);
});

function startVisit() {
  if (!state.ready) return;
  const focusWasInIntro = $('introduction').contains(document.activeElement);
  state.started = true;
  document.body.classList.add('exploring');
  $('introduction').setAttribute('aria-hidden', 'true');
  $('introduction').inert = true;
  $('room-controls').hidden = false;
  if (focusWasInIntro) renderer.domElement.focus({ preventScroll: true });
}
function applyFraming() {
  if (!camera) return;
  const width = innerWidth, height = innerHeight, mobile = width <= 760;
  camera.aspect = width / height;
  camera.fov = mobile ? 49 : 43;
  let x = 0, y = 0;
  if (!state.started) { x = mobile ? 0 : -width * .17; y = mobile ? height * .20 : 0; }
  else if (state.selected >= 0) { x = mobile ? 0 : width * .17; y = mobile ? height * .21 : 0; }
  if (state.mode === 'walk') { x = 0; y = 0; camera.fov = mobile ? 66 : 65; }
  camera.setViewOffset(width, height, x, y, width, height);
  camera.updateProjectionMatrix();
}
function moveCamera(position, target, duration = 1550) {
  controls.enabled = false;
  state.transition = { start: performance.now(), duration: reducedMotion.matches ? 0 : duration, from: camera.position.clone(), fromTarget: controls.target.clone(), to: position, target };
}
function orbitMode() {
  state.mode = 'orbit'; keys.clear(); padKeys.clear();
  document.body.classList.remove('walking');
  $('walk').classList.remove('active'); $('walk').setAttribute('aria-pressed', 'false');
  $('overview').classList.add('active'); $('overview').setAttribute('aria-pressed', 'true');
  $('walk-pad').hidden = true; $('crosshair').hidden = true; $('walk-prompt').hidden = true;
  $('interaction-hint').innerHTML = 'DRAG TO ORBIT <span>·</span> SCROLL TO LOOK CLOSER <span>·</span> 1–9 TO VISIT';
}
function overview() {
  if (!state.ready) return;
  startVisit(); orbitMode(); state.selected = -1;
  $('exhibit-card').hidden = true;
  $('location-title').textContent = 'THE GRAND ROTUNDA'; $('location-subtitle').textContent = 'Nine ways to see a little further';
  $('position-count').textContent = '00 / 09'; controls.minDistance = 20; controls.maxDistance = innerWidth <= 760 ? 135 : 95;
  applyFraming();
  const mobile = innerWidth <= 760;
  moveCamera(new THREE.Vector3(...(mobile ? [58, 58, 76] : [31, 29, 39])), new THREE.Vector3(0, 2.5, 0));
  announce('Room overview. Choose a numbered exhibit or walk the floor.');
}
function selectExhibit(index) {
  if (!state.ready) return;
  index = (index + projects.length) % projects.length;
  startVisit(); orbitMode(); state.selected = index; state.nearby = -1;
  const project = projects[index], position = exhibitPosition(index);
  const card = $('exhibit-card'); card.hidden = false; card.style.setProperty('--exhibit-color', project.color);
  $('exhibit-field').textContent = `${project.symbol} / ${project.field}`;
  $('exhibit-name').textContent = project.name;
  $('exhibit-title').textContent = project.title;
  $('exhibit-description').textContent = project.description;
  $('exhibit-detail').textContent = project.detail;
  $('project-open').href = project.url; $('project-open').setAttribute('aria-label', `Open ${project.name} in a new tab`);
  $('location-title').textContent = `${project.symbol} / ${project.label}`;
  $('location-subtitle').textContent = project.field;
  $('position-count').textContent = `${project.symbol} / 09`;
  const radius = innerWidth <= 760 ? 9 : 7.8;
  const normal = new THREE.Vector3(position.x, 0, position.z).normalize();
  const tangent = new THREE.Vector3(normal.z, 0, -normal.x);
  const destination = new THREE.Vector3(position.x, 4.1, position.z).addScaledVector(normal, -radius).addScaledVector(tangent, 2.1);
  controls.minDistance = 4; controls.maxDistance = 20;
  applyFraming(); moveCamera(destination, new THREE.Vector3(position.x, 2.5, position.z));
  announce(`${project.name}. ${project.title}`);
}
function walk() {
  if (!state.ready) return;
  const prior = state.selected;
  startVisit(); state.selected = -1; state.mode = 'walk'; state.transition = null;
  $('exhibit-card').hidden = true; controls.enabled = false;
  document.body.classList.add('walking');
  $('walk').classList.add('active'); $('walk').setAttribute('aria-pressed', 'true');
  $('overview').classList.remove('active'); $('overview').setAttribute('aria-pressed', 'false');
  $('crosshair').hidden = false; $('walk-pad').hidden = !touch.matches;
  if (prior >= 0) {
    const p = exhibitPosition(prior); camera.position.set(p.x * .67, 2.55, p.z * .67); lookYaw = Math.atan2(-p.x, -p.z);
  } else { camera.position.set(0, 2.55, 18.5); lookYaw = 0; }
  lookPitch = -.03; camera.rotation.order = 'YXZ'; camera.rotation.set(lookPitch, lookYaw, 0);
  $('location-title').textContent = 'ON THE OBSERVATORY FLOOR'; $('location-subtitle').textContent = 'Take your time. There is no wrong turn.';
  $('position-count').textContent = '· / 09';
  $('interaction-hint').innerHTML = touch.matches ? 'DIRECTION PAD TO WALK <span>·</span> DRAG TO LOOK' : 'W A S D TO WALK <span>·</span> DRAG TO LOOK <span>·</span> E TO DISCOVER <span>·</span> ESC TO LEAVE';
  keys.clear(); padKeys.clear(); applyFraming(); renderer.domElement.focus({ preventScroll: true });
  announce('Walk mode. Move with W A S D or arrow keys and drag to look.');
}
$('begin').addEventListener('click', () => selectExhibit(0));
$('intro-walk').addEventListener('click', walk); $('walk').addEventListener('click', walk);
$('overview').addEventListener('click', overview); $('exhibit-close').addEventListener('click', overview);
$('next').addEventListener('click', () => selectExhibit(state.selected + 1));
$('prev').addEventListener('click', () => selectExhibit(state.selected < 0 ? 8 : state.selected - 1));
$('next-exhibit').addEventListener('click', () => selectExhibit(state.selected + 1));
$('inspect').addEventListener('click', () => { if (state.nearby >= 0) selectExhibit(state.nearby); });

function updatePause() {
  $('motion').setAttribute('aria-pressed', String(state.paused));
  $('motion').setAttribute('aria-label', state.paused ? 'Resume sculpture motion' : 'Pause sculpture motion');
  $('motion').textContent = state.paused ? '▷' : 'Ⅱ';
}
$('motion').addEventListener('click', () => { state.paused = !state.paused; updatePause(); announce(state.paused ? 'Sculptures paused.' : 'Sculptures moving.'); });
reducedMotion.addEventListener('change', event => { state.paused = event.matches; updatePause(); });
updatePause();

async function toggleSound() {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Audio is unavailable');
      audioContext = new AudioContextClass(); masterGain = audioContext.createGain(); masterGain.gain.value = 0; masterGain.connect(audioContext.destination);
      const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 450; filter.connect(masterGain);
      [65.406, 98, 130.813, 196.0].forEach((frequency, i) => {
        const oscillator = audioContext.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        const gain = audioContext.createGain(); gain.gain.value = .045 / (1 + i * .5);
        oscillator.connect(gain); gain.connect(filter); oscillator.start(); audioVoices.push(oscillator);
      });
    }
    await audioContext.resume(); state.sound = !state.sound;
    masterGain.gain.setTargetAtTime(state.sound ? .5 : 0, audioContext.currentTime, .4);
    $('sound').textContent = state.sound ? 'Sound on' : 'Sound off'; $('sound').setAttribute('aria-pressed', String(state.sound));
    $('sound').setAttribute('aria-label', state.sound ? 'Disable ambient sound' : 'Enable ambient sound');
  } catch { announce('Ambient sound is unavailable on this device.'); }
}
$('sound').addEventListener('click', toggleSound);

function pick(clientX, clientY) {
  if (!state.ready) return -1;
  pointer.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(world.hitTargets, false);
  return hits.length ? hits[0].object.userData.projectIndex : -1;
}
function bindCanvas() {
  const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Observatory view. Drag to orbit. Keys 1 through 9 select exhibits.');
  canvas.addEventListener('pointerdown', event => {
    activePointers.add(event.pointerId); multiTouch ||= activePointers.size > 1;
    pointerDown = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, id: event.pointerId };
    dragging = false;
    if (state.mode === 'walk') canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (pointerDown) {
      const dx = event.clientX - pointerDown.lastX, dy = event.clientY - pointerDown.lastY;
      dragging ||= Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6;
      if (state.mode === 'walk' && dragging && !modalOpen()) {
        lookYaw -= dx * .0035; lookPitch = Math.max(-1.15, Math.min(1.15, lookPitch - dy * .0035));
      }
      pointerDown.lastX = event.clientX; pointerDown.lastY = event.clientY;
    } else if (state.mode === 'orbit') {
      state.hovered = pick(event.clientX, event.clientY); canvas.style.cursor = state.hovered >= 0 ? 'pointer' : 'grab';
    }
  });
  canvas.addEventListener('pointerup', event => {
    if (event.button === 0 && pointerDown && !dragging && !multiTouch && !state.transition && !modalOpen()) {
      const hit = pick(event.clientX, event.clientY);
      if (hit >= 0) {
        const p = exhibitPosition(hit);
        if (state.mode !== 'walk' || Math.hypot(camera.position.x - p.x, camera.position.z - p.z) < 6.5) selectExhibit(hit);
      }
    }
    activePointers.delete(event.pointerId);
    if (!activePointers.size) { pointerDown = null; dragging = false; multiTouch = false; }
  });
  canvas.addEventListener('pointercancel', event => { activePointers.delete(event.pointerId); pointerDown = null; dragging = false; multiTouch = false; });
  canvas.addEventListener('pointerleave', () => { state.hovered = -1; });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail('The graphics connection was interrupted. Reload to reopen the room, or browse the instruments below.'); });
  controls.addEventListener('start', () => { state.transition = null; });
}
function ignoreKey(event) { return modalOpen() || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName); }
addEventListener('keydown', event => {
  if (!state.ready || ignoreKey(event)) return;
  if (event.code === 'Escape') { overview(); return; }
  if (event.code.startsWith('Digit') && /^[1-9]$/.test(event.key)) { event.preventDefault(); selectExhibit(Number(event.key) - 1); return; }
  if (state.mode === 'walk') {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyE' && state.nearby >= 0) { event.preventDefault(); selectExhibit(state.nearby); }
  } else if (event.target === document.body || event.target === renderer.domElement) {
    if (event.code === 'ArrowRight') { event.preventDefault(); selectExhibit(state.selected + 1); }
    if (event.code === 'ArrowLeft') { event.preventDefault(); selectExhibit(state.selected < 0 ? 8 : state.selected - 1); }
  }
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => { keys.clear(); padKeys.clear(); activePointers.clear(); multiTouch = false; pointerDown = null; });
for (const button of document.querySelectorAll('[data-move]')) {
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); padKeys.add(button.dataset.move); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => button.addEventListener(type, () => padKeys.delete(button.dataset.move)));
}

function walkFrame(dt) {
  if (modalOpen()) return;
  camera.rotation.set(lookPitch, lookYaw, 0, 'YXZ');
  let forward = Number(keys.has('KeyW') || keys.has('ArrowUp') || padKeys.has('forward')) - Number(keys.has('KeyS') || keys.has('ArrowDown') || padKeys.has('back'));
  let side = Number(keys.has('KeyD') || keys.has('ArrowRight') || padKeys.has('right')) - Number(keys.has('KeyA') || keys.has('ArrowLeft') || padKeys.has('left'));
  const length = Math.hypot(forward, side);
  if (length) {
    forward /= length; side /= length;
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7 : 4;
    moveVector.set(-Math.sin(lookYaw) * forward + Math.cos(lookYaw) * side, 0, -Math.cos(lookYaw) * forward - Math.sin(lookYaw) * side).multiplyScalar(dt * speed);
    const next = camera.position.clone().add(moveVector);
    const radius = Math.hypot(next.x, next.z);
    if (radius > 18.5) { next.x *= 18.5 / radius; next.z *= 18.5 / radius; }
    if (radius < 4.95) { const r = Math.max(.001, radius); next.x *= 4.95 / r; next.z *= 4.95 / r; }
    projects.forEach((_, i) => {
      const p = exhibitPosition(i), dx = next.x - p.x, dz = next.z - p.z, distance = Math.hypot(dx, dz);
      if (distance < 2.35) { const d = Math.max(.001, distance); next.x = p.x + dx / d * 2.35; next.z = p.z + dz / d * 2.35; }
    });
    camera.position.copy(next);
  }
  controls.target.copy(camera.position); camera.getWorldDirection(lookDirection); controls.target.addScaledVector(lookDirection, 5);
  let nearest = -1, best = 6;
  projects.forEach((_, i) => {
    const p = exhibitPosition(i), dx = p.x - camera.position.x, dz = p.z - camera.position.z, distance = Math.hypot(dx, dz);
    const facing = (dx * -Math.sin(lookYaw) + dz * -Math.cos(lookYaw)) / Math.max(distance, .01);
    if (distance < best && facing > .65) { nearest = i; best = distance; }
  });
  if (state.nearby !== nearest) {
    state.nearby = nearest; $('walk-prompt').hidden = nearest < 0;
    if (nearest >= 0) $('nearby-name').textContent = projects[nearest].name;
  }
}
function updateLabels() {
  camera.updateMatrixWorld();
  const mobile = innerWidth <= 760;
  markers.forEach((marker, i) => {
    projected.copy(world.anchors[i]).project(camera);
    const x = (projected.x * .5 + .5) * innerWidth, y = (-projected.y * .5 + .5) * innerHeight;
    const obscuredByCard = state.selected >= 0 && (mobile ? y > innerHeight * .5 : x > innerWidth - 445);
    const obscuredByIntro = !state.started && (mobile ? y > innerHeight * .48 : x < innerWidth * .42);
    const visible = !state.transition && state.mode !== 'walk' && projected.z > -1 && projected.z < 1 && x > 35 && x < innerWidth - 35 && y > 120 && y < innerHeight - 130 && !obscuredByCard && !obscuredByIntro && state.selected !== i;
    marker.classList.toggle('in-view', visible); marker.classList.toggle('current', i === state.selected);
    marker.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    marker.style.pointerEvents = visible ? 'auto' : 'none'; marker.tabIndex = visible ? 0 : -1; marker.setAttribute('aria-hidden', String(!visible));
  });
}
function resize() {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth <= 760 ? 1.5 : 1.75)); renderer.setSize(innerWidth, innerHeight); applyFraming();
}
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  keys.clear(); padKeys.clear(); lastFrame = 0;
  if (audioContext && masterGain) masterGain.gain.setTargetAtTime(document.hidden ? 0 : state.sound ? .5 : 0, audioContext.currentTime, .2);
  if (renderer) renderer.setAnimationLoop(document.hidden || !state.ready ? null : frame);
});
function frame(now) {
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .045) : .016; lastFrame = now;
  if (!state.paused) state.time += dt;
  if (state.transition) {
    const transition = state.transition;
    const t = transition.duration ? Math.min(1, (performance.now() - transition.start) / transition.duration) : 1;
    const ease = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(transition.from, transition.to, ease); controls.target.lerpVectors(transition.fromTarget, transition.target, ease);
    camera.lookAt(controls.target);
    if (t === 1) { state.transition = null; controls.enabled = state.mode === 'orbit'; }
  } else if (state.mode === 'walk') walkFrame(dt);
  else controls.update();
  world.update(state.time, state.selected, state.hovered); updateLabels(); renderer.render(scene, camera);
}
function fail(message) {
  state.ready = false;
  renderer?.setAnimationLoop(null);
  document.body.classList.add('fallback-mode'); $('fallback').hidden = false; $('labels').hidden = true;
  $('room-controls').hidden = true; $('exhibit-card').hidden = true; $('walk-prompt').hidden = true; $('walk-pad').hidden = true; $('crosshair').hidden = true;
  if (audioContext && masterGain) masterGain.gain.setTargetAtTime(0, audioContext.currentTime, .2);
  if (message) $('fallback-message').textContent = message;
  announce('The 3D room is unavailable. All nine projects are available in the exhibit index.');
}

async function boot() {
  try {
    const modules = await Promise.all([import('./vendor/three.module.js'), import('./vendor/OrbitControls.js'), import('./scene.js')]);
    THREE = modules[0];
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    $('world').append(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color('#081a17'); scene.fog = new THREE.FogExp2('#081a17', .006);
    camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, .15, 280);
    camera.position.set(...(innerWidth <= 760 ? [43, 43, 57] : [31, 27, 39]));
    controls = new modules[1].OrbitControls(camera, renderer.domElement); controls.target.set(0, 2.5, 0); controls.enableDamping = true; controls.dampingFactor = .07; controls.enablePan = false; controls.rotateSpeed = .45; controls.zoomSpeed = .7;
    controls.minDistance = 20; controls.maxDistance = innerWidth <= 760 ? 135 : 95; controls.minPolarAngle = .18; controls.maxPolarAngle = Math.PI / 2 - .06;
    projected = new THREE.Vector3(); lookDirection = new THREE.Vector3(); moveVector = new THREE.Vector3(); raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2();
    world = modules[2].buildObservatory(scene); resize(); controls.update(); bindCanvas();
    state.ready = true;
    $('begin').disabled = false; $('begin').innerHTML = 'Begin the visit <span aria-hidden="true">→</span>'; $('intro-walk').disabled = false;
    $('world').setAttribute('data-ready', 'true');
    renderer.setAnimationLoop(frame);
    const requested = new URLSearchParams(location.search).get('exhibit');
    if (requested) { const index = projects.findIndex(project => project.name.toLowerCase() === requested.toLowerCase()); if (index >= 0) selectExhibit(index); }
  } catch (error) { console.error('Observatory could not start:', error); fail(); }
}
boot();
