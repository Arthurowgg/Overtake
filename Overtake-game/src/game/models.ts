import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CarDef } from "./cars";
import type { PropKind } from "./tracks";
import { glbReady, instantiateGlb } from "./glb";

export interface CarRig {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  steer: THREE.Object3D[];
  interior: THREE.Group;
  brakeMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  tireR: number;
  halfW: number;
  flareW: number;
  wheelbase: number;
  length: number;
  height: number;
  eyePos: THREE.Vector3;
}

/* truly minimal box proportions */
interface BoxDims {
  L: number;
  W: number;
  bodyH: number;
  cabH: number;
  cabLen: number;
  cabZ: number;
  tireR: number;
  tireW: number;
  wb: number;
  wingH: number;
  spokeN: number;
}

const DIMS: Record<CarDef["style"], BoxDims> = {
  gt:     { L: 4.8, W: 2.02, bodyH: 0.62, cabH: 0.52, cabLen: 2.1, cabZ: -0.10, tireR: 0.50, tireW: 0.38, wb: 1.55, wingH: 0.20, spokeN: 5 },
  muscle: { L: 5.2, W: 2.18, bodyH: 0.68, cabH: 0.52, cabLen: 2.0, cabZ: -0.06, tireR: 0.54, tireW: 0.42, wb: 1.68, wingH: 0.18, spokeN: 5 },
  rally:  { L: 4.6, W: 2.02, bodyH: 0.66, cabH: 0.62, cabLen: 2.1, cabZ: 0.02, tireR: 0.52, tireW: 0.38, wb: 1.48, wingH: 0.32, spokeN: 6 },
  proto:  { L: 5.4, W: 2.16, bodyH: 0.52, cabH: 0.42, cabLen: 1.6, cabZ: 0.12, tireR: 0.50, tireW: 0.38, wb: 1.78, wingH: 0.32, spokeN: 6 },
};

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  flat.forEach((g, i) => { if (g !== list[i]) g.dispose(); });
  list.forEach((x) => x.dispose());
  return merged ?? new THREE.BoxGeometry(1, 1, 1);
}

/* glb override */
function createGlbCar(def: CarDef, paint?: number): CarRig | null {
  const url = def.modelUrl;
  if (!url || !glbReady(url)) return null;
  const d = DIMS[def.style];
  const g = instantiateGlb(url, d.L);
  if (!g) return null;

  const color = paint ?? def.color;
  const bodyMat = g.bodyMat ??
    new THREE.MeshStandardMaterial({ color, flatShading: true, metalness: 0.45, roughness: 0.32, envMapIntensity: 1.2 });
  (bodyMat.color as THREE.Color).setHex(color);
  bodyMat.metalness = 0.55;
  bodyMat.roughness = 0.28;
  bodyMat.envMapIntensity = 1.4;

  const hW = g.halfW, hL = g.length / 2;

  // The model ships its own emissive light meshes (front / rear). Reuse them
  // instead of gluing extra boxes on: scan for a red-dominant emissive material
  // (brake lights) and a warm/white one (headlights).
  let headMat: THREE.MeshStandardMaterial | null = null;
  let brakeMat: THREE.MeshStandardMaterial | null = null;
  g.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mm of mats) {
      const sm = mm as THREE.MeshStandardMaterial;
      if (!sm.isMeshStandardMaterial || !sm.emissive) continue;
      const e = sm.emissive;
      if (e.r < 0.2 && e.g < 0.2 && e.b < 0.2) continue; // not emissive enough
      if (e.r > 0.5 && e.g < 0.35 && e.b < 0.35) brakeMat = brakeMat ?? sm;
      else headMat = headMat ?? sm;
    }
  });
  headMat = headMat ?? new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffe8a0, emissiveIntensity: 2.0, flatShading: true,
  });
  brakeMat = brakeMat ?? new THREE.MeshStandardMaterial({
    color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 1.4, flatShading: true,
  });

  // Use the model's baked wheels as-is — no generic procedural wheels.
  // If the GLB has separate wheel nodes they will be in g.wheels and will spin;
  // otherwise the wheels stay baked into the body and remain static (no floating
  // disconnected wheels). This is what fixes the Mustang screenshot.
  const wheels = g.wheels;
  const steer = g.steer;
  const tireR = g.tireR;

  const interior = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, flatShading: true, roughness: 1 });
  const dash = new THREE.Mesh(new THREE.BoxGeometry(hW * 1.2, 0.18, 0.24), mat);
  dash.position.set(0, g.height * 0.46, hL * 0.26);
  interior.add(dash);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 4, 8), mat);
  rim.position.set(0, g.height * 0.56, hL * 0.10);
  rim.rotation.x = -0.6;
  interior.add(rim);
  g.root.add(interior);

  return {
    group: g.root,
    wheels,
    steer,
    interior,
    brakeMat,
    bodyMat,
    headMat,
    tireR,
    halfW: hW,
    flareW: hW + 0.05,
    wheelbase: g.wheelbase,
    length: g.length,
    height: g.height,
    eyePos: new THREE.Vector3(0, g.height * 0.62, hL * 0.22),
  };
}

/* ----------------------------- MAIN LOW-POLY CAR ----------------------------- */
export function createCar(def: CarDef, paint?: number, accent?: number): CarRig {
  const glb = createGlbCar(def, paint);
  if (glb) return glb;

  const d = DIMS[def.style];
  const color = paint ?? def.color;
  const acc = accent ?? def.accentColor;
  const group = new THREE.Group();

  // Materials — summer: more reflective, brighter
  const bodyMat = new THREE.MeshStandardMaterial({ color, flatShading: true, metalness: 0.48, roughness: 0.34, envMapIntensity: 1.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, flatShading: true, roughness: 0.9 });
  const accentMat = new THREE.MeshStandardMaterial({ color: acc, flatShading: true, metalness: 0.45, roughness: 0.42 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x6aa7d6, flatShading: true, roughness: 0.18, metalness: 0.12, transparent: true, opacity: 0.82,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xfff0b0, emissiveIntensity: 2.2, flatShading: true,
  });
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0xff2a2a, emissive: 0xff1f1f, emissiveIntensity: 1.8, flatShading: true,
  });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x161820, flatShading: true, roughness: 1 });

  const hW = d.W / 2;
  const hL = d.L / 2;
  const floorY = d.tireR * 0.82; // most of the wheel visible

  // 1) Main hull
  const hull = new THREE.Mesh(new THREE.BoxGeometry(d.W, d.bodyH, d.L), bodyMat);
  hull.position.set(0, floorY + d.bodyH / 2, 0);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // 2) Cabin
  const cabW = d.W * 0.84;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabW, d.cabH, d.cabLen), bodyMat);
  cabin.position.set(0, floorY + d.bodyH + d.cabH / 2, d.cabZ);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  group.add(cabin);

  // 3) WINDOWS — opaque enough to read as windows
  const winH = d.cabH * 0.68;
  // windscreen
  const ws = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.96, winH, 0.05), glassMat);
  ws.position.set(0, floorY + d.bodyH + d.cabH * 0.52, d.cabZ + d.cabLen / 2);
  ws.rotation.x = -0.28;
  group.add(ws);
  // rear
  const rw = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.90, winH * 0.78, 0.05), glassMat);
  rw.position.set(0, floorY + d.bodyH + d.cabH * 0.48, d.cabZ - d.cabLen / 2);
  rw.rotation.x = 0.18;
  group.add(rw);
  // sides
  for (const sx of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH * 0.62, d.cabLen * 0.72), glassMat);
    sw.position.set(sx * (cabW / 2), floorY + d.bodyH + d.cabH * 0.50, d.cabZ);
    group.add(sw);
  }

  // 4) Wing (simple) + stays
  const wingY = floorY + d.bodyH + d.wingH;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(d.W + 0.12, 0.05, 0.34), accentMat);
  wing.position.set(0, wingY, -hL + 0.22);
  wing.castShadow = true;
  group.add(wing);
  for (const sx of [-1, 1]) {
    const stay = new THREE.Mesh(new THREE.BoxGeometry(0.06, d.wingH, 0.06), darkMat);
    stay.position.set(sx * (hW * 0.5), wingY - d.wingH / 2, -hL + 0.22);
    group.add(stay);
  }

  // 5) Lights
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.10, 0.06), headMat);
    hl.position.set(sx * (hW * 0.58), floorY + d.bodyH * 0.58, hL - 0.02);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.10, 0.05), brakeMat);
    tl.position.set(sx * (hW * 0.56), floorY + d.bodyH * 0.60, -hL + 0.02);
    group.add(tl);
  }

  // 6) Splitter / diffuser
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(d.W, 0.05, 0.28), darkMat);
  splitter.position.set(0, floorY, hL + 0.04);
  group.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(d.W * 0.84, 0.08, 0.28), darkMat);
  diffuser.position.set(0, floorY, -hL - 0.02);
  group.add(diffuser);

  // 7) INTERIOR FOR FIRST PERSON
  const interior = new THREE.Group();
  const dash = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.88, 0.16, 0.22), interiorMat);
  dash.position.set(0, floorY + d.bodyH + 0.12, d.cabZ + d.cabLen / 2 - 0.20);
  interior.add(dash);
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.26), darkMat);
  col.position.set(0, floorY + d.bodyH + 0.20, d.cabZ + d.cabLen / 2 - 0.30);
  col.rotation.x = -0.45;
  interior.add(col);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.020, 4, 8), darkMat);
  wheel.position.set(0, floorY + d.bodyH + 0.30, d.cabZ + d.cabLen / 2 - 0.38);
  wheel.rotation.x = -0.58;
  interior.add(wheel);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.10, 0.36), interiorMat);
  seat.position.set(0, floorY + d.bodyH + 0.05, d.cabZ - 0.08);
  interior.add(seat);
  const sBack = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.32, 0.06), interiorMat);
  sBack.position.set(0, floorY + d.bodyH + 0.22, d.cabZ - 0.28);
  sBack.rotation.x = -0.10;
  interior.add(sBack);
  group.add(interior);

  const eyePos = new THREE.Vector3(0, floorY + d.bodyH + 0.36, d.cabZ + d.cabLen / 2 - 0.36);

  // 8) WHEELS — clearly outside the body silhouette
  const wheelX = hW + 0.02; // outer edge slightly outside body for visibility
  const tireGeo = new THREE.CylinderGeometry(d.tireR, d.tireR, d.tireW, 12);
  tireGeo.rotateZ(Math.PI / 2);

  const rimParts: THREE.BufferGeometry[] = [];
  const hubGeo = new THREE.CylinderGeometry(d.tireR * 0.50, d.tireR * 0.50, d.tireW * 0.55, 8);
  hubGeo.rotateZ(Math.PI / 2);
  rimParts.push(hubGeo);
  for (let i = 0; i < d.spokeN; i++) {
    const sp = new THREE.BoxGeometry(d.tireW * 0.40, d.tireR * 1.10, d.tireR * 0.12);
    sp.rotateX((i / d.spokeN) * Math.PI);
    rimParts.push(sp);
  }
  const rimGeo = mergeAll(rimParts);

  const wheels: THREE.Object3D[] = [];
  const steer: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const hub = new THREE.Group();
      hub.position.set(sx * wheelX, d.tireR, sz * d.wb);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, darkMat);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, accentMat);
      spin.add(tire, rim);
      hub.add(spin);
      group.add(hub);
      wheels.push(spin);
      if (sz > 0) steer.push(hub);
    }
  }

  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

  return {
    group, wheels, steer, interior,
    brakeMat, bodyMat, headMat,
    tireR: d.tireR,
    halfW: hW,
    flareW: hW + 0.18,
    wheelbase: d.wb,
    length: d.L,
    height: floorY + d.bodyH + d.cabH,
    eyePos,
  };
}

/* ------------------------------------------------------------------ */
/* environment props                                                   */
/* ------------------------------------------------------------------ */
export interface PropGeo {
  main: THREE.BufferGeometry;
  sub?: THREE.BufferGeometry;
  subColor?: number;
  emissive?: boolean;
  radius: number;
}

export function buildProp(kind: PropKind): PropGeo {
  switch (kind) {
    case "pine": {
      // fuller silhouette: 4 offset tiers + a tip, gently irregular
      const trunk = new THREE.CylinderGeometry(0.28, 0.46, 2.8, 7);
      trunk.translate(0, 1.4, 0);
      const cones: THREE.BufferGeometry[] = [];
      let y = 1.9, r = 2.7;
      for (let i = 0; i < 4; i++) {
        const h = 2.9 - i * 0.45;
        const c = new THREE.ConeGeometry(r, h, 8);
        c.translate((i % 2 === 0 ? 0.08 : -0.08), y + h / 2, (i % 2 === 0 ? -0.05 : 0.06));
        cones.push(c);
        y += h * 0.52; r *= 0.70;
      }
      const tip = new THREE.ConeGeometry(0.42, 1.1, 6);
      tip.translate(0, y + 0.5, 0);
      cones.push(tip);
      return { main: mergeAll(cones), sub: trunk, subColor: 0x5a4030, radius: 2.8 };
    }
    case "palm": {
      const segs: THREE.BufferGeometry[] = []; let px = 0;
      for (let i = 0; i < 5; i++) {
        const h = 1.5;
        const c = new THREE.CylinderGeometry(0.24 - i * 0.02, 0.3 - i * 0.02, h, 6);
        c.translate(px, 0.7 + i * h, 0); segs.push(c);
        px += 0.16 * i * 0.35;
      }
      const fronds: THREE.BufferGeometry[] = [];
      // two rings of fronds: upper spread + lower droop, for a fuller crown
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const f = new THREE.ConeGeometry(0.52, 3.8, 4);
        f.scale(1, 1, 0.20); f.rotateZ(Math.PI / 2 - 0.48); f.rotateY(a);
        f.translate(px + Math.cos(a) * 1.55, 8.0 - 0.35, Math.sin(a) * 1.55);
        fronds.push(f);
      }
      for (let i = 0; i < 5; i++) {
        const a = ((i + 0.5) / 5) * Math.PI * 2;
        const f = new THREE.ConeGeometry(0.42, 3.0, 4);
        f.scale(1, 1, 0.18); f.rotateZ(Math.PI / 2 - 0.85); f.rotateY(a);
        f.translate(px + Math.cos(a) * 1.7, 7.55, Math.sin(a) * 1.7);
        fronds.push(f);
      }
      for (const [cx, cz] of [[0.24, 0.15], [-0.2, 0.22], [0.05, -0.26]]) {
        const coco = new THREE.IcosahedronGeometry(0.24, 0);
        coco.translate(px + cx, 7.62, cz);
        fronds.push(coco);
      }
      return { main: mergeAll(fronds), sub: mergeAll(segs), subColor: 0x9c7a52, radius: 2.2 };
    }
    case "rock": {
      // clustered outcrop: a broad base slab with three leaning shards
      const parts: THREE.BufferGeometry[] = [];
      const base = new THREE.IcosahedronGeometry(1.8, 0); base.scale(1.35, 0.55, 1.15); parts.push(base);
      const g1 = new THREE.IcosahedronGeometry(1.5, 0); g1.scale(1.0, 1.25, 0.9); g1.rotateY(0.5); g1.rotateZ(0.12); g1.translate(0.2, 0.9, 0); parts.push(g1);
      const g2 = new THREE.IcosahedronGeometry(0.95, 0); g2.scale(0.85, 1.45, 0.8); g2.rotateZ(-0.22); g2.translate(1.25, 0.65, 0.55); parts.push(g2);
      const g3 = new THREE.IcosahedronGeometry(0.7, 0); g3.scale(1.1, 0.8, 1.0); g3.rotateY(1.1); g3.translate(-1.15, 0.25, -0.5); parts.push(g3);
      const m = mergeAll(parts); m.translate(0, 0.55, 0);
      return { main: m, radius: 2.6 };
    }
    case "cactus": {
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.55, 0.65, 5.2, 8); trunk.translate(0, 2.6, 0); parts.push(trunk);
      for (const s of [-1, 1]) {
        const arm = new THREE.CylinderGeometry(0.32, 0.34, 1.9, 7);
        arm.rotateZ((Math.PI / 2) * s); arm.translate(s * 0.95, 2.6 + (s > 0 ? 0.5 : -0.3), 0); parts.push(arm);
        const up = new THREE.CylinderGeometry(0.3, 0.32, 1.7, 7);
        up.translate(s * 1.85, 3.4 + (s > 0 ? 0.9 : 0.2), 0); parts.push(up);
      }
      return { main: mergeAll(parts), radius: 1.6 };
    }
    case "block": {
      const parts: THREE.BufferGeometry[] = [];
      const b = new THREE.BoxGeometry(6, 12, 6); b.translate(0, 6, 0); parts.push(b);
      const t = new THREE.BoxGeometry(3.6, 4, 3.6); t.translate(0.6, 14, -0.4); parts.push(t);
      const a = new THREE.CylinderGeometry(0.12, 0.12, 4, 4); a.translate(0.6, 18, -0.4); parts.push(a);
      return { main: mergeAll(parts), radius: 5 };
    }
    case "arch": {
      const parts: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) { const leg = new THREE.BoxGeometry(3.4, 11, 4.2); leg.translate(s * 4.6, 5.5, 0); parts.push(leg); }
      const top = new THREE.BoxGeometry(13, 3.4, 4.6); top.translate(0, 12.2, 0); parts.push(top);
      const cap = new THREE.BoxGeometry(9, 2.2, 3.8); cap.translate(0.6, 14.4, 0); parts.push(cap);
      return { main: mergeAll(parts), radius: 7 };
    }
    case "crystal":
    default: {
      const parts: THREE.BufferGeometry[] = [];
      const c = new THREE.OctahedronGeometry(1.5, 0); c.scale(0.7, 3.4, 0.7); c.translate(0, 4.4, 0); parts.push(c);
      const c2 = new THREE.OctahedronGeometry(1.0, 0); c2.scale(0.6, 2.2, 0.6); c2.translate(1.3, 2.4, 0.4); parts.push(c2);
      return { main: mergeAll(parts), emissive: true, radius: 2 };
    }
  }
}

export function buildCloud(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 4 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) {
    const g = new THREE.IcosahedronGeometry(6 + Math.random() * 7, 0);
    g.scale(1.3, 0.55, 1.0);
    g.translate((k - n / 2) * 8 + Math.random() * 4, Math.random() * 3, Math.random() * 8 - 4);
    parts.push(g);
  }
  return mergeAll(parts);
}

/* trackside structures */
export function buildGrandstand(len: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8b8f98, flatShading: true, roughness: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x20242c, flatShading: true, roughness: 0.6, metalness: 0.4 });
  const bannerMat = new THREE.MeshStandardMaterial({ color: accent, flatShading: true, roughness: 0.5 });
  const depth = 9; const tiers = 4;
  const base = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, depth), concrete);
  base.position.set(0, 0.55, 0); g.add(base);
  const crowdCols = [0xcf5b54, 0x4f93d6, 0xe6c347, 0x4fae74, 0xd8d8d8, 0xa878c8, 0xe08a3c];
  for (let i = 0; i < tiers; i++) {
    const seatMat = new THREE.MeshStandardMaterial({ color: crowdCols[(i * 2) % crowdCols.length], flatShading: true, roughness: 0.95 });
    const tier = new THREE.Mesh(new THREE.BoxGeometry(len * 0.95, 1.3, 1.9), seatMat);
    tier.position.set(0, 1.15 + i * 1.4, depth / 2 - 1.1 - i * 1.55); g.add(tier);
  }
  const topY = 1.15 + (tiers - 1) * 1.4 + 1.3 + 1.4;
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(len + 1.8, 0.55, depth + 1.6), roofMat);
  canopy.position.set(0, topY, -1.4); g.add(canopy);
  for (const sx of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, topY, 0.5), concrete);
    pil.position.set(sx * (len * 0.45), topY / 2, depth / 2 - 0.7); g.add(pil);
  }
  const ban = new THREE.Mesh(new THREE.BoxGeometry(len * 0.82, 1.0, 0.35), bannerMat);
  ban.position.set(0, topY - 1.3, depth / 2 - 0.3); g.add(ban);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildGantry(span: number, accent: number, emissive: boolean): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x262a32, flatShading: true, roughness: 0.55, metalness: 0.6 });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: accent, flatShading: true, roughness: 0.5,
    emissive: emissive ? accent : 0x000000, emissiveIntensity: emissive ? 1.5 : 0.15,
  });
  const h = 12;
  for (const sx of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.8, h, 1.8), metal);
    col.position.set(sx * (span / 2 - 0.9), h / 2, 0); g.add(col);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 2.6), metal);
    foot.position.set(sx * (span / 2 - 0.9), 0.45, 0); g.add(foot);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 2.2, 2.0), metal);
  beam.position.set(0, h, 0); g.add(beam);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(span * 0.8, 3.2, 0.5), bannerMat);
  banner.position.set(0, h - 2.8, 0.7); g.add(banner);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildTireWall(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 2; row++) {
    for (let cx = 0; cx < 4; cx++) {
      const tire = new THREE.TorusGeometry(0.55, 0.2, 6, 10);
      tire.rotateY(Math.PI / 2); tire.translate(cx * 1.12 - 1.68, 0.55 + row * 0.95, 0);
      parts.push(tire);
    }
  }
  return mergeAll(parts);
}

export function buildLightPole(): { pole: THREE.BufferGeometry; lamp: THREE.BufferGeometry } {
  const poleParts: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.16, 0.24, 9.5, 6);
  pole.translate(0, 4.75, 0); poleParts.push(pole);
  const arm = new THREE.BoxGeometry(2.8, 0.18, 0.18); arm.translate(1.2, 9.4, 0); poleParts.push(arm);
  const lamp = new THREE.BoxGeometry(1.5, 0.4, 0.8); lamp.translate(2.5, 9.2, 0);
  return { pole: mergeAll(poleParts), lamp };
}

export function buildChevron(accent: number): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f38, flatShading: true, roughness: 0.6 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), metal);
  post.position.set(0, 1.7, 0); g.add(post);
  const boardMat = new THREE.MeshStandardMaterial({ color: accent, flatShading: true, roughness: 0.5 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 0.14), boardMat);
  board.position.set(0, 3.9, 0); g.add(board);
  const white = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, flatShading: true, roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.05), white);
    stripe.position.set(-0.35 + i * 0.36, 3.3 + i * 0.5, 0.09);
    stripe.rotation.z = -0.6; g.add(stripe);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

export function buildMountainCone(): THREE.BufferGeometry {
  return new THREE.ConeGeometry(1, 1, 6);
}
