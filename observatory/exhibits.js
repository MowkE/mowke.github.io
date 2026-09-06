import * as THREE from './vendor/three.module.js';

// The nine instruments. All geometry is local to its pedestal; every animation is
// a pure function of elapsed time so opening and closing the room stays seamless.
const TAU = Math.PI * 2;
const BRASS = '#d8af66';
const ICE = '#baf7ef';
const AQUA = '#67e6cb';
const BLUE = '#68aeff';
const VIOLET = '#be94ff';
const _up = new THREE.Vector3(0, 1, 0);
const _direction = new THREE.Vector3();
const _midpoint = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function lineSegments(positions, color = ICE, opacity = 0.8, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    color: colors ? 0xffffff : color,
    vertexColors: Boolean(colors),
    transparent: opacity < 1,
    opacity,
    toneMapped: false,
    depthWrite: false,
  });
  return new THREE.LineSegments(geometry, material);
}

function pointCloud(positions, color, size = 0.03, opacity = 0.85, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Procedural circular falloff avoids external sprite textures and square points.
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(color || 0xffffff) },
      pointSize: { value: size },
      opacity: { value: opacity },
    },
    vertexColors: Boolean(colors),
    vertexShader: `
      uniform float pointSize;
      varying vec3 vTint;
      void main() {
        #ifdef USE_COLOR
          vTint = color;
        #else
          vTint = vec3(1.0);
        #endif
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(pointSize * 1100.0 / max(0.1, -viewPosition.z), 1.0, 42.0);
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      uniform float opacity;
      varying vec3 vTint;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        if (radius > 1.0) discard;
        float glow = exp(-radius * radius * 4.0) * (1.0 - smoothstep(0.75, 1.0, radius));
        gl_FragColor = vec4(tint * vTint, opacity * glow);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return new THREE.Points(geometry, material);
}

function circle(radius, color = BRASS, opacity = 0.7, segments = 120) {
  const positions = [];
  for (let i = 0; i < segments; i += 1) {
    const a = i / segments * TAU;
    const b = (i + 1) / segments * TAU;
    positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0,
      Math.cos(b) * radius, Math.sin(b) * radius, 0);
  }
  return lineSegments(positions, color, opacity);
}

function metal(color = BRASS, emissiveIntensity = 0.15) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.62,
    roughness: 0.32,
    emissive: color,
    emissiveIntensity,
  });
}

function glowingSphere(radius, color) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
}

function placeStrut(mesh, index, a, b, radius = 0.012) {
  _direction.subVectors(b, a);
  const length = _direction.length();
  _midpoint.addVectors(a, b).multiplyScalar(0.5);
  _quaternion.setFromUnitVectors(_up, _direction.normalize());
  _scale.set(radius, length, radius);
  _matrix.compose(_midpoint, _quaternion, _scale);
  mesh.setMatrixAt(index, _matrix);
}

function hypershape() {
  const group = new THREE.Group();
  const vertices = Array.from({ length: 16 }, (_, i) => [
    (i & 1) ? 1 : -1,
    (i & 2) ? 1 : -1,
    (i & 4) ? 1 : -1,
    (i & 8) ? 1 : -1,
  ]);
  const edges = [];
  for (let i = 0; i < 16; i += 1) {
    for (let bit = 0; bit < 4; bit += 1) {
      const j = i ^ (1 << bit);
      if (j > i) edges.push([i, j, bit]);
    }
  }
  const edgeColors = [];
  const cyan = new THREE.Color(AQUA);
  const gold = new THREE.Color(BRASS);
  for (const [, , bit] of edges) {
    const color = bit === 3 ? gold : cyan;
    edgeColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
  const lines = lineSegments(new Float32Array(edges.length * 6), null, 0.9, edgeColors);
  const nodes = pointCloud(new Float32Array(16 * 3), ICE, 0.06, 0.95);
  const inner = new THREE.Group();
  inner.position.y = 0.1;
  inner.add(lines, nodes);
  const orbit = circle(1.15, BRASS, 0.25);
  orbit.rotation.x = Math.PI / 2.8;
  orbit.rotation.y = 0.24;
  group.add(inner, orbit);
  const projected = new Float32Array(16 * 3);
  function update(time, intensity = 1) {
    const xy = time * 0.11;
    const xw = time * 0.24 + 0.5;
    const zw = time * 0.16 + 0.4;
    const c1 = Math.cos(xw), s1 = Math.sin(xw);
    const c2 = Math.cos(zw), s2 = Math.sin(zw);
    const c3 = Math.cos(xy), s3 = Math.sin(xy);
    vertices.forEach(([x, y, z, w], i) => {
      const rx = x * c1 - w * s1;
      const rw = x * s1 + w * c1;
      const rz = z * c2 - rw * s2;
      const finalW = z * s2 + rw * c2;
      const perspective = 0.45 * 3.7 / (3.7 - finalW);
      projected[i * 3] = (rx * c3 - y * s3) * perspective;
      projected[i * 3 + 1] = (rx * s3 + y * c3) * perspective;
      projected[i * 3 + 2] = rz * perspective;
    });
    const positions = lines.geometry.attributes.position;
    edges.forEach(([a, b], i) => {
      positions.setXYZ(i * 2, projected[a * 3], projected[a * 3 + 1], projected[a * 3 + 2]);
      positions.setXYZ(i * 2 + 1, projected[b * 3], projected[b * 3 + 1], projected[b * 3 + 2]);
    });
    positions.needsUpdate = true;
    nodes.geometry.attributes.position.array.set(projected);
    nodes.geometry.attributes.position.needsUpdate = true;
    lines.material.opacity = 0.65 + intensity * 0.3;
    inner.rotation.y = time * 0.075;
  }
  lines.frustumCulled = false;
  nodes.frustumCulled = false;
  update(0);
  return { group, update };
}

function luma() {
  const group = new THREE.Group();
  const crystal = new THREE.Group();
  const prismGeometry = new THREE.CylinderGeometry(0.58, 0.58, 1.36, 3, 1);
  prismGeometry.rotateX(Math.PI / 2);
  const prism = new THREE.Mesh(prismGeometry, new THREE.MeshPhysicalMaterial({
    color: '#d5fff3',
    metalness: 0.12,
    roughness: 0.08,
    transmission: 0.12,
    thickness: 0.5,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: '#5fc7b1',
    emissiveIntensity: 0.15,
  }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(prismGeometry),
    new THREE.LineBasicMaterial({ color: ICE, transparent: true, opacity: 0.8, toneMapped: false }),
  );
  crystal.add(prism, edges);
  crystal.rotation.set(0.08, 0.35, -0.15);
  const spectrum = ['#ff6868', '#ffa657', '#ffe781', '#9ee978', '#60eec8', '#76bcff', '#b793ff'];
  const beamPositions = [];
  const beamColors = [];
  const color = new THREE.Color();
  for (let j = 0; j < spectrum.length; j += 1) {
    color.set(spectrum[j]);
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const offset = (repeat - 1) * 0.018;
      beamPositions.push(0.02, -0.04 + offset, 0.2,
        1.18, 0.55 - j * 0.18 + offset, 0.2);
      beamColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  const beams = lineSegments(beamPositions, null, 0.95, beamColors);
  const incoming = lineSegments([-1.2, -0.04, 0.2, 0.08, -0.04, 0.2], ICE, 1);
  const helixPoints = [];
  const helixColors = [];
  const helixPositions = [];
  for (let i = 0; i < 180; i += 1) {
    const a = i / 179 * TAU * 1.45;
    const y = i / 179 * 1.85 - 0.92;
    const radius = 0.68 + Math.sin(i / 179 * Math.PI) * 0.08;
    const b = (i + 1) / 179 * TAU * 1.45;
    const nextY = (i + 1) / 179 * 1.85 - 0.92;
    color.setHSL(0.02 + i / 180 * 0.76, 0.83, 0.66);
    helixPoints.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    if (i < 179) {
      helixPositions.push(Math.cos(a) * radius, y, Math.sin(a) * radius,
        Math.cos(b) * radius, nextY, Math.sin(b) * radius);
      helixColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }
  const ribbon = lineSegments(helixPositions, null, 0.65, helixColors);
  const motes = pointCloud(helixPoints.filter((_, i) => Math.floor(i / 3) % 9 === 0), ICE, 0.045, 0.7);
  group.add(crystal, beams, incoming, ribbon, motes);
  return {
    group,
    update(time, intensity = 1) {
      crystal.rotation.y = 0.35 + Math.sin(time * 0.25) * 0.15;
      ribbon.rotation.y = time * 0.14;
      motes.rotation.y = time * 0.14;
      beams.material.opacity = 0.65 + intensity * 0.3;
    },
  };
}

function lumashape() {
  const group = new THREE.Group();
  const textile = new THREE.Group();
  const colors = [new THREE.Color(VIOLET), new THREE.Color(AQUA), new THREE.Color(BRASS)];
  const pointPositions = [];
  const pointColors = [];
  const linePositions = [];
  const lineColors = [];
  // Three interleaved spectral sheets: each point is simultaneously a lattice
  // coordinate and a sample of a gently warped spectral surface.
  function position(column, row, layer) {
    const x = (column - 5) * 0.153;
    const z = (row - 5) * 0.153;
    const y = (layer - 1) * 0.45 + Math.sin(x * 3.5 + layer * 0.9) * Math.cos(z * 3) * 0.2;
    return [x, y, z];
  }
  for (let layer = 0; layer < 3; layer += 1) {
    const color = colors[layer];
    for (let row = 0; row <= 10; row += 1) {
      for (let column = 0; column <= 10; column += 1) {
        const a = position(column, row, layer);
        pointPositions.push(...a);
        pointColors.push(color.r, color.g, color.b);
        if (column < 10) {
          linePositions.push(...a, ...position(column + 1, row, layer));
          lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
        if (row < 10) {
          linePositions.push(...a, ...position(column, row + 1, layer));
          lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
      }
    }
  }
  textile.add(lineSegments(linePositions, null, 0.62, lineColors));
  textile.add(pointCloud(pointPositions, null, 0.022, 0.8, pointColors));
  const fibers = [];
  for (let corner = 0; corner < 4; corner += 1) {
    const column = corner % 2 ? 10 : 0;
    const row = corner < 2 ? 0 : 10;
    for (let layer = 0; layer < 2; layer += 1) {
      fibers.push(...position(column, row, layer), ...position(column, row, layer + 1));
    }
  }
  textile.add(lineSegments(fibers, ICE, 0.5));
  textile.rotation.set(0.32, 0.3, 0.16);
  textile.position.y = 0.1;
  const halo = circle(1.07, VIOLET, 0.22);
  halo.position.y = 0.1;
  halo.rotation.y = Math.PI / 2;
  group.add(textile, halo);
  return {
    group,
    update(time) {
      textile.rotation.y = 0.3 + time * 0.13;
      textile.rotation.z = 0.16 + Math.sin(time * 0.3) * 0.06;
      halo.rotation.z = time * 0.07;
    },
  };
}

function apsis() {
  const group = new THREE.Group();
  const system = new THREE.Group();
  system.rotation.set(0.22, 0, 0.23);
  system.position.y = 0.05;
  const blackHole = new THREE.Mesh(
    new THREE.SphereGeometry(0.405, 40, 24),
    new THREE.MeshBasicMaterial({ color: '#010403' }),
  );
  const diskMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, activity: { value: 1 } },
    vertexShader: `
      varying vec2 vPosition;
      void main() {
        vPosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vPosition;
      uniform float time;
      uniform float activity;
      void main() {
        float r = length(vPosition);
        float a = atan(vPosition.y, vPosition.x);
        float filament = 0.55 + 0.45 * sin(r * 91.0 + sin(a * 3.0 + time) * 1.4);
        float spiral = pow(0.5 + 0.5 * sin(a * 2.0 - r * 17.0 + time * 1.2), 2.0);
        float falloff = 1.0 - smoothstep(0.5, 1.12, r);
        float inner = exp(-abs(r - 0.46) * 35.0);
        vec3 amber = mix(vec3(0.87, 0.34, 0.12), vec3(1.0, 0.79, 0.42), falloff);
        vec3 color = mix(amber, vec3(1.0, 0.96, 0.81), inner);
        float alpha = (0.13 + filament * 0.4 + spiral * 0.3) * falloff + inner * 0.8;
        gl_FragColor = vec4(color * (0.8 + activity * 0.3), alpha);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.423, 1.12, 128, 3), diskMaterial);
  disk.rotation.x = Math.PI / 2;
  system.add(blackHole, disk);
  const lens = circle(0.45, '#ffe0a0', 0.94);
  const lensOuter = circle(0.484, '#c7955c', 0.42);
  system.add(lens, lensOuter);
  const rng = seededRandom(411);
  const count = 300;
  const particles = new Float32Array(count * 3);
  const parameters = [];
  const colors = [];
  const warm = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    parameters.push([0.49 + rng() * 0.6, rng() * TAU, (rng() - 0.5) * 0.027]);
    warm.setHSL(0.07 + rng() * 0.075, 0.55, 0.65 + rng() * 0.2);
    colors.push(warm.r, warm.g, warm.b);
  }
  const sparks = pointCloud(particles, null, 0.022, 0.9, colors);
  sparks.frustumCulled = false;
  system.add(sparks);
  const jetPositions = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let strand = 0; strand < 5; strand += 1) {
      const angle = strand / 5 * TAU;
      jetPositions.push(Math.cos(angle) * 0.025, side * 0.4, Math.sin(angle) * 0.025,
        Math.cos(angle) * 0.09, side * 1.04, Math.sin(angle) * 0.09);
    }
  }
  system.add(lineSegments(jetPositions, '#c1edf5', 0.22));
  group.add(system);
  return {
    group,
    update(time, intensity = 1) {
      diskMaterial.uniforms.time.value = time * 0.45;
      diskMaterial.uniforms.activity.value = intensity;
      const position = sparks.geometry.attributes.position;
      parameters.forEach(([radius, angle, height], i) => {
        const phase = angle + time * 0.4 / Math.pow(radius, 1.5);
        position.setXYZ(i, Math.cos(phase) * radius, height, Math.sin(phase) * radius);
      });
      position.needsUpdate = true;
      system.rotation.y = Math.sin(time * 0.12) * 0.24;
    },
  };
}

function goldilocks() {
  const group = new THREE.Group();
  const system = new THREE.Group();
  system.rotation.set(0.26, 0, 0.12);
  const star = glowingSphere(0.18, '#fff0b9');
  const corona = new THREE.Mesh(new THREE.SphereGeometry(0.245, 24, 16),
    new THREE.MeshBasicMaterial({
      color: '#efbe69', transparent: true, opacity: 0.09,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
  const starPoints = [];
  for (let i = 0; i < 60; i += 1) {
    const a = i / 60 * TAU;
    starPoints.push(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0,
      Math.cos(a) * (i % 5 === 0 ? 0.34 : 0.26), Math.sin(a) * (i % 5 === 0 ? 0.34 : 0.26), 0);
  }
  const rays = lineSegments(starPoints, '#edc773', 0.44);
  system.add(star, corona, rays);
  const zone = new THREE.Mesh(new THREE.RingGeometry(0.73, 0.98, 100), new THREE.MeshBasicMaterial({
    color: AQUA, transparent: true, opacity: 0.085, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  zone.rotation.x = Math.PI / 2;
  system.add(zone);
  [0.48, 0.86, 1.16].forEach((radius, i) => {
    const orbit = circle(radius, i === 1 ? AQUA : BRASS, i === 1 ? 0.75 : 0.38);
    orbit.rotation.x = Math.PI / 2;
    system.add(orbit);
  });
  const planets = [
    new THREE.Mesh(new THREE.SphereGeometry(0.063, 16, 12), metal('#d48a65', 0.3)),
    new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16), metal('#55bca5', 0.25)),
    new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 12), metal('#8ea6c6', 0.2)),
  ];
  planets.forEach((planet) => system.add(planet));
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16),
    new THREE.MeshBasicMaterial({ color: ICE, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  system.add(atmosphere);
  const moon = glowingSphere(0.029, '#dbcba9');
  const moonOrbit = circle(0.22, ICE, 0.3, 60);
  moonOrbit.rotation.x = Math.PI / 2.9;
  system.add(moon, moonOrbit);
  const meridian = circle(0.12, '#b7ecd4', 0.75, 48);
  planets[1].add(meridian);
  const ecliptic = circle(1.19, BRASS, 0.3);
  ecliptic.rotation.set(Math.PI / 3, 0.3, 0.12);
  system.add(ecliptic);
  group.add(system);
  return {
    group,
    update(time) {
      const radii = [0.48, 0.86, 1.16];
      planets.forEach((planet, i) => {
        const a = time * [0.48, 0.24, 0.13][i] + i * 2.1;
        planet.position.set(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
        planet.rotation.y = time * 0.45;
      });
      atmosphere.position.copy(planets[1].position);
      moonOrbit.position.copy(planets[1].position);
      const ma = time * 0.7;
      moon.position.copy(planets[1].position).add(new THREE.Vector3(
        Math.cos(ma) * 0.22, Math.sin(ma) * 0.105, Math.sin(ma) * 0.192,
      ));
      corona.scale.setScalar(1 + Math.sin(time * 0.55) * 0.045);
      rays.rotation.z = time * 0.08;
    },
  };
}

function quasi() {
  const group = new THREE.Group();
  const crystal = new THREE.Group();
  const phi = (1 + Math.sqrt(5)) / 2;
  const positions = [];
  const colors = [];
  const edges = [];
  const nodes = [];
  const gold = new THREE.Color(BRASS);
  const pale = new THREE.Color('#f2da99');
  const teal = new THREE.Color('#558777');
  for (let i = 0; i < 10; i += 1) {
    const angle = i / 10 * TAU + Math.PI / 2;
    const reach = i % 2 === 0 ? 1.1 : 1.1 / phi;
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const tangent = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
    const base = radial.clone().multiplyScalar(0.11);
    const tip = radial.clone().multiplyScalar(reach);
    const left = radial.clone().multiplyScalar(reach * 0.54).addScaledVector(tangent, reach * 0.23);
    const right = radial.clone().multiplyScalar(reach * 0.54).addScaledVector(tangent, -reach * 0.23);
    const front = radial.clone().multiplyScalar(reach * 0.53);
    front.z = reach * 0.26;
    const back = front.clone();
    back.z *= -1;
    const boundary = [base, left, tip, right];
    boundary.forEach((vertex, index) => {
      const next = boundary[(index + 1) % 4];
      positions.push(...vertex.toArray(), ...next.toArray(), ...front.toArray());
      positions.push(...next.toArray(), ...vertex.toArray(), ...back.toArray());
      const shade = index % 2 === 0 ? pale : gold;
      for (let n = 0; n < 3; n += 1) colors.push(shade.r, shade.g, shade.b);
      for (let n = 0; n < 3; n += 1) colors.push(teal.r, teal.g, teal.b);
      edges.push(...vertex.toArray(), ...next.toArray(), ...vertex.toArray(), ...front.toArray());
    });
    nodes.push(...tip.toArray());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const facets = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0.65, roughness: 0.29,
    emissive: '#5a4525', emissiveIntensity: 0.3, side: THREE.DoubleSide,
  }));
  crystal.add(facets, lineSegments(edges, '#efd294', 0.6), pointCloud(nodes, '#fff0b3', 0.053, 0.95));
  const pentagons = [];
  [0.43, 0.43 / phi].forEach((radius, ring) => {
    for (let i = 0; i < 5; i += 1) {
      const a = i / 5 * TAU + Math.PI / 2;
      const b = (i + 2) / 5 * TAU + Math.PI / 2;
      pentagons.push(Math.cos(a) * radius, Math.sin(a) * radius, 0.32 + ring * 0.04,
        Math.cos(b) * radius, Math.sin(b) * radius, 0.32 + ring * 0.04);
    }
  });
  crystal.add(lineSegments(pentagons, AQUA, 0.65));
  crystal.rotation.set(0.12, -0.15, 0);
  crystal.position.y = 0.11;
  group.add(crystal);
  return {
    group,
    update(time) {
      crystal.rotation.y = Math.sin(time * 0.12) * 0.48;
      crystal.rotation.z = time * 0.055;
    },
  };
}

function diffuse() {
  const group = new THREE.Group();
  const molecule = new THREE.Group();
  const rng = seededRandom(2909);
  const count = 2100;
  const data = [];
  const positions = new Float32Array(count * 3);
  const colors = [];
  const cyan = new THREE.Color('#79eee0');
  const blue = new THREE.Color('#649cff');
  for (let i = 0; i < count; i += 1) {
    const strand = i % 2;
    const t = rng();
    data.push([t, strand, (rng() - 0.5) * 0.19, (rng() - 0.5) * 0.19, rng() * TAU]);
    const color = strand ? cyan : blue;
    colors.push(color.r, color.g, color.b);
  }
  const cloud = pointCloud(positions, null, 0.026, 0.73, colors);
  cloud.frustumCulled = false;
  molecule.add(cloud);
  const rails = [];
  const rungs = [];
  function point(t, strand) {
    const angle = t * TAU * 1.85 + strand * Math.PI;
    const r = 0.47 + Math.sin(t * Math.PI) * 0.055;
    return [Math.cos(angle) * r, (t - 0.5) * 1.85, Math.sin(angle) * r];
  }
  for (let i = 0; i < 120; i += 1) {
    for (let strand = 0; strand < 2; strand += 1) {
      rails.push(...point(i / 120, strand), ...point((i + 1) / 120, strand));
    }
    if (i % 6 === 0) rungs.push(...point(i / 120, 0), ...point(i / 120, 1));
  }
  molecule.add(lineSegments(rails, '#b0ebfa', 0.5), lineSegments(rungs, '#729dd0', 0.35));
  const ambient = [];
  for (let i = 0; i < 200; i += 1) {
    const angle = rng() * TAU;
    const r = 0.65 + rng() * 0.3;
    ambient.push(Math.cos(angle) * r, (rng() - 0.5) * 1.8, Math.sin(angle) * r);
  }
  const mist = pointCloud(ambient, BLUE, 0.019, 0.28);
  molecule.rotation.z = -0.18;
  molecule.position.y = 0.08;
  group.add(molecule, mist);
  return {
    group,
    update(time, intensity = 1) {
      const attribute = cloud.geometry.attributes.position;
      data.forEach(([t, strand, offsetR, offsetY, phase], i) => {
        const angle = t * TAU * 1.85 + strand * Math.PI;
        const breathing = Math.sin(time * 0.6 + phase) * 0.014;
        const radius = 0.47 + Math.sin(t * Math.PI) * 0.055 + offsetR + breathing;
        attribute.setXYZ(i, Math.cos(angle) * radius, (t - 0.5) * 1.85 + offsetY,
          Math.sin(angle) * radius);
      });
      attribute.needsUpdate = true;
      molecule.rotation.y = time * 0.21;
      mist.rotation.y = -time * 0.045;
      cloud.material.uniforms.opacity.value = 0.48 + intensity * 0.3;
    },
  };
}

function meta() {
  const group = new THREE.Group();
  const lattice = new THREE.Group();
  const cells = [];
  for (let layer = 0; layer < 2; layer += 1) {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) cells.push([column, row, layer]);
    }
  }
  const strutCount = cells.length * 6 + 9 * 6;
  const struts = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7), metal('#83dcca', 0.35), strutCount);
  struts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  struts.frustumCulled = false;
  const joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.023, 8, 6), metal(BRASS, 0.28), cells.length * 6);
  joints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  joints.frustumCulled = false;
  const allVertices = Array.from({ length: cells.length }, () => Array.from({ length: 6 }, () => new THREE.Vector3()));
  lattice.add(struts, joints);
  lattice.rotation.set(0.15, 0.35, 0);
  group.add(lattice);
  const corners = [
    [-1, -1], [0, -1], [1, -1], [1, 1], [0, 1], [-1, 1],
  ];
  function update(time) {
    // Inward-pointing top and bottom vertices open together: an auxetic cell
    // becomes wider as it gets taller instead of exhibiting ordinary Poisson contraction.
    const expansion = (Math.sin(time * 0.7) + 1) / 2;
    const width = 0.202 + expansion * 0.035;
    const height = 0.234 + expansion * 0.029;
    const inward = 0.116 - expansion * 0.041;
    let strutIndex = 0;
    let jointIndex = 0;
    cells.forEach(([column, row, layer], cellIndex) => {
      const centerX = (column - 1) * width * 2;
      const centerY = (row - 1) * (height * 2 - inward);
      const z = (layer - 0.5) * 0.47;
      const vertices = allVertices[cellIndex];
      corners.forEach(([x, y], i) => {
        vertices[i].set(centerX + x * width,
          centerY + y * height - (x === 0 ? y * inward : 0), z);
        _matrix.makeTranslation(vertices[i].x, vertices[i].y, vertices[i].z);
        joints.setMatrixAt(jointIndex++, _matrix);
      });
      for (let i = 0; i < 6; i += 1) {
        placeStrut(struts, strutIndex++, vertices[i], vertices[(i + 1) % 6], 0.012);
      }
    });
    for (let i = 0; i < 9; i += 1) {
      for (let corner = 0; corner < 6; corner += 1) {
        placeStrut(struts, strutIndex++, allVertices[i][corner], allVertices[i + 9][corner], 0.008);
      }
    }
    struts.instanceMatrix.needsUpdate = true;
    joints.instanceMatrix.needsUpdate = true;
    lattice.rotation.y = 0.35 + time * 0.11;
  }
  update(0);
  return { group, update };
}

function valence() {
  const group = new THREE.Group();
  const atom = new THREE.Group();
  const rng = seededRandom(721);
  const positions = [];
  const colors = [];
  const aqua = new THREE.Color('#75e8e1');
  const amber = new THREE.Color('#eab97b');
  for (let i = 0; i < 2500; i += 1) {
    const side = i % 2 ? 1 : -1;
    const t = rng();
    const azimuth = rng() * TAU;
    const radial = Math.sqrt(rng());
    const axial = 0.055 + t * 1.02;
    const radius = Math.sin(t * Math.PI) * Math.pow(t + 0.1, 0.2) * 0.41 * radial;
    positions.push(axial * side, Math.cos(azimuth) * radius, Math.sin(azimuth) * radius);
    const color = side > 0 ? aqua : amber;
    const brightness = 0.64 + rng() * 0.36;
    colors.push(color.r * brightness, color.g * brightness, color.b * brightness);
  }
  const orbitals = pointCloud(positions, null, 0.027, 0.68, colors);
  atom.add(orbitals);
  const contours = [];
  const contourColors = [];
  for (let side = -1; side <= 1; side += 2) {
    const color = side > 0 ? aqua : amber;
    for (let section = 0; section < 3; section += 1) {
      const azimuth = section / 3 * Math.PI;
      for (let i = 0; i < 80; i += 1) {
        const a = i / 80 * TAU;
        const b = (i + 1) / 80 * TAU;
        const ta = (1 + Math.cos(a)) * 0.5;
        const tb = (1 + Math.cos(b)) * 0.5;
        const ra = Math.sin(ta * Math.PI) * Math.pow(ta + 0.1, 0.2) * 0.41 * Math.sign(Math.sin(a));
        const rb = Math.sin(tb * Math.PI) * Math.pow(tb + 0.1, 0.2) * 0.41 * Math.sign(Math.sin(b));
        contours.push((0.055 + ta * 1.02) * side, Math.cos(azimuth) * ra, Math.sin(azimuth) * ra,
          (0.055 + tb * 1.02) * side, Math.cos(azimuth) * rb, Math.sin(azimuth) * rb);
        contourColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
  }
  atom.add(lineSegments(contours, null, 0.3, contourColors));
  const nucleus = glowingSphere(0.065, '#f1efd2');
  atom.add(nucleus);
  const nodalPlane = circle(0.61, ICE, 0.25);
  nodalPlane.rotation.y = Math.PI / 2;
  atom.add(nodalPlane);
  const orbit = circle(1.17, BRASS, 0.23);
  orbit.rotation.set(0.7, -0.3, 0);
  const electron = pointCloud([0, 0, 0], ICE, 0.095, 1);
  atom.rotation.set(0.14, 0, 0.47);
  group.add(atom, orbit, electron);
  const electronVector = new THREE.Vector3();
  return {
    group,
    update(time, intensity = 1) {
      atom.rotation.y = time * 0.12;
      atom.rotation.z = 0.47 + Math.sin(time * 0.18) * 0.09;
      orbitals.material.uniforms.opacity.value = 0.48 + intensity * 0.25;
      electronVector.set(Math.cos(time * 0.46) * 1.17, Math.sin(time * 0.46) * 1.17, 0);
      electronVector.applyEuler(orbit.rotation);
      electron.position.copy(electronVector);
      nucleus.scale.setScalar(1 + Math.sin(time * 1.5) * 0.07);
    },
  };
}

const factories = [hypershape, luma, lumashape, apsis, goldilocks, quasi, diffuse, meta, valence];

/** Create one of the nine project sculptures in portfolio order. */
export function createExhibit(index) {
  if (!Number.isInteger(index) || index < 0 || index >= factories.length) {
    throw new RangeError(`Exhibit index must be an integer from 0 through 8; received ${index}`);
  }
  const exhibit = factories[index]();
  exhibit.group.name = ['HYPERSHAPE', 'LUMA', 'LUMASHAPE', 'APSIS', 'GOLDILOCKS', 'QUASI', 'DIFFUSE', 'META', 'VALENCE'][index];
  exhibit.update(0, 1);
  return exhibit;
}
