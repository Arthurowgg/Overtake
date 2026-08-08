import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type CacheEntry = { scene: THREE.Group } | { failed: true };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<boolean>>();

export function glbReady(url: string): boolean {
  const e = cache.get(url);
  return !!e && !("failed" in e);
}

export function getGlb(url: string): THREE.Group | null {
  const e = cache.get(url);
  return e && !("failed" in e) ? e.scene : null;
}

function loadOnce(u: string): Promise<THREE.Group | null> {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      u,
      (gltf) => resolve(gltf.scene as THREE.Group),
      undefined,
      () => resolve(null),
    );
  });
}

export function preloadGlb(url: string): Promise<boolean> {
  const existing = inflight.get(url);
  if (existing) return existing;
  if (cache.has(url)) return Promise.resolve(glbReady(url));

  const p = (async () => {
    let scene = await loadOnce(url);
    if (!scene && url.startsWith("http")) {
      scene = await loadOnce(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
    }
    if (scene) {
      cache.set(url, { scene });
      return true;
    }
    console.warn("[glb] failed to load", url);
    cache.set(url, { failed: true });
    return false;
  })().finally(() => inflight.delete(url)) as Promise<boolean>;

  inflight.set(url, p);
  return p;
}

/* ---------------- wheel detection (name only) ---------------- */

const WHEEL_RE = /\b(wheel|tyre|tire|rim|rueda|roda|llanta)\b/i;
const WHEEL_EXCLUDE = /\b(body|chassis|hull|interior|seat|steering|bumper|glass|window|light|lamp)\b/i;

function isEmissiveLight(o: THREE.Object3D): boolean {
  let found = false;
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as unknown as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | undefined;
    if (!m) return;
    const mats = Array.isArray(m) ? m : [m];
    for (const mat of mats) {
      if (!mat) continue;
      const sm = mat as THREE.MeshStandardMaterial & { emissiveIntensity?: number };
      if (sm.emissive && (sm.emissive.r > 0.35 || sm.emissive.g > 0.35 || sm.emissive.b > 0.35)) {
        found = true;
      }
    }
  });
  return found;
}

export interface NormalizedGlb {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  steer: THREE.Object3D[];
  tireR: number;
  halfW: number;
  wheelbase: number;
  length: number;
  height: number;
  bodyMat: THREE.MeshStandardMaterial | null;
}

function orientForwardAxis(model: THREE.Object3D): THREE.Box3 {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) {
    model.rotation.y = Math.PI / 2;
    model.updateMatrixWorld(true);
  }
  return new THREE.Box3().setFromObject(model);
}

export function instantiateGlb(url: string, targetLength: number): NormalizedGlb | null {
  const src = getGlb(url);
  if (!src) return null;

  const root = new THREE.Group();
  const model = src.clone(true);

  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material | THREE.Material[];
    m.material = Array.isArray(mat) ? mat.map((x) => x.clone()) : mat.clone();
    m.castShadow = true;
    m.receiveShadow = true;
  });

  let box = orientForwardAxis(model);
  let size = box.getSize(new THREE.Vector3());

  // fix facing: rear (red) must be at negative Z
  {
    const centreZ = box.getCenter(new THREE.Vector3()).z;
    let redZ: number | null = null;
    model.traverse((o) => {
      if (redZ !== null) return;
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of mats) {
        const sm = mm as THREE.MeshStandardMaterial;
        if (sm.isMeshStandardMaterial && sm.emissive && sm.emissive.r > 0.55 && sm.emissive.g < 0.35 && sm.emissive.b < 0.35) {
          const bb = new THREE.Box3().setFromObject(m);
          if (!bb.isEmpty()) redZ = bb.getCenter(new THREE.Vector3()).z;
          break;
        }
      }
    });
    if (redZ !== null && redZ > centreZ) {
      model.rotation.y += Math.PI;
      model.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(model);
      size = box.getSize(new THREE.Vector3());
    }
  }

  const longAxis = Math.max(size.x, size.z);
  const scale = longAxis > 0.0001 ? targetLength / longAxis : 1;
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);

  const box2 = new THREE.Box3().setFromObject(model);
  const centre2 = box2.getCenter(new THREE.Vector3());

  model.position.x -= centre2.x;
  model.position.z -= centre2.z;
  model.position.y -= box2.min.y;
  model.updateMatrixWorld(true);

  root.add(model);
  root.updateMatrixWorld(true);

  const candidates: THREE.Object3D[] = [];
  const seen = new Set<THREE.Object3D>();

  const walk = (o: THREE.Object3D) => {
    if (seen.has(o)) return;
    if (WHEEL_RE.test(o.name) && !WHEEL_EXCLUDE.test(o.name) && !isEmissiveLight(o)) {
      candidates.push(o);
      o.traverse((d) => seen.add(d));
      return;
    }
    for (const c of o.children) walk(c);
  };
  walk(model);

  const wheels: THREE.Object3D[] = [];
  const steer: THREE.Object3D[] = [];
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  let tireR = targetLength * 0.09;

  for (const w of candidates) {
    const wb = new THREE.Box3().setFromObject(w);
    if (wb.isEmpty()) continue;
    const wc = wb.getCenter(new THREE.Vector3()).applyMatrix4(rootInv);
    const ws = wb.getSize(new THREE.Vector3());
    tireR = Math.max(tireR, Math.max(ws.y, ws.z) * 0.5);

    const hub = new THREE.Group();
    hub.position.copy(wc);
    const spin = new THREE.Group();
    hub.add(spin);

    // Move the original wheel mesh into the spin group centered at the hub,
    // so rotating the spin group spins the wheel in place instead of orbiting.
    w.removeFromParent();
    w.position.set(0, 0, 0);
    w.quaternion.identity();
    // keep original scale but ensure uniform
    // (some models have non-uniform scale baked into the node)
    spin.add(w);

    root.add(hub);
    wheels.push(spin);
    if (wc.z > 0) steer.push(hub);
  }

  root.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(finalBox.min.y) && Math.abs(finalBox.min.y) > 0.001) {
    for (const child of root.children) child.position.y -= finalBox.min.y;
    root.updateMatrixWorld(true);
  }

  let bodyMat: THREE.MeshStandardMaterial | null = null;
  let bestVol = -1;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    if (!bb) return;
    const s = bb.getSize(new THREE.Vector3());
    const vol = s.x * s.y * s.z;
    if (vol > bestVol) {
      bestVol = vol;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        bodyMat = mat as THREE.MeshStandardMaterial;
      }
    }
  });

  const fBox = new THREE.Box3().setFromObject(root);
  const fSize = fBox.getSize(new THREE.Vector3());

  return {
    root,
    wheels,
    steer,
    tireR,
    halfW: fSize.x * 0.5,
    wheelbase: targetLength * 0.31,
    length: fSize.z,
    height: fSize.y,
    bodyMat,
  };
}
