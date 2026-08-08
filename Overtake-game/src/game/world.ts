import * as THREE from "three";
import type { TrackDef } from "./tracks";
import type { TrackPath } from "./path";
import {
  buildProp,
  buildCloud,
  buildGrandstand,
  buildGantry,
  buildLightPole,
  buildChevron,
  buildMountainCone,
} from "./models";

export interface World {
  sunDir: THREE.Vector3;
  sunPos: THREE.Vector3;
  /** live world-space position of the sun disc (follows the camera focus) */
  sunWorld: THREE.Vector3;
  sun: THREE.DirectionalLight;
  occluderScene: THREE.Scene;
  update: (focus: THREE.Vector3) => void;
  /** 0 = off, otherwise the shadow map resolution */
  setShadowQuality: (size: number) => void;
  /** 1 = authored fog density; higher pushes the horizon further away */
  setDrawDistance: (mul: number) => void;
  setExtrasVisible: (v: boolean) => void;
  dispose: () => void;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform vec3 sunColor;
uniform vec3 glowColor;
uniform vec3 sunDir;
uniform float stars;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, groundColor, smoothstep(0.02, -0.30, h));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += glowColor * pow(sd, 6.0) * 0.35;
  col += glowColor * pow(sd, 64.0) * 0.9;
  col += sunColor * pow(sd, 900.0) * 3.0;
  col = mix(col, sunColor * 1.9, smoothstep(0.99955, 0.99975, sd));
  if (stars > 0.0 && h > 0.0) {
    vec3 g = floor(d * 320.0);
    float s = hash(g);
    float twinkle = step(0.9975, s) * (0.6 + 0.4 * sin(s * 90.0));
    col += vec3(0.85, 0.9, 1.0) * twinkle * stars * smoothstep(0.0, 0.35, h);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function toColorArray(hexes: number[]) {
  return hexes.map((h) => new THREE.Color(h));
}

export function buildWorld(scene: THREE.Scene, path: TrackPath, def: TrackDef): World {
  const t = def.theme;
  const disposables: { dispose: () => void }[] = [];
  const track = (g: THREE.BufferGeometry | THREE.Material) => {
    disposables.push(g);
    return g as never;
  };

  /* ---------------- atmosphere ---------------- */
  scene.fog = new THREE.FogExp2(t.fogColor, t.fogDensity);

  const sunDir = new THREE.Vector3(...t.sunDir).normalize();
  const sunPos = sunDir.clone().multiplyScalar(2600);

  const skyGeo = new THREE.SphereGeometry(4200, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(t.skyTop) },
      horizonColor: { value: new THREE.Color(t.skyHorizon) },
      groundColor: { value: new THREE.Color(t.skyGround) },
      sunColor: { value: new THREE.Color(t.sunColor) },
      glowColor: { value: new THREE.Color(t.sunGlow) },
      sunDir: { value: sunDir.clone() },
      stars: { value: def.id === "neon-grid" ? 1.0 : 0.0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);
  track(skyGeo);
  track(skyMat);

  const hemi = new THREE.HemisphereLight(t.skyHorizon, t.hemiGround, 0.68);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(t.ambient, Math.min(0.55, t.ambientIntensity * 0.82));
  scene.add(amb);

  const sun = new THREE.DirectionalLight(t.sunColor, def.id === "neon-grid" ? 1.05 : 1.75);
  sun.position.copy(sunDir).multiplyScalar(220);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 140;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.25;
  sun.shadow.radius = 3.5; // softens the PCF edges
  sun.shadow.blurSamples = 12;
  scene.add(sun);
  scene.add(sun.target);

  // secondary rim light for shape definition
  const rim = new THREE.DirectionalLight(t.skyHorizon, 0.5);
  rim.position.set(-sunDir.x * 100, 90, -sunDir.z * 100);
  scene.add(rim);

  /* ---------------- occluder scene for god rays ---------------- */
  const occluderScene = new THREE.Scene();
  const sunDiscGeo = new THREE.SphereGeometry(92, 16, 12);
  const sunDisc = new THREE.Mesh(sunDiscGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  sunDisc.position.copy(sunPos);
  occluderScene.add(sunDisc);
  track(sunDiscGeo);

  /* ---------------- road ---------------- */
  const hw = path.halfWidth;
  const count = path.count;
  const pos: number[] = [];
  const col: number[] = [];
  const roadBase = new THREE.Color(t.roadColor);
  const c = new THREE.Color();

  const pushQuad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    color: THREE.Color,
    arr = pos,
    carr = col,
  ) => {
    arr.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    arr.push(ax, ay, az, cx, cy, cz, dx, dy, dz);
    for (let i = 0; i < 6; i++) carr.push(color.r, color.g, color.b);
  };

  const lateral = (i: number, off: number, lift = 0) => {
    const s = path.sampleAt(i);
    return [s.x + s.nx * off, s.y + lift, s.z + s.nz * off] as const;
  };

  for (let i = 0; i < count; i++) {
    const j = i + 1;
    const shade = 0.88 + ((i * 37) % 11) / 40;
    c.copy(roadBase).multiplyScalar(shade);
    const [ax, ay, az] = lateral(i, -hw);
    const [bx, by, bz] = lateral(i, hw);
    const [cx2, cy2, cz2] = lateral(j, hw);
    const [dx, dy, dz] = lateral(j, -hw);
    pushQuad(ax, ay, az, bx, by, bz, cx2, cy2, cz2, dx, dy, dz, c);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  roadGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  scene.add(road);
  track(roadGeo);
  track(roadMat);

  /* ---------------- markings (curbs, lines, start) ---------------- */
  const mPos: number[] = [];
  const mCol: number[] = [];
  const curbA = new THREE.Color(t.curbA);
  const curbB = new THREE.Color(t.curbB);
  const white = new THREE.Color(0xf3f3f3);
  const lift = 0.06;

  for (let i = 0; i < count; i++) {
    const j = i + 1;
    // curbs
    const kerbCol = Math.floor(i / 5) % 2 === 0 ? curbA : curbB;
    for (const side of [-1, 1]) {
      const inner = side * hw;
      const outer = side * (hw + 1.7);
      const [ax, ay, az] = lateral(i, inner, lift);
      const [bx, by, bz] = lateral(i, outer, lift);
      const [cx2, cy2, cz2] = lateral(j, outer, lift);
      const [dx, dy, dz] = lateral(j, inner, lift);
      pushQuad(ax, ay, az, bx, by, bz, cx2, cy2, cz2, dx, dy, dz, kerbCol, mPos, mCol);
    }
    // edge lines
    for (const side of [-1, 1]) {
      const a1 = side * (hw - 0.45);
      const a2 = side * (hw - 0.95);
      const [ax, ay, az] = lateral(i, a1, 0.04);
      const [bx, by, bz] = lateral(i, a2, 0.04);
      const [cx2, cy2, cz2] = lateral(j, a2, 0.04);
      const [dx, dy, dz] = lateral(j, a1, 0.04);
      pushQuad(ax, ay, az, bx, by, bz, cx2, cy2, cz2, dx, dy, dz, white, mPos, mCol);
    }
    // dashed centre line
    if (Math.floor(i / 7) % 2 === 0) {
      const [ax, ay, az] = lateral(i, 0.22, 0.04);
      const [bx, by, bz] = lateral(i, -0.22, 0.04);
      const [cx2, cy2, cz2] = lateral(j, -0.22, 0.04);
      const [dx, dy, dz] = lateral(j, 0.22, 0.04);
      pushQuad(ax, ay, az, bx, by, bz, cx2, cy2, cz2, dx, dy, dz, white, mPos, mCol);
    }

    // Road kept intentionally clean — curbs, edge lines and the dashed centre
    // line only. Decoration lives off-road.
  }

  // start / finish chequer
  const black = new THREE.Color(0x101014);
  const rows = 3;
  const cols = 10;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const i = count - 4 + r;
      const o1 = -hw + (k / cols) * hw * 2;
      const o2 = -hw + ((k + 1) / cols) * hw * 2;
      const cc = (r + k) % 2 === 0 ? white : black;
      const [ax, ay, az] = lateral(i, o1, 0.05);
      const [bx, by, bz] = lateral(i, o2, 0.05);
      const [cx2, cy2, cz2] = lateral(i + 1, o2, 0.05);
      const [dx, dy, dz] = lateral(i + 1, o1, 0.05);
      pushQuad(ax, ay, az, bx, by, bz, cx2, cy2, cz2, dx, dy, dz, cc, mPos, mCol);
    }
  }

  const markGeo = new THREE.BufferGeometry();
  markGeo.setAttribute("position", new THREE.Float32BufferAttribute(mPos, 3));
  markGeo.setAttribute("color", new THREE.Float32BufferAttribute(mCol, 3));
  markGeo.computeVertexNormals();
  const markMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    metalness: 0.0,
    emissive: def.id === "neon-grid" ? 0x333333 : 0x000000,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const marks = new THREE.Mesh(markGeo, markMat);
  marks.receiveShadow = true;
  scene.add(marks);
  track(markGeo);
  track(markMat);

  /* ---------------- barriers ---------------- */
  const runoff = 11;
  const wallH = 1.35;
  const wPos: number[] = [];
  const wCol: number[] = [];
  const wallBase = new THREE.Color(t.wallColor);
  const wallAlt = new THREE.Color(t.curbA);
  const step = 2;
  for (let i = 0; i < count; i += step) {
    const j = i + step;
    for (const side of [-1, 1]) {
      const off = side * (hw + runoff);
      const s0 = path.sampleAt(i);
      const s1 = path.sampleAt(j);
      const x0 = s0.x + s0.nx * off;
      const z0 = s0.z + s0.nz * off;
      const y0 = s0.y;
      const x1 = s1.x + s1.nx * off;
      const z1 = s1.z + s1.nz * off;
      const y1 = s1.y;
      const cc = Math.floor(i / (step * 3)) % 3 === 0 ? wallAlt : wallBase;
      pushQuad(
        x0, y0, z0,
        x0, y0 + wallH, z0,
        x1, y1 + wallH, z1,
        x1, y1, z1,
        cc, wPos, wCol,
      );
      // inward-facing top cap
      const capIn = side * (hw + runoff - 0.5);
      const cx0 = s0.x + s0.nx * capIn;
      const cz0 = s0.z + s0.nz * capIn;
      const cx1 = s1.x + s1.nx * capIn;
      const cz1 = s1.z + s1.nz * capIn;
      pushQuad(
        cx0, y0 + wallH, cz0,
        x0, y0 + wallH, z0,
        x1, y1 + wallH, z1,
        cx1, y1 + wallH, cz1,
        wallAlt, wPos, wCol,
      );
    }
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(wPos, 3));
  wallGeo.setAttribute("color", new THREE.Float32BufferAttribute(wCol, 3));
  wallGeo.computeVertexNormals();
  const wallMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    emissive: def.id === "neon-grid" ? 0x1a1030 : 0x000000,
  });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.castShadow = true;
  walls.receiveShadow = true;
  scene.add(walls);
  track(wallGeo);
  track(wallMat);

  /* ---------------- terrain ---------------- */
  const SIZE = 2400;
  const SEG = 150;
  const terGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  terGeo.rotateX(-Math.PI / 2);
  const tp = terGeo.attributes.position as THREE.BufferAttribute;
  const terColors = new Float32Array(tp.count * 3);
  const palette = toColorArray(t.groundColors);
  const nearColor = new THREE.Color(t.groundColors[t.groundColors.length - 1]);
  const tmp = new THREE.Color();
  const flat = hw + 6;
  const blend = hw + 95;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const z = tp.getZ(i);
    const d = path.distanceToCenter(x, z, 3);
    let y: number;
    if (d <= flat) {
      y = path.sampleAt(path.nearestIndex(x, z)).y;
    } else if (d < blend + 40) {
      const roadY = path.sampleAt(path.nearestIndex(x, z)).y;
      const k = Math.min(1, (d - flat) / (blend - flat));
      const kk = k * k * (3 - 2 * k);
      y = roadY + path.rawTerrain(x, z) * kk;
    } else {
      y = path.rawTerrain(x, z);
    }
    // outer bowl so the world edge lifts into hills
    const rad = Math.hypot(x, z);
    if (rad > 900) y += (rad - 900) * 0.16;
    tp.setY(i, y);

    const n = path.rawTerrain(x + 7, z - 3);
    let idx = Math.floor(((n / (path.terrainAmp * 1.2)) * 0.5 + 0.5) * palette.length);
    idx = Math.max(0, Math.min(palette.length - 1, idx));
    tmp.copy(palette[idx]);
    const kc = Math.max(0, Math.min(1, (d - flat) / (blend - flat)));
    tmp.lerp(nearColor, (1 - kc) * 0.85);
    const v = 0.92 + (((i * 13) % 7) / 7) * 0.16;
    terColors[i * 3] = tmp.r * v;
    terColors[i * 3 + 1] = tmp.g * v;
    terColors[i * 3 + 2] = tmp.b * v;
  }
  terGeo.setAttribute("color", new THREE.BufferAttribute(terColors, 3));
  terGeo.computeVertexNormals();
  const terMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0,
  });
  const terrain = new THREE.Mesh(terGeo, terMat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  track(terGeo);
  track(terMat);

  /* ---------------- props ---------------- */
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (const spec of t.props) {
    const geo = buildProp(spec.kind);
    const placements: { x: number; z: number; y: number; s: number; r: number }[] = [];
    const alongStep = Math.max(3, Math.round(14 / spec.density));
    for (let i = 0; i < count; i += alongStep) {
      if (rnd() > 0.7) continue;
      const s = path.sampleAt(i);
      const side = rnd() < 0.5 ? -1 : 1;
      const off = side * (hw + runoff + 6 + rnd() * 58);
      const x = s.x + s.nx * off + (rnd() - 0.5) * 8;
      const z = s.z + s.nz * off + (rnd() - 0.5) * 8;
      if (path.distanceToCenter(x, z, 3) < hw + runoff + 4) continue;
      placements.push({
        x,
        z,
        y: path.terrainHeight(x, z),
        s: spec.scale[0] + rnd() * (spec.scale[1] - spec.scale[0]),
        r: rnd() * Math.PI * 2,
      });
    }
    const scatter = Math.round(160 * spec.density);
    for (let i = 0; i < scatter; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 220 + rnd() * 780;
      const x = Math.cos(a) * r * 1.15;
      const z = Math.sin(a) * r;
      if (path.distanceToCenter(x, z, 3) < hw + runoff + 10) continue;
      placements.push({
        x,
        z,
        y: path.terrainHeight(x, z),
        s: spec.scale[0] + rnd() * (spec.scale[1] - spec.scale[0]),
        r: rnd() * Math.PI * 2,
      });
    }
    if (!placements.length) continue;

    const mainMat = new THREE.MeshStandardMaterial({
      flatShading: true,
      roughness: geo.emissive ? 0.35 : 0.95,
      metalness: geo.emissive ? 0.3 : 0,
      emissive: geo.emissive ? spec.colors[0] : 0x000000,
      emissiveIntensity: geo.emissive ? 1.6 : 0,
    });
    const main = new THREE.InstancedMesh(geo.main, mainMat, placements.length);
    main.castShadow = true;
    main.receiveShadow = !geo.emissive;
    const colors = toColorArray(spec.colors);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pv = new THREE.Vector3();
    let sub: THREE.InstancedMesh | null = null;
    if (geo.sub) {
      const subMat = new THREE.MeshStandardMaterial({
        color: geo.subColor ?? 0x6b4c33,
        flatShading: true,
        roughness: 1,
      });
      sub = new THREE.InstancedMesh(geo.sub, subMat, placements.length);
      sub.castShadow = true;
      track(subMat);
    }
    placements.forEach((p, i) => {
      pv.set(p.x, p.y - 0.2, p.z);
      q.setFromEuler(new THREE.Euler(0, p.r, 0));
      sc.set(p.s, p.s * (0.85 + rnd() * 0.4), p.s);
      mtx.compose(pv, q, sc);
      main.setMatrixAt(i, mtx);
      main.setColorAt(i, colors[i % colors.length]);
      sub?.setMatrixAt(i, mtx);
    });
    main.instanceMatrix.needsUpdate = true;
    if (main.instanceColor) main.instanceColor.needsUpdate = true;
    scene.add(main);
    track(geo.main);
    track(mainMat);
    if (sub) {
      sub.instanceMatrix.needsUpdate = true;
      scene.add(sub);
      track(geo.sub!);
    }
  }

  /* ---------------- trackside structures ---------------- */
  const extras = new THREE.Group();
  scene.add(extras);

  // register a whole object's geometry/materials for disposal
  const trackObj = (obj: THREE.Object3D) => {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        disposables.push(m.geometry);
        const mat = m.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((x) => disposables.push(x));
        else if (mat) disposables.push(mat);
      }
    });
    extras.add(obj);
  };
  const faceTrack = (nx: number, nz: number) => Math.atan2(-nx, -nz);

  // grandstands along straights (placed where curvature is lowest nearby)
  const standCount = 7;
  for (let k = 0; k < standCount; k++) {
    const seed = Math.floor(((k + 0.5) / standCount) * count);
    let best = seed;
    let bestCurv = Infinity;
    for (let d = -36; d <= 36; d += 6) {
      const idx = (((seed + d) % count) + count) % count;
      const cv = path.sampleAt(idx).curv;
      if (cv < bestCurv) { bestCurv = cv; best = idx; }
    }
    const s = path.sampleAt(best);
    const side = rnd() < 0.5 ? -1 : 1;
    const off = side * (hw + runoff + 10);
    const len = 20 + rnd() * 20;
    const stand = buildGrandstand(len, t.curbA);
    stand.position.set(s.x + s.nx * off, s.y, s.z + s.nz * off);
    stand.rotation.y = faceTrack(s.nx, s.nz);
    trackObj(stand);
  }

  // a single gantry at mid-lap — the road itself stays clean
  {
    const i = Math.floor(count / 2);
    const s = path.sampleAt(i);
    const span = hw * 2 + runoff * 2 + 7;
    const gan = buildGantry(span, t.curbA, def.id === "neon-grid");
    gan.position.set(s.x, s.y, s.z);
    gan.rotation.y = Math.atan2(s.tx, s.tz);
    trackObj(gan);
  }

  // road kept clean — no tyre walls (decoration is off-road)

  // corner chevron boards placed just before sharp apexes
  {
    let placed = 0;
    let i = 30;
    while (i < count && placed < 6) {
      const s = path.sampleAt(i);
      const ahead = path.sampleAt((i + 24) % count);
      if (ahead.curv > 0.004 && s.curv < 0.0012) {
        const side = rnd() < 0.5 ? -1 : 1;
        const off = side * (hw + runoff + 2.5);
        const ch = buildChevron(t.curbA);
        ch.position.set(s.x + s.nx * off, s.y, s.z + s.nz * off);
        ch.rotation.y = faceTrack(s.nx, s.nz);
        trackObj(ch);
        placed++;
        i += 60;
      } else {
        i += 3;
      }
    }
  }

  // light poles along the edges for night / coastal tracks
  if (def.id === "neon-grid" || def.id === "sunset-bay") {
    const { pole, lamp } = buildLightPole();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, flatShading: true, roughness: 0.6, metalness: 0.4 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffe9c0, emissive: 0xffd9a0, emissiveIntensity: 2.4, flatShading: true,
    });
    const mats: THREE.Matrix4[] = [];
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < count; i += 48) {
      const s = path.sampleAt(i);
      for (const side of [-1, 1]) {
        const off = side * (hw + runoff + 1.5);
        e.set(0, Math.atan2(s.tx, s.tz) + (side > 0 ? Math.PI : 0), 0);
        q.setFromEuler(e);
        mtx.makeRotationFromQuaternion(q);
        mtx.setPosition(s.x + s.nx * off, s.y, s.z + s.nz * off);
        mats.push(mtx.clone());
      }
    }
    if (mats.length) {
      const ip = new THREE.InstancedMesh(pole, poleMat, mats.length);
      const il = new THREE.InstancedMesh(lamp, lampMat, mats.length);
      mats.forEach((m, idx) => { ip.setMatrixAt(idx, m); il.setMatrixAt(idx, m); });
      ip.instanceMatrix.needsUpdate = true;
      il.instanceMatrix.needsUpdate = true;
      ip.castShadow = true;
      extras.add(ip);
      extras.add(il);
      track(pole);
      track(poleMat);
      track(lamp);
      track(lampMat);
    }
  }

  // distant mountain skyline ring
  {
    const mtnGeo = buildMountainCone();
    const mtnCol = new THREE.Color(t.groundColors[0]).multiplyScalar(0.55);
    mtnCol.lerp(new THREE.Color(t.fogColor), 0.45);
    const mtnMat = new THREE.MeshStandardMaterial({ color: mtnCol, flatShading: true, roughness: 1 });
    const ring = 80;
    const im = new THREE.InstancedMesh(mtnGeo, mtnMat, ring);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rnd() * 0.12;
      const r = 680 + rnd() * 460;
      const h = 42 + rnd() * 78;
      const w = h * (0.55 + rnd() * 0.5);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      p2.set(x, path.rawTerrain(x, z) - h * 0.06, z);
      q.identity();
      sc.set(w, h, w);
      mtx.compose(p2, q, sc);
      im.setMatrixAt(i, mtx);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = false;
    extras.add(im);
    track(mtnGeo);
    track(mtnMat);
  }

  // water plane for coastal / valley tracks
  if (t.waterColor != null) {
    const waterY = -7.5;
    const wGeo = new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6);
    wGeo.rotateX(-Math.PI / 2);
    const wMat = new THREE.MeshStandardMaterial({
      color: t.waterColor,
      metalness: 0.85,
      roughness: 0.18,
      transparent: true,
      opacity: 0.9,
      emissive: t.waterColor,
      emissiveIntensity: 0.12,
    });
    const water = new THREE.Mesh(wGeo, wMat);
    water.position.set(0, waterY, 0);
    scene.add(water);
    track(wGeo);
    track(wMat);
  }

  /* ---------------- start gate ---------------- */
  const gateS = path.sampleAt(0);
  const gateGroup = new THREE.Group();
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x1b2030, flatShading: true, roughness: 0.6 });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: t.curbA,
    flatShading: true,
    emissive: t.curbA,
    emissiveIntensity: def.id === "neon-grid" ? 1.4 : 0.35,
  });
  const legGeo = new THREE.BoxGeometry(1.6, 11, 1.6);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, gateMat);
    leg.position.set(side * (hw + 2.4), 5.5, 0);
    leg.castShadow = true;
    gateGroup.add(leg);
  }
  const beamGeo = new THREE.BoxGeometry(hw * 2 + 7, 2.4, 1.8);
  const beam = new THREE.Mesh(beamGeo, bannerMat);
  beam.position.set(0, 11.6, 0);
  beam.castShadow = true;
  gateGroup.add(beam);
  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 5, 1.1, 1.2), gateMat);
  beam2.position.set(0, 9.9, 0);
  gateGroup.add(beam2);
  gateGroup.position.set(gateS.x, gateS.y, gateS.z);
  gateGroup.rotation.y = Math.atan2(gateS.tx, gateS.tz);
  scene.add(gateGroup);
  track(legGeo);
  track(beamGeo);
  track(gateMat);
  track(bannerMat);

  /* ---------------- clouds ---------------- */
  if (t.cloudCount > 0) {
    const cloudGeo = buildCloud();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: t.cloudColor,
      flatShading: true,
      roughness: 1,
      emissive: t.cloudColor,
      emissiveIntensity: 0.25,
      fog: true,
    });
    const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, t.cloudCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < t.cloudCount; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 400 + rnd() * 1500;
      q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0));
      const s = 1.4 + rnd() * 2.6;
      m.compose(
        new THREE.Vector3(Math.cos(a) * r, 170 + rnd() * 220, Math.sin(a) * r),
        q,
        new THREE.Vector3(s, s * 0.7, s),
      );
      clouds.setMatrixAt(i, m);
    }
    clouds.instanceMatrix.needsUpdate = true;
    scene.add(clouds);
    track(cloudGeo);
    track(cloudMat);
  }

  const sunWorld = sunPos.clone();

  const setShadowQuality = (size: number) => {
    if (size <= 0) {
      sun.castShadow = false;
      return;
    }
    sun.castShadow = true;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };

  const setDrawDistance = (mul: number) => {
    const f = scene.fog as THREE.FogExp2 | null;
    if (f) f.density = t.fogDensity / Math.max(0.3, mul);
  };

  // Light-space basis used to quantise the shadow focus. Without this the
  // shadow camera slides by sub-texel amounts every frame and the shadow
  // edges visibly crawl / shimmer ("tremem") as the camera moves.
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const lightRight = new THREE.Vector3();
  const lightUp = new THREE.Vector3();
  const snapped = new THREE.Vector3();

  const update = (focus: THREE.Vector3) => {
    lightRight.crossVectors(WORLD_UP, sunDir).normalize();
    lightUp.crossVectors(sunDir, lightRight).normalize();

    // round the focus onto the shadow-map texel grid, in light space
    const mapSize = sun.shadow.mapSize.x || 2048;
    const texel = (S * 2) / mapSize;
    const px = Math.round(focus.dot(lightRight) / texel) * texel;
    const py = Math.round(focus.dot(lightUp) / texel) * texel;
    const pz = focus.dot(sunDir);
    snapped
      .copy(lightRight)
      .multiplyScalar(px)
      .addScaledVector(lightUp, py)
      .addScaledVector(sunDir, pz);

    sun.position.copy(snapped).addScaledVector(sunDir, 220);
    sun.target.position.copy(snapped);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();

    sky.position.set(focus.x, 0, focus.z);
    sunWorld.set(focus.x + sunPos.x, sunPos.y, focus.z + sunPos.z);
    sunDisc.position.copy(sunWorld);
  };

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
  };

  const setExtrasVisible = (v: boolean) => {
    extras.visible = v;
  };

  return {
    sunDir,
    sunPos,
    sunWorld,
    sun,
    occluderScene,
    update,
    setShadowQuality,
    setDrawDistance,
    setExtrasVisible,
    dispose,
  };
}
