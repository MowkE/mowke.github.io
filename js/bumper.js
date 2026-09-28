// bumper.js
// The CAD models bumpers on two sides only. Given the bounds of the foam
// pieces it does have, wrap a full ring at their real size, lettered with the
// team number on every face the way real bumpers are.

import * as THREE from 'three';

export function bumperRing(boxes, material, edgeMat) {
  const U = boxes.reduce((u, b) => u.union(b), new THREE.Box3());
  const us = U.getSize(new THREE.Vector3()), b0 = boxes[0].getSize(new THREE.Vector3());
  const t = Math.min(b0.x, b0.z);                                   // bumper thickness
  const outerX = us.x, outerZ = us.z, h = us.y;
  const rr = (w, d, r) => {
    const sh = new THREE.Shape(), x = w / 2, z = d / 2;
    sh.moveTo(-x + r, -z); sh.lineTo(x - r, -z); sh.quadraticCurveTo(x, -z, x, -z + r); sh.lineTo(x, z - r); sh.quadraticCurveTo(x, z, x - r, z);
    sh.lineTo(-x + r, z); sh.quadraticCurveTo(-x, z, -x, z - r); sh.lineTo(-x, -z + r); sh.quadraticCurveTo(-x, -z, -x + r, -z);
    return sh;
  };
  const inset = 0.995;
  const shape = rr(outerX * inset, outerZ * inset, t * 0.7);
  shape.holes.push(new THREE.Path(rr(outerX * inset - 2 * t, outerZ * inset - 2 * t, t * 0.2).getPoints(24)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h * 0.985, bevelEnabled: true, bevelSize: t * 0.08, bevelThickness: t * 0.08, bevelSegments: 3, curveSegments: 14 });
  geo.rotateX(Math.PI / 2);                                        // lay the extrusion flat, top face up
  const ring = new THREE.Mesh(geo, material);
  ring.castShadow = ring.receiveShadow = true;
  const c = U.getCenter(new THREE.Vector3());
  ring.position.set(c.x, U.max.y - h * 0.0075, c.z);
  if (edgeMat) ring.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 32), edgeMat));
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const g2 = cv.getContext('2d'); g2.font = '700 120px Anybody, Arial Narrow, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
  g2.fillStyle = '#f3efe6'; g2.fillText('9470', 256, 88);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const numMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const dh = h * 0.8, dw = dh * 3.2, y = -h * 0.5, ox = outerX * inset / 2 + t * 0.09, oz = outerZ * inset / 2 + t * 0.09;
  for (const [x, z, ry] of [[0, oz, 0], [0, -oz, Math.PI], [ox, 0, Math.PI / 2], [-ox, 0, -Math.PI / 2]]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), numMat); d.position.set(x, y, z); d.rotation.y = ry; ring.add(d);
  }
  return { ring, bounds: U };
}
