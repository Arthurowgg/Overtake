import * as THREE from "three";
import type { CarDef } from "./cars";
import type { TrackPath } from "./path";
import { createCar, type CarRig } from "./models";

export interface Controls {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  boost: boolean;
}

export const emptyControls = (): Controls => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  boost: false,
});

export class Vehicle {
  def: CarDef;
  name: string;
  isPlayer: boolean;
  rig: CarRig;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  speed = 0; // signed forward speed
  slip = 0; // lateral speed
  controls = emptyControls();
  // race state
  lap = 0;
  progress = 0;
  lastProgress = 0;
  totalProgress = 0;
  position = 1;
  lapTimes: number[] = [];
  bestLap = 0;
  lapStart = 0;
  finished = false;
  finishTime = 0;
  offTrack = false;
  hintIndex = -1;
  // ai
  aiSkill = 1;
  aiLine = 0;
  aiNoisePhase = 0;
  boostTime = 0;
  boostCooldown = 0;
  // visual
  private wheelSpin = 0;
  private roll = 0;
  private pitch = 0;
  private bounce = 0;
  private prevSpeed = 0;
  accelG = 0;
  hitTimer = 0;

  constructor(def: CarDef, name: string, isPlayer: boolean, paint?: number) {
    this.def = def;
    this.name = name;
    this.isPlayer = isPlayer;
    this.rig = createCar(def, paint);
  }

  placeOnGrid(path: TrackPath, slot: number) {
    const back = 0.012 + slot * 0.0055;
    const lateralOff = (slot % 2 === 0 ? -1 : 1) * (path.halfWidth * 0.42);
    const p = 1 - back;
    const pt = path.pointAt(p, lateralOff);
    this.pos.copy(pt);
    this.yaw = path.headingAt(p);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.slip = 0;
    this.progress = p;
    this.lastProgress = p;
    this.lap = 0;
    this.totalProgress = -1 + p;
    this.lapTimes = [];
    this.bestLap = 0;
    this.finished = false;
    this.finishTime = 0;
    this.hintIndex = -1;
    this.syncMesh();
  }

  syncMesh() {
    this.rig.group.rotation.order = "YXZ";
    this.rig.group.position.copy(this.pos);
    this.rig.group.rotation.set(this.pitch, this.yaw, this.roll);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  update(dt: number, path: TrackPath, surfaceGrip = 1) {
    const c = this.controls;
    const def = this.def;

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);

    let vf = this.vel.x * fx + this.vel.z * fz;
    let vr = this.vel.x * rx + this.vel.z * rz;

    const boosting = this.boostTime > 0;
    const gripMul = surfaceGrip * (boosting ? 1.05 : 1);
    const topSpeed = def.topSpeed * (this.offTrack ? 0.62 : 1) * this.aiSkill * (boosting ? 1.28 : 1);
    const accel = def.accel * (this.offTrack ? 0.62 : 1) * (boosting ? 1.75 : 1);

    // engine / brake
    const speedRatio = Math.min(1, Math.abs(vf) / topSpeed);
    const power = accel * (1 - speedRatio * speedRatio * 0.85);
    if (c.throttle > 0) vf += power * c.throttle * dt;
    if (c.brake > 0) {
      if (vf > 0.5) vf -= def.brake * c.brake * dt;
      else vf -= def.accel * 0.55 * c.brake * dt;
    }
    // drag + rolling resistance (tuned so cars settle just under their top speed)
    const drag = 0.00025 + (this.offTrack ? 0.0009 : 0);
    vf -= vf * Math.abs(vf) * drag * dt;
    vf -= vf * (this.offTrack ? 0.55 : 0.06) * dt;
    if (c.throttle === 0 && c.brake === 0 && Math.abs(vf) < 0.6) vf *= 0.9;
    if (vf < -28) vf = -28;
    if (vf > topSpeed) vf -= (vf - topSpeed) * 3 * dt;

    // steering — more on-rails, less floaty
    const absSpeed = Math.abs(vf);
    const speedFactor = absSpeed / (absSpeed + 20);
    const steerAuthority = def.handling * (1 - Math.min(0.35, absSpeed * 0.0028));
    const handbrake = c.handbrake && absSpeed > 6;
    let yawRate = c.steer * steerAuthority * speedFactor * (handbrake ? 1.25 : 1);
    if (vf < -0.5) yawRate = -yawRate;
    // slide-induced rotation — reduced for stability
    yawRate += -vr * 0.006 * Math.sign(vf || 1) * def.drift;
    this.yaw += yawRate * dt;

    // lateral grip — higher base, more planted
    const gripCoef =
      (handbrake ? 1.4 : 9.0 + def.grip * 9) * gripMul * (this.offTrack ? 0.68 : 1);
    vr *= Math.exp(-gripCoef * dt);
    // cornering force — smaller, less sideways push
    vr -= yawRate * vf * dt * (0.9 - def.grip * 0.5);

    const maxSlip = 18;
    if (Math.abs(vr) > maxSlip) vr = Math.sign(vr) * maxSlip;

    const nfx = Math.sin(this.yaw);
    const nfz = Math.cos(this.yaw);
    const nrx = Math.cos(this.yaw);
    const nrz = -Math.sin(this.yaw);
    this.vel.x = nfx * vf + nrx * vr;
    this.vel.z = nfz * vf + nrz * vr;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    this.accelG = (vf - this.prevSpeed) / Math.max(dt, 0.0001);
    this.prevSpeed = vf;
    this.speed = vf;
    this.slip = vr;

    if (this.boostTime > 0) this.boostTime -= dt;
    if (this.boostCooldown > 0) this.boostCooldown -= dt;
    if (this.hitTimer > 0) this.hitTimer -= dt;

    // track projection
    const proj = path.project(this.pos.x, this.pos.z, this.hintIndex);
    this.hintIndex = proj.index;
    const absLat = Math.abs(proj.lateral);
    this.offTrack = absLat > path.halfWidth + 1.2;

    // barrier collision
    const limit = path.halfWidth + 10.4;
    if (absLat > limit) {
      const sign = Math.sign(proj.lateral);
      const s = proj.sample;
      const overshoot = absLat - limit;
      this.pos.x -= s.nx * sign * overshoot;
      this.pos.z -= s.nz * sign * overshoot;
      const vn = this.vel.x * s.nx + this.vel.z * s.nz;
      if (vn * sign > 0) {
        this.vel.x -= s.nx * vn * 1.35;
        this.vel.z -= s.nz * vn * 1.35;
        this.hitTimer = 0.35;
      }
      this.vel.multiplyScalar(0.94);
    }

    // lap progress
    const prev = this.lastProgress;
    const cur = proj.progress;
    let delta = cur - prev;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    this.progress = cur;
    this.lastProgress = cur;
    if (Math.abs(delta) < 0.4) this.totalProgress += delta;

    // ground height + orientation
    const groundY = this.offTrack
      ? path.terrainHeight(this.pos.x, this.pos.z)
      : proj.sample.y;
    this.pos.y += (groundY - this.pos.y) * Math.min(1, dt * 12);

    if (this.offTrack && absSpeed > 4) {
      this.bounce += dt * absSpeed * 0.6;
    } else {
      this.bounce *= 0.9;
    }
    const rumble = this.offTrack ? Math.sin(this.bounce * 6) * 0.05 * Math.min(1, absSpeed / 30) : 0;

    // Body roll: subtle weight transfer (~4° max) — a drift should read as a
    // flat slide, not the car tipping onto two wheels.
    const targetRoll = THREE.MathUtils.clamp(yawRate * vf * 0.002 + vr * 0.0012, -0.07, 0.07);
    this.roll += (targetRoll + rumble - this.roll) * Math.min(1, dt * 5);
    const targetPitch = THREE.MathUtils.clamp(-this.accelG * 0.0035, -0.09, 0.09) - proj.sample.pitch;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);

    // wheels — angular velocity = v / r, so bigger tyres spin slower
    this.wheelSpin += (vf / this.rig.tireR) * dt;
    for (const w of this.rig.wheels) w.rotation.x = this.wheelSpin;
    const steerVis = c.steer * 0.44;
    for (const s of this.rig.steer) s.rotation.y += (steerVis - s.rotation.y) * Math.min(1, dt * 12);

    this.rig.brakeMat.emissiveIntensity = c.brake > 0.1 ? 3.2 : 0.9;

    this.syncMesh();
  }

  /** true when the tyres are audibly sliding */
  get sliding() {
    return Math.abs(this.slip) > 9.5 && Math.abs(this.speed) > 10;
  }

  /**
   * Lightweight visual update used by the menu cutscenes. The full physics
   * step never runs there, so wheel spin, steering and body roll have to be
   * driven directly from the scripted `speed` / `slip` values.
   */
  showroom(dt: number, steerTarget: number) {
    // rolling wheels
    this.wheelSpin += (this.speed / this.rig.tireR) * dt;
    for (const w of this.rig.wheels) w.rotation.x = this.wheelSpin;

    // steering (opposite lock while sliding)
    for (const s of this.rig.steer) {
      s.rotation.y += (steerTarget * 0.5 - s.rotation.y) * Math.min(1, dt * 7);
    }

    // weight transfer: subtle lean, never a rollover
    const targetRoll = THREE.MathUtils.clamp(this.slip * 0.003, -0.06, 0.06);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 4);
    const targetPitch = THREE.MathUtils.clamp(-this.speed * 0.0018, -0.05, 0.05);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 3.5);

    this.syncMesh();
  }
}

/* ------------------------------------------------------------------ */
/* AI driver                                                           */
/* ------------------------------------------------------------------ */
const tmpTarget = new THREE.Vector3();

export function driveAI(
  v: Vehicle,
  path: TrackPath,
  dt: number,
  time: number,
  playerProgress: number,
  aggression: number,
  others: Vehicle[],
) {
  const c = v.controls;
  const absSpeed = Math.abs(v.speed);
  const lookDist = 14 + absSpeed * 0.52;
  const aheadT = v.progress + lookDist / path.length;

  // curvature scan ahead to pick the corner speed
  const idx = Math.round((v.progress - Math.floor(v.progress)) * path.count);
  let maxCurv = 0;
  const scan = Math.round((22 + absSpeed * 1.35) / (path.length / path.count));
  for (let k = 4; k < scan; k++) {
    const s = path.sampleAt(idx + k);
    const w = 1 - (k / scan) * 0.45;
    maxCurv = Math.max(maxCurv, s.curv * w);
  }
  const here = path.sampleAt(idx);
  const curvNow = Math.max(here.curv, maxCurv * 0.65);

  // racing line: hug the inside of the upcoming corner
  const ahead = path.sampleAt(idx + Math.round(scan * 0.55));
  let dir = ahead.tx * here.nx + ahead.tz * here.nz;
  dir = THREE.MathUtils.clamp(dir * 6, -1, 1);
  const lineTarget = dir * path.halfWidth * 0.45 + v.aiLine;

  // avoidance
  let avoid = 0;
  for (const o of others) {
    if (o === v) continue;
    const dx = o.pos.x - v.pos.x;
    const dz = o.pos.z - v.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 22) continue;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const along = dx * fx + dz * fz;
    if (along < 1 || along > 20) continue;
    const side = dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw);
    avoid += (side > 0 ? 1 : -1) * (1 - dist / 22) * 7;
  }

  const wander = Math.sin(time * 0.7 + v.aiNoisePhase) * 1.4;
  const targetLat = THREE.MathUtils.clamp(
    lineTarget + avoid + wander,
    -path.halfWidth + 2.2,
    path.halfWidth - 2.2,
  );

  path.pointAt(aheadT, targetLat, tmpTarget);
  const toX = tmpTarget.x - v.pos.x;
  const toZ = tmpTarget.z - v.pos.z;
  const desired = Math.atan2(toX, toZ);
  let diff = desired - v.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  c.steer = THREE.MathUtils.clamp(diff * 2.1, -1, 1);

  // speed control
  const latAccel = 62 * v.aiSkill * aggression;
  const cornerSpeed = curvNow > 0.0002 ? Math.sqrt(latAccel / curvNow) : 999;
  let target = Math.min(v.def.topSpeed * v.aiSkill, cornerSpeed);

  // rubber banding
  const gap = playerProgress - v.totalProgress;
  target *= 1 + THREE.MathUtils.clamp(gap * 0.35, -0.06, 0.14);

  if (absSpeed < target - 1.5) {
    c.throttle = 1;
    c.brake = 0;
  } else if (absSpeed > target + 3) {
    c.throttle = 0;
    c.brake = THREE.MathUtils.clamp((absSpeed - target) / 16, 0.15, 1);
  } else {
    c.throttle = 0.45;
    c.brake = 0;
  }
  c.handbrake = false;

  // recovery when stuck or badly off line
  if (absSpeed < 3 && v.offTrack) {
    c.throttle = 1;
    c.brake = 0;
  }

  // occasional boost on straights
  if (v.boostCooldown <= 0 && curvNow < 0.0035 && absSpeed > v.def.topSpeed * 0.6 && Math.random() < dt * 0.12) {
    v.boostTime = 1.6;
    v.boostCooldown = 9;
  }
}
