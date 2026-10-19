import * as THREE from './vendor/three.module.js';
import { createExhibit } from './exhibits.js';
import { projects, exhibitPosition } from './projects.js';

const TAU = Math.PI * 2;
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function floorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#233b36'; ctx.fillRect(0, 0, 1024, 1024);
  let seed = 413;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
  for (let i = 0; i < 25000; i++) {
    ctx.fillStyle = random() > .5 ? 'rgba(188,196,169,.055)' : 'rgba(0,6,5,.13)';
    const s = .3 + random() * 2;
    ctx.fillRect(random() * 1024, random() * 1024, s, s);
  }
  ctx.strokeStyle = '#466051'; ctx.lineWidth = 1.3;
  for (let i = 0; i < 1024; i += 128) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3); texture.anisotropy = 4;
  return texture;
}

function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.08, 'rgba(255,255,255,.85)');
  gradient.addColorStop(.26, 'rgba(255,255,255,.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function plaqueTexture(project) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#091a18'; ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = '#6c7151'; ctx.lineWidth = 2; ctx.strokeRect(12, 12, 1000, 232);
  ctx.fillStyle = project.color; ctx.font = '28px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`${project.symbol}  /  ${project.field.toUpperCase()}`, 512, 60);
  ctx.fillStyle = '#ece3c9'; ctx.font = '56px Georgia'; ctx.fillText(project.name, 512, 138);
  ctx.fillStyle = '#a8b4a5'; ctx.font = '25px monospace'; ctx.fillText(project.label, 512, 198);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildObservatory(scene) {
  const stone = new THREE.MeshStandardMaterial({ color: '#34453e', roughness: .86, metalness: .15 });
  const dark = new THREE.MeshStandardMaterial({ color: '#102824', roughness: .62, metalness: .35 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b79b61', metalness: .7, roughness: .31 });
  const edge = new THREE.MeshBasicMaterial({ color: '#b19863' });
  const light = new THREE.MeshBasicMaterial({ color: '#f8ddb0' });
  const glowMap = glowTexture();
  const root = new THREE.Group(); scene.add(root);
  const instanceMatrix = new THREE.Matrix4();
  const instanceObject = new THREE.Object3D();
  function mesh(geometry, material, position = [0, 0, 0], parent = root) {
    const item = new THREE.Mesh(geometry, material); item.position.set(...position);
    parent.add(item); return item;
  }
  function cylinder(radius, height, material, y, segments = 96) {
    return mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material, [0, y, 0]);
  }
  function ring(radius, tube, material, y, parent = root, arc = TAU) {
    const item = mesh(new THREE.TorusGeometry(radius, tube, 5, 128, arc), material, [0, y, 0], parent);
    item.rotation.x = -Math.PI / 2; return item;
  }
  function strut(a, b, radius, material, parent = root) {
    const delta = b.clone().sub(a);
    const item = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), material, [0, 0, 0], parent);
    item.position.copy(a).add(b).multiplyScalar(.5);
    item.quaternion.setFromUnitVectors(v(0, 1, 0), delta.normalize()); return item;
  }
  function glow(color, position, size, opacity = .5, parent = root) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color, map: glowMap, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.position.set(...position); sprite.scale.set(size, size, 1); parent.add(sprite); return sprite;
  }

  // An open, cutaway rotunda: dressed stone below, fine brass above.
  cylinder(21.5, .55, dark, -.9);
  cylinder(20.9, .4, stone, -.44);
  cylinder(20.3, .4, new THREE.MeshStandardMaterial({ color: '#b6b4a0', map: floorTexture(), roughness: .72, metalness: .22 }), -.03);
  [20.35, 20.9, 21.48].forEach((r, i) => ring(r, .026, edge, -.15 - i * .36));
  [5.3, 6, 9.3, 16, 17.4, 19.5].forEach(r => ring(r, .018, edge, .19));
  const seams = [];
  for (let i = 0; i < 72; i++) {
    const a = i * TAU / 72;
    const r = i % 6 === 0 ? 6 : 18.9;
    seams.push(Math.sin(a) * r, .19, Math.cos(a) * r, Math.sin(a) * 19.5, .19, Math.cos(a) * 19.5);
  }
  const seamGeo = new THREE.BufferGeometry(); seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seams, 3));
  root.add(new THREE.LineSegments(seamGeo, new THREE.LineBasicMaterial({ color: '#8a7c51', transparent: true, opacity: .45 })));

  // A rear colonnade leaves the collection visible from the entrance.
  const columnShafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.21, .32, 8.2, 12), stone, 25);
  const columnCaps = new THREE.InstancedMesh(new THREE.CylinderGeometry(.48, .48, .24, 12), brass, 50);
  root.add(columnShafts, columnCaps);
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI * .42 + i / 24 * Math.PI * 1.16;
    const x = Math.sin(a) * 18.7, z = Math.cos(a) * 18.7;
    columnShafts.setMatrixAt(i, instanceMatrix.makeTranslation(x, 4.25, z));
    [0.45, 8.3].forEach((y, j) => columnCaps.setMatrixAt(i * 2 + j, instanceMatrix.makeTranslation(x, y, z)));
    if (i % 2 === 0) {
      mesh(new THREE.CylinderGeometry(.035, .035, 3.3, 6), light, [x * .982, 4.4, z * .982]);
      glow('#eabd77', [x, 5.5, z], 2.7, .25);
    }
    if (i < 24) {
      const b = a + Math.PI * 1.16 / 24;
      const points = [];
      for (let j = 0; j <= 18; j++) {
        const t = j / 18; const angle = a + (b - a) * t;
        points.push(v(Math.sin(angle) * 18.7, 7.4 + Math.sin(t * Math.PI) * 1.2, Math.cos(angle) * 18.7));
      }
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, .12, 6, false), brass);
    }
  }
  for (const y of [8.75, 9.05]) {
    const cornice = ring(18.7, .13, brass, y, root, Math.PI * 1.16);
    cornice.rotation.z = Math.PI * (.42 - .5);
  }
  // The oculus floats over the armillary; fine suspension lines reveal scale.
  ring(6.6, .12, brass, 12.7);
  ring(6.85, .035, light, 12.7);
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    if (Math.cos(a) < .6) {
      const curve = new THREE.QuadraticBezierCurve3(v(Math.sin(a) * 18.7, 9, Math.cos(a) * 18.7), v(Math.sin(a) * 13, 13.2, Math.cos(a) * 13), v(Math.sin(a) * 6.6, 12.7, Math.cos(a) * 6.6));
      mesh(new THREE.TubeGeometry(curve, 32, .045, 5, false), brass);
    }
  }

  // Monumental armillary: the common thread between the nine disciplines.
  cylinder(4.7, .22, dark, .25);
  cylinder(3.8, .2, stone, .44);
  ring(4.5, .045, light, .38);
  ring(3.95, .025, edge, .56);
  const armillary = new THREE.Group(); armillary.position.y = 5.6; root.add(armillary);
  const armillaryRings = [];
  for (let i = 0; i < 5; i++) {
    const r = 2.25 + i * .27;
    const g = new THREE.Group(); armillary.add(g);
    g.rotation.set(i * .57 + .3, i * .7, i * .46);
    mesh(new THREE.TorusGeometry(r, i === 4 ? .075 : .038, 7, 120), i === 2 ? light : brass, [0, 0, 0], g);
    if (i === 4) {
      const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(.018, .12, .023), edge, 64);
      for (let j = 0; j < 64; j++) {
        const a = j * TAU / 64;
        instanceObject.position.set(Math.sin(a) * r, Math.cos(a) * r, 0);
        instanceObject.rotation.set(0, 0, -a); instanceObject.scale.set(1, j % 8 ? 1 : 2, 1); instanceObject.updateMatrix();
        ticks.setMatrixAt(j, instanceObject.matrix);
      }
      g.add(ticks);
    }
    const satellite = mesh(new THREE.SphereGeometry(.10, 10, 8), light, [r, 0, 0], g);
    armillaryRings.push({ group: g, baseX: g.rotation.x, baseY: g.rotation.y, satellite });
  }
  mesh(new THREE.SphereGeometry(.48, 32, 24), light, [0, 0, 0], armillary);
  glow('#fff2cd', [0, 0, 0], 4.7, .75, armillary);
  strut(v(0, .5, 0), v(0, 3.7, 0), .10, brass);
  mesh(new THREE.ConeGeometry(.6, 1.5, 24), brass, [0, 1.2, 0]);
  const beam = mesh(new THREE.CylinderGeometry(.4, 3.2, 12.2, 64, 1, true), new THREE.MeshBasicMaterial({ color: '#d6f6cf', transparent: true, opacity: .018, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), [0, 6.5, 0]);
  const centralLight = new THREE.PointLight('#ffe5b6', 95, 25, 2); centralLight.position.set(0, 6, 0); scene.add(centralLight);

  // Soft contact shadows anchor the instruments without costly shadow maps.
  const contactMaterial = new THREE.MeshBasicMaterial({ map: glowMap, color: '#000000', transparent: true, opacity: .6, depthWrite: false });
  const contact = mesh(new THREE.PlaneGeometry(13, 13), contactMaterial, [0, .181, 0]);
  contact.rotation.x = -Math.PI / 2;

  const specimens = [], hitTargets = [], anchors = [];
  projects.forEach((project, index) => {
    const position = exhibitPosition(index);
    const station = new THREE.Group(); station.position.set(position.x, .2, position.z); root.add(station);
    const shadow = mesh(new THREE.PlaneGeometry(7.5, 7.5), contactMaterial, [position.x, .181, position.z]); shadow.rotation.x = -Math.PI / 2;
    const color = new THREE.Color(project.color);
    const trim = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .72 });
    mesh(new THREE.CylinderGeometry(2.1, 2.25, .16, 48), dark, [0, .04, 0], station);
    mesh(new THREE.CylinderGeometry(1.50, 1.65, .78, 48), stone, [0, .48, 0], station);
    mesh(new THREE.CylinderGeometry(1.58, 1.58, .08, 48), brass, [0, .91, 0], station);
    mesh(new THREE.CylinderGeometry(1.47, 1.47, .06, 48), dark, [0, .97, 0], station);
    ring(1.59, .025, trim, 1, station);
    const halo = ring(2.13, .021, trim, .16, station);
    // Thin exhibition cases and a brass meridian frame every specimen.
    const frame = mesh(new THREE.TorusGeometry(1.63, .026, 5, 80, Math.PI), brass, [0, 2.35, 0], station);
    frame.rotation.y = position.angle;
    for (const direction of [-1, 1]) {
      const dx = Math.cos(position.angle) * 1.63 * direction, dz = -Math.sin(position.angle) * 1.63 * direction;
      mesh(new THREE.CylinderGeometry(.026, .026, 1.36, 5), brass, [dx, 1.67, dz], station);
    }
    const exhibit = createExhibit(index); exhibit.group.position.y = 2.55; station.add(exhibit.group);
    // Plaques face the centre, so they are legible as you walk the ring.
    const plaque = mesh(new THREE.PlaneGeometry(2.6, .65), new THREE.MeshBasicMaterial({ map: plaqueTexture(project), side: THREE.DoubleSide }), [-Math.sin(position.angle) * 1.75, .87, -Math.cos(position.angle) * 1.75], station);
    plaque.rotation.y = position.angle + Math.PI;
    plaque.rotation.x = -.17;
    glow(project.color, [0, 1.9, 0], 3.5, .15, station);
    const target = mesh(new THREE.CylinderGeometry(1.8, 1.9, 4.3, 12), new THREE.MeshBasicMaterial({ visible: false }), [0, 2.15, 0], station);
    target.userData.projectIndex = index; hitTargets.push(target);
    anchors.push(v(position.x, 4.8, position.z));
    specimens.push({ ...exhibit, halo, station, trim });
  });

  // A navigable entry bridge with an inlaid brass spine.
  mesh(new THREE.BoxGeometry(6.2, .35, 7), stone, [0, -.08, 22]);
  [-2.85, 2.85].forEach(x => {
    mesh(new THREE.BoxGeometry(.055, .015, 7), light, [x, .11, 22]);
    for (let i = 0; i < 4; i++) {
      mesh(new THREE.CylinderGeometry(.065, .065, 1.1, 8), brass, [x, .65, 19 + i * 1.8]);
    }
    mesh(new THREE.BoxGeometry(.07, .07, 6), brass, [x, 1.22, 22]);
  });
  // Distant stars and drifting motes use two draw calls.
  const starPositions = [], starColors = [];
  let seed = 739;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
  for (let i = 0; i < 1700; i++) {
    const a = random() * TAU, y = random() * 1.75 - .35, r = 75 + random() * 110;
    starPositions.push(Math.cos(a) * r, y * r, Math.sin(a) * r);
    const b = .35 + random() * .65; starColors.push(b * .81, b * .9, b);
  }
  const starsGeo = new THREE.BufferGeometry(); starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)); starsGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
  const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ size: .15, vertexColors: true, transparent: true, opacity: .8, sizeAttenuation: true, fog: false })); scene.add(stars);
  const dustPositions = [];
  for (let i = 0; i < 240; i++) dustPositions.push((random() - .5) * 35, random() * 14, (random() - .5) * 35);
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ded7af', size: .045, transparent: true, opacity: .45, depthWrite: false })); root.add(dust);

  const ambient = new THREE.HemisphereLight('#c7e9df', '#142b27', 2.25); scene.add(ambient);
  const key = new THREE.DirectionalLight('#ffe0a5', 3.4); key.position.set(-15, 23, 12); scene.add(key);
  const rim = new THREE.DirectionalLight('#79c6d2', 2); rim.position.set(13, 15, -16); scene.add(rim);

  return {
    hitTargets, anchors,
    update(time, selected = -1, hovered = -1) {
      armillary.rotation.y = time * .042;
      armillaryRings.forEach((entry, i) => {
        entry.group.rotation.x = entry.baseX + time * (.06 + i * .006);
        entry.group.rotation.y = entry.baseY + time * .025 * (i % 2 ? 1 : -1);
      });
      specimens.forEach((specimen, i) => {
        specimen.update(time, i === selected || i === hovered ? 1.2 : 1);
        specimen.halo.material.opacity = i === selected || i === hovered ? 1 : .36;
      });
      dust.rotation.y = time * .012;
      beam.material.opacity = .018 + Math.sin(time * .4) * .003;
    },
  };
}
