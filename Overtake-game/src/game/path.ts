import * as THREE from "three";
import type { TrackDef } from "./tracks";

export interface PathSample {
  x: number;
  y: number;
  z: number;
  /** unit tangent (xz) */
  tx: number;
  tz: number;
  /** unit right-normal (xz) */
  nx: number;
  nz: number;
  /** distance from start along the centerline */
  dist: number;
  /** local curvature magnitude (rad per unit) */
  curv: number;
  /** road pitch (slope) along the tangent */
  pitch: number;
}

export interface Projection {
  index: number;
  lateral: number;
  /** 0..1 progress around the lap */
  progress: number;
  sample: PathSample;
}

/* ------------------------------------------------------------------ */
/* deterministic value noise                                           */
/* ------------------------------------------------------------------ */
function hash2(x: number, y: number) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smooth(xf);
  const v = smooth(yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x: number, y: number, octaves = 4) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

/* ------------------------------------------------------------------ */
/* track path                                                          */
/* ------------------------------------------------------------------ */
const CELL = 48;

export class TrackPath {
  readonly samples: PathSample[] = [];
  readonly length: number;
  readonly count: number;
  readonly halfWidth: number;
  readonly def: TrackDef;
  readonly curve: THREE.CatmullRomCurve3;
  private grid = new Map<number, number[]>();
  readonly terrainAmp: number;
  readonly terrainScale: number;

  constructor(def: TrackDef, resolution = 900) {
    this.def = def;
    this.halfWidth = def.width * 0.5;
    this.terrainAmp = def.terrain?.amp ?? 18;
    this.terrainScale = def.terrain?.scale ?? 0.0035;

    const pts: THREE.Vector3[] = [];
    const n = def.radii.length;
    const cos = Math.cos(def.rotation);
    const sin = Math.sin(def.rotation);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = def.base * def.radii[i];
      let x = Math.cos(a) * r * def.aspect[0];
      let z = Math.sin(a) * r * def.aspect[1];
      const rx = x * cos - z * sin;
      const rz = x * sin + z * cos;
      x = rx;
      z = rz;
      pts.push(new THREE.Vector3(x, def.elev[i % def.elev.length], z));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.5);

    // sample uniformly in arc-length
    const raw = this.curve.getSpacedPoints(resolution);
    raw.pop(); // last == first for closed curves
    this.count = raw.length;

    let dist = 0;
    for (let i = 0; i < this.count; i++) {
      const p = raw[i];
      const next = raw[(i + 1) % this.count];
      const prev = raw[(i - 1 + this.count) % this.count];
      const tx0 = next.x - prev.x;
      const tz0 = next.z - prev.z;
      const ty0 = next.y - prev.y;
      const tl = Math.hypot(tx0, tz0) || 1;
      const tx = tx0 / tl;
      const tz = tz0 / tl;
      const s: PathSample = {
        x: p.x,
        y: p.y,
        z: p.z,
        tx,
        tz,
        nx: -tz,
        nz: tx,
        dist,
        curv: 0,
        pitch: Math.atan2(ty0, tl),
      };
      this.samples.push(s);
      dist += Math.hypot(next.x - p.x, next.z - p.z);
    }
    this.length = dist;

    // curvature: heading change over a lookahead window
    const win = Math.max(4, Math.round(this.count / 90));
    for (let i = 0; i < this.count; i++) {
      const a = this.samples[i];
      const b = this.samples[(i + win) % this.count];
      let d = Math.atan2(b.tz, b.tx) - Math.atan2(a.tz, a.tx);
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const arc = Math.abs(b.dist - a.dist) || win;
      a.curv = Math.abs(d) / arc;
    }
    // smooth curvature
    const sm = this.samples.map((_, i) => {
      let acc = 0;
      for (let k = -3; k <= 3; k++) acc += this.samples[(i + k + this.count) % this.count].curv;
      return acc / 7;
    });
    for (let i = 0; i < this.count; i++) this.samples[i].curv = sm[i];

    // spatial hash of samples for fast nearest lookups
    for (let i = 0; i < this.count; i++) {
      const s = this.samples[i];
      const key = this.key(s.x, s.z);
      const arr = this.grid.get(key);
      if (arr) arr.push(i);
      else this.grid.set(key, [i]);
    }
  }

  private key(x: number, z: number) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  /** squared distance from (x,z) to the centerline, searching the local hash cells */
  distanceToCenter(x: number, z: number, radiusCells = 2): number {
    let best = Infinity;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let ix = -radiusCells; ix <= radiusCells; ix++) {
      for (let iz = -radiusCells; iz <= radiusCells; iz++) {
        const arr = this.grid.get((cx + ix + 4096) * 8192 + (cz + iz + 4096));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const s = this.samples[arr[k]];
          const dx = s.x - x;
          const dz = s.z - z;
          const d = dx * dx + dz * dz;
          if (d < best) best = d;
        }
      }
    }
    return Math.sqrt(best);
  }

  nearestIndex(x: number, z: number, hint = -1): number {
    if (hint >= 0) {
      let best = -1;
      let bestD = Infinity;
      const win = 30;
      for (let k = -win; k <= win; k++) {
        const i = (hint + k + this.count) % this.count;
        const s = this.samples[i];
        const dx = s.x - x;
        const dz = s.z - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (bestD < 90 * 90) return best;
    }
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.count; i += 2) {
      const s = this.samples[i];
      const dx = s.x - x;
      const dz = s.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  project(x: number, z: number, hint = -1): Projection {
    const i = this.nearestIndex(x, z, hint);
    const s = this.samples[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const lateral = dx * s.nx + dz * s.nz;
    const along = dx * s.tx + dz * s.tz;
    let progress = (s.dist + along) / this.length;
    progress = progress - Math.floor(progress);
    return { index: i, lateral, progress, sample: s };
  }

  sampleAt(index: number): PathSample {
    return this.samples[((index % this.count) + this.count) % this.count];
  }

  /** interpolated point at a given progress (0..1) and lateral offset */
  pointAt(progress: number, lateral = 0, out = new THREE.Vector3()): THREE.Vector3 {
    const p = progress - Math.floor(progress);
    const f = p * this.count;
    const i = Math.floor(f);
    const t = f - i;
    const a = this.sampleAt(i);
    const b = this.sampleAt(i + 1);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    const nx = a.nx + (b.nx - a.nx) * t;
    const nz = a.nz + (b.nz - a.nz) * t;
    const nl = Math.hypot(nx, nz) || 1;
    return out.set(x + (nx / nl) * lateral, y, z + (nz / nl) * lateral);
  }

  headingAt(progress: number): number {
    const p = progress - Math.floor(progress);
    const i = Math.floor(p * this.count);
    const s = this.sampleAt(i);
    return Math.atan2(s.tx, s.tz);
  }

  /** raw rolling terrain height (before the track flattens it) */
  rawTerrain(x: number, z: number): number {
    const s = this.terrainScale;
    const h = fbm(x * s + 100, z * s + 100, 4) - 0.5;
    const ridge = Math.abs(fbm(x * s * 0.42 - 50, z * s * 0.42 + 20, 3) - 0.5) * 2;
    return h * this.terrainAmp * 1.6 + ridge * this.terrainAmp * 0.9;
  }

  /** terrain height blended into the road surface near the track */
  terrainHeight(x: number, z: number): number {
    const d = this.distanceToCenter(x, z, 3);
    const flat = this.halfWidth + 10;
    const blend = this.halfWidth + 95;
    if (d > blend + 80) return this.rawTerrain(x, z);
    const i = this.nearestIndex(x, z);
    const roadY = this.samples[i].y;
    if (d <= flat) return roadY;
    const t = Math.min(1, (d - flat) / (blend - flat));
    const k = t * t * (3 - 2 * t);
    const raw = this.rawTerrain(x, z);
    // clamp so the verges never trench more than 1.2m below the road
    const y = roadY * (1 - k) + (roadY + raw) * k;
    return Math.max(y, roadY - 1.2);
  }
}
