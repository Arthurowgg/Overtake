import * as THREE from "three";
import { TrackPath } from "./path";
import { buildWorld, type World } from "./world";
import { Vehicle, driveAI, type Controls } from "./vehicle";
import { PostFX } from "./post";
import { AI_COLORS, AI_NAMES, carById, type CarDef } from "./cars";
import { trackById, type TrackDef } from "./tracks";
import { Sfx } from "./audio";
import { GamepadManager, PAD } from "./gamepad";
import {
  msaaSamples,
  raySamples,
  shadowMapSize,
  type Action,
  type Settings,
  defaultSettings,
} from "./settings";

export type InputDevice = "keyboard" | "gamepad" | "touch";

export type RaceState = "preview" | "countdown" | "racing" | "finished";

export interface Standing {
  name: string;
  isPlayer: boolean;
  lap: number;
  color: string;
  gap: number;
  finished: boolean;
  time: number;
  best: number;
}

export interface Telemetry {
  state: RaceState;
  speed: number;
  speedMax: number;
  units: string;
  rpm: number;
  gear: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalCars: number;
  lapTime: number;
  bestLap: number;
  lastLap: number;
  raceTime: number;
  countdown: number;
  drift: number;
  driftScore: number;
  boost: number;
  boosting: boolean;
  offTrack: boolean;
  wrongWay: boolean;
  standings: Standing[];
  cars: { x: number; z: number; isPlayer: boolean; color: string; angle: number }[];
  fps: number;
}

export interface RaceResult {
  position: number;
  totalCars: number;
  time: number;
  bestLap: number;
  laps: number[];
  standings: Standing[];
  trackId: string;
  carId: string;
}

const ACTIONS: Action[] = ["up", "down", "left", "right", "hand", "boost", "camera", "reset", "look"];

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  post: PostFX;
  path!: TrackPath;
  world!: World;
  trackDef!: TrackDef;
  carDef!: CarDef;
  vehicles: Vehicle[] = [];
  player!: Vehicle;
  sfx = new Sfx();

  state: RaceState = "preview";
  raceTime = 0;
  countdown = 2.99;
  goTimer = 0;
  totalLaps = 3;
  driftScore = 0;
  driftCombo = 0;
  boostFuel = 0.35;
  wrongWay = false;
  cameraMode = 0;
  paused = false;
  muted = false;

  telemetry: Telemetry = {
    state: "preview",
    speed: 0,
    speedMax: 360,
    units: "KM/H",
    rpm: 0,
    gear: 1,
    lap: 1,
    totalLaps: 3,
    position: 1,
    totalCars: 1,
    lapTime: 0,
    bestLap: 0,
    lastLap: 0,
    raceTime: 0,
    countdown: 0,
    drift: 0,
    driftScore: 0,
    boost: 0.35,
    boosting: false,
    offTrack: false,
    wrongWay: false,
    standings: [],
    cars: [],
    fps: 60,
  };

  onFinish: ((r: RaceResult) => void) | null = null;
  onState: ((s: RaceState) => void) | null = null;

  settings: Settings = defaultSettings();
  private keyToAction = new Map<string, Action>();
  private keys: Record<string, boolean> = {};
  private touch: Partial<Controls> = {};
  readonly gamepad = new GamepadManager();
  lastInputDevice: InputDevice = "keyboard";
  onInputDevice: ((d: InputDevice) => void) | null = null;
  private padSteer = 0;
  private padThrottle = 0;
  private padBrake = 0;
  private padHand = false;
  private padBoost = false;
  private padLook = false;
  private prevGear = 1;
  private clock = new THREE.Clock();
  private raf = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private rayColor = new THREE.Color();
  private shake = 0;
  private flash = 0;
  private previewAngle = 0;
  private previewPhase = 0;
  private previewCutTimer = 0;
  private previewShotTime = 0;
  private previewSeed = 0;
  private previewDir = 1;
  private previewMode: "track" | "garage" = "track";
  private previewFocus = new THREE.Vector3();
  private garageAnchor = new THREE.Vector3();
  private lastShowroomPhase = -1;
  private pvPoint = new THREE.Vector3();
  private pvTangent = new THREE.Vector3();
  private garageGroup: THREE.Group | null = null;
  private garageCenter = new THREE.Vector3(3500, 0, 3500);
  private particles!: THREE.Points;
  private pData!: { life: Float32Array; vel: Float32Array; max: number; cursor: number };
  private container: HTMLElement;
  private fpsAcc = 0;
  private fpsCount = 0;
  private lastFinishCheck = 0;
  private mapBounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  mapPath = "";

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.6, 9000);
    this.post = new PostFX(this.renderer);
    this.rebuildKeyMap();
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  /* ------------------------------------------------------------ */
  private resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.post.setSize(w * pr, h * pr);
  };

  private rebuildKeyMap() {
    this.keyToAction.clear();
    const { bindings, secondary } = this.settings.controls;
    for (const a of ACTIONS) {
      if (bindings[a]) this.keyToAction.set(bindings[a], a);
      if (secondary[a]) this.keyToAction.set(secondary[a], a);
    }
  }

  /** true while the given action's key is held */
  private held(a: Action) {
    return !!this.keys[a];
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = this.keyToAction.get(e.code);
    if (!k) return;
    if (this.lastInputDevice !== "keyboard") {
      this.lastInputDevice = "keyboard";
      this.onInputDevice?.("keyboard");
    }
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (k === "camera" && !this.keys[k]) this.cameraMode = (this.cameraMode + 1) % 3;
    if (k === "reset" && !this.keys[k]) this.resetPlayer();
    this.keys[k] = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = this.keyToAction.get(e.code);
    if (k) this.keys[k] = false;
  };

  setTouch(c: Partial<Controls>) {
    this.touch = c;
    if (Object.keys(c).length) {
      this.lastInputDevice = "touch";
      this.onInputDevice?.("touch");
    }
  }

  /* ------------------------------------------------------------ */
  /** Poll the gamepad, merge its input into the action state. */
  private pollGamepad() {
    const gp = this.gamepad;
    gp.poll();

    if (gp.connected && this.lastInputDevice !== "gamepad") {
      this.lastInputDevice = "gamepad";
      this.onInputDevice?.("gamepad");
    }

    if (!gp.connected) {
      this.padSteer = 0;
      this.padThrottle = 0;
      this.padBrake = 0;
      this.padHand = false;
      this.padBoost = false;
      this.padLook = false;
      return;
    }

    // analogue driving
    this.padSteer = gp.axis(PAD.AX_LX);
    this.padThrottle = gp.value(PAD.RT);
    this.padBrake = gp.value(PAD.LT);

    // buttons — generous mapping so any standard pad feels natural
    this.padHand = gp.button(PAD.A) || gp.button(PAD.X) || gp.button(PAD.LB);
    this.padBoost = gp.button(PAD.B) || gp.button(PAD.Y) || gp.button(PAD.RB);
    this.padLook = gp.button(PAD.LS) || gp.button(PAD.Y);

    // edge-triggered actions
    if (gp.justPressed(PAD.RS) || gp.justPressed(PAD.DPAD_UP)) this.cameraMode = (this.cameraMode + 1) % 3;
    if (gp.justPressed(PAD.BACK)) this.resetPlayer();
    if (gp.justPressed(PAD.START)) {
      // route through the same path as the Escape key so React pause handles it
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
    }

    gp.snapshot();
  }

  /** Rumble feedback, gated by the vibration setting. */
  private rumble(strength: number, ms: number) {
    if (!this.settings.controls.padVibration) return;
    this.gamepad.rumble(ms, strength);
  }

  private ensureGarage() {
    if (this.garageGroup) return;
    const g = new THREE.Group();
    const center = this.garageCenter;
    // floor
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x252830, roughness: 0.92, metalness: 0.05 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(center.x, center.y - 0.02, center.z);
    floor.receiveShadow = true;
    g.add(floor);
    // drift circle decal
    const ringGeo = new THREE.RingGeometry(6.2, 7.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 1 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(center.x, center.y + 0.01, center.z);
    ring.receiveShadow = true;
    g.add(ring);
    // center mark
    const dotGeo = new THREE.CircleGeometry(0.6, 16);
    dotGeo.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(center.x, center.y + 0.015, center.z);
    g.add(dot);
    // simple walls (low)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 1 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        if (sx === -1 && sz === -1) continue;
        // four walls around the 80x80 square
      }
    }
    const wallH = 3;
    const wallT = 0.6;
    const walls: [number, number, number, number][] = [
      [80, wallH, wallT, 0],
      [80, wallH, wallT, 0],
      [wallT, wallH, 80, 0],
      [wallT, wallH, 80, 0],
    ];
    const wallPos: [number, number][] = [
      [0, 40], [0, -40], [40, 0], [-40, 0],
    ];
    wallPos.forEach(([dx, dz], i) => {
      const w = walls[i];
      const wallGeo = new THREE.BoxGeometry(w[0], w[1], w[2]);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(center.x + dx, center.y + wallH / 2, center.z + dz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      g.add(wall);
    });
    // overhead soft light for garage
    const garageLight = new THREE.PointLight(0xffeede, 1.2, 60);
    garageLight.position.set(center.x, center.y + 12, center.z);
    g.add(garageLight);

    this.scene.add(g);
    this.garageGroup = g;
    this.garageGroup.visible = false;
  }

  /* ------------------------------------------------------------ */
  setPreviewMode(mode: "track" | "garage") {
    if (this.previewMode === mode) return;
    this.previewMode = mode;
    this.previewPhase = 0;
    this.previewCutTimer = 0; // force an immediate camera cut
    this.previewShotTime = 0;
    if (mode === "garage" && this.player) {
      this.ensureGarage();
      const center = this.garageCenter;
      this.player.pos.set(center.x, center.y + 0.02, center.z);
      this.player.yaw = 0.18;
      this.player.vel.set(0, 0, 0);
      this.player.speed = 0;
      this.player.slip = 0;
      this.player.syncMesh();
      this.garageAnchor.copy(center);
      this.previewFocus.copy(center);
      this.lastShowroomPhase = -1;
      if (this.garageGroup) this.garageGroup.visible = true;
    } else {
      if (this.garageGroup) this.garageGroup.visible = false;
    }
    // clear the grid so nothing blocks the showroom framing
    for (const v of this.vehicles) {
      if (!v.isPlayer) v.rig.group.visible = mode !== "garage";
    }
    this.world?.setExtrasVisible(mode !== "garage");
  }

  swapPlayerCar(carId: string) {
    if (!this.player || !this.path) return;
    const car = carById(carId);
    if (this.carDef.id === car.id) return;
    
    // Dispose the old car model
    this.player.rig.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.scene.remove(this.player.rig.group);

    // Build and add the new one in the player slot
    const keepYaw = this.player.yaw;
    const keepPos = this.player.pos.clone();
    this.carDef = car;
    const v = new Vehicle(car, "YOU", true, car.color);
    v.aiSkill = 1;
    v.placeOnGrid(this.path, this.vehicles.length - 1);
    // keep position/orientation so swapping cars doesn't jump the framing
    if (this.state === "preview" && this.previewMode === "garage") {
      v.pos.copy(keepPos);
      v.yaw = keepYaw;
      v.vel.set(0, 0, 0);
      v.speed = 0;
      v.slip = 0;
      // let the director re-stage the new car for the current shot
      this.lastShowroomPhase = -1;
      v.syncMesh();
    }
    this.scene.add(v.rig.group);
    
    // Replace the reference
    this.vehicles[this.vehicles.length - 1] = v;
    this.player = v;
    this.sfx.setEngineSpec(car.engine, car.id);
  }

  /** Apply a settings object to the renderer, post stack, world and audio. */
  applySettings(s: Settings) {
    const prev = this.settings;
    this.settings = s;
    const g = s.graphics;

    this.rebuildKeyMap();

    // renderer resolution — supports up to 3.0x
    const pr = Math.min(window.devicePixelRatio * g.resolutionScale, 3.0);
    if (Math.abs(this.renderer.getPixelRatio() - pr) > 0.001) {
      this.renderer.setPixelRatio(pr);
    }

    // shadows / fog
    const shadowSize = shadowMapSize(g.shadows);
    this.renderer.shadowMap.enabled = shadowSize > 0;
    this.world?.setShadowQuality(shadowSize);
    this.world?.setDrawDistance(g.drawDistance);
    this.camera.far = 9000 * Math.max(0.6, g.drawDistance);
    this.camera.updateProjectionMatrix();

    // controller
    this.gamepad.setDeadzone(s.controls.padDeadzone);

    // post stack
    this.post.setQuality({
      samples: msaaSamples(g.antialiasing),
      raySamples: raySamples(g.godRays),
      fxaa: g.antialiasing === "fxaa",
      bloomEnabled: s.video.bloom > 0.001,
    });

    if (prev.graphics.resolutionScale !== g.resolutionScale) this.resize();

    // audio
    this.sfx.setVolumes({
      master: s.audio.master,
      engine: s.audio.engine,
      sfx: s.audio.sfx,
      music: s.audio.music,
    });
    if (prev.audio.shuffle !== s.audio.shuffle) this.sfx.music.reshuffle(s.audio.shuffle);
    this.sfx.music.setEnabled(s.audio.musicEnabled && !this.muted);

    if (prev.controls.defaultCamera !== s.controls.defaultCamera) {
      this.cameraMode = s.controls.defaultCamera;
    }
  }

  /* ------------------------------------------------------------ */
  loadRace(trackId: string, carId: string, opponents: number, difficulty: number, preview = false) {
    this.disposeWorld();
    const def = trackById(trackId);
    const car = carById(carId);
    this.trackDef = def;
    this.carDef = car;
    this.totalLaps = def.laps;
    this.path = new TrackPath(def);
    this.world = buildWorld(this.scene, this.path, def);
    // summer realistic: bright env map for car reflections
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new THREE.Scene();
      const skyCol = new THREE.Color(def.theme.skyHorizon);
      envScene.background = skyCol;
      const hemiEnv = new THREE.HemisphereLight(def.theme.skyHorizon, def.theme.hemiGround, 1.2);
      envScene.add(hemiEnv);
      const sunEnv = new THREE.DirectionalLight(def.theme.sunColor, 2.2);
      sunEnv.position.set(def.theme.sunDir[0] * 10, def.theme.sunDir[1] * 10, def.theme.sunDir[2] * 10);
      envScene.add(sunEnv);
      const rt = pmrem.fromScene(envScene, 0.04);
      this.scene.environment = rt.texture;
      pmrem.dispose();
    } catch {
      /* ignore env failure */
    }
    this.buildParticles();
    this.buildMapPath();

    const grid = opponents + 1;
    this.vehicles = [];
    for (let i = 0; i < grid; i++) {
      const isPlayer = i === grid - 1;
      const vDef = isPlayer ? car : this.pickAiCar(i);
      const v = new Vehicle(
        vDef,
        isPlayer ? "YOU" : AI_NAMES[i % AI_NAMES.length],
        isPlayer,
        isPlayer ? car.color : AI_COLORS[i % AI_COLORS.length],
      );
      v.aiSkill = isPlayer
        ? 1
        : (car.topSpeed / vDef.topSpeed) * (0.855 + difficulty * 0.052 + (i % 3) * 0.012);
      v.aiLine = (Math.random() - 0.5) * 4;
      v.aiNoisePhase = Math.random() * 10;
      // the player starts at the back of the grid
      v.placeOnGrid(this.path, i);
      this.scene.add(v.rig.group);
      this.vehicles.push(v);
      if (isPlayer) this.player = v;
    }

    this.raceTime = 0;
    this.driftScore = 0;
    this.boostFuel = 0.35;
    this.countdown = 2.99;
    this.goTimer = 0;
    this.state = preview ? "preview" : "countdown";
    this.telemetry.totalLaps = this.totalLaps;
    this.telemetry.totalCars = grid;
    this.previewAngle = 0;
    this.previewPhase = 0;
    this.previewCutTimer = 0;
    this.previewShotTime = 0;
    this.previewSeed = Math.random() * 1000;
    if (this.player) {
      this.previewFocus.copy(this.player.pos);
      this.garageAnchor.copy(this.player.pos);
      for (const v of this.vehicles) {
        if (!v.isPlayer) v.rig.group.visible = !(preview && this.previewMode === "garage");
      }
      this.world?.setExtrasVisible(!(preview && this.previewMode === "garage"));
    }
    this.prevGear = 1;
    this.cameraMode = this.settings.controls.defaultCamera;
    // the world was just rebuilt — re-apply the graphics settings that live on it
    this.world.setShadowQuality(shadowMapSize(this.settings.graphics.shadows));
    this.world.setDrawDistance(this.settings.graphics.drawDistance);
    this.updateCamera(0, true);
    this.onState?.(this.state);
  }

  private pickAiCar(i: number): CarDef {
    const ids = ["mustang", "lambo"];
    return carById(ids[i % ids.length]);
  }

  beginCountdown() {
    this.state = "countdown";
    this.countdown = 2.99;
    this.goTimer = 0;
    this.raceTime = 0;
    this.driftScore = 0;
    this.boostFuel = 0.35;
    this.vehicles.forEach((v, i) => {
      v.placeOnGrid(this.path, i);
      v.rig.group.visible = true;
    });
    this.onState?.(this.state);
    this.sfx.resume();
  }

  restart() {
    this.beginCountdown();
  }

  resetPlayer() {
    const v = this.player;
    if (!v) return;
    const p = v.progress;
    const pt = this.path.pointAt(p, 0);
    v.pos.copy(pt);
    v.pos.y += 0.4;
    v.yaw = this.path.headingAt(p);
    v.vel.set(0, 0, 0);
    v.speed = 0;
    v.slip = 0;
    v.hintIndex = -1;
    v.syncMesh();
  }

  /* ------------------------------------------------------------ */
  private buildMapPath() {
    const pts: [number, number][] = [];
    const step = Math.max(1, Math.floor(this.path.count / 160));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.path.count; i += step) {
      const s = this.path.sampleAt(i);
      pts.push([s.x, s.z]);
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z);
      maxZ = Math.max(maxZ, s.z);
    }
    const pad = 30;
    this.mapBounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    const w = this.mapBounds.maxX - this.mapBounds.minX;
    const h = this.mapBounds.maxZ - this.mapBounds.minZ;
    const size = Math.max(w, h);
    const ox = (size - w) / 2;
    const oz = (size - h) / 2;
    this.mapBounds.minX -= ox;
    this.mapBounds.minZ -= oz;
    this.mapBounds.maxX = this.mapBounds.minX + size;
    this.mapBounds.maxZ = this.mapBounds.minZ + size;
    this.mapPath =
      pts
        .map((p, i) => {
          const x = ((p[0] - this.mapBounds.minX) / size) * 100;
          const y = ((p[1] - this.mapBounds.minZ) / size) * 100;
          return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ") + " Z";
  }

  private mapCoord(x: number, z: number) {
    const size = this.mapBounds.maxX - this.mapBounds.minX;
    return {
      x: ((x - this.mapBounds.minX) / size) * 100,
      y: ((z - this.mapBounds.minZ) / size) * 100,
    };
  }

  /* ------------------------------------------------------------ */
  private buildParticles() {
    const max = 800;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3);
    const col = new Float32Array(max * 3);
    const size = new Float32Array(max);
    for (let i = 0; i < max; i++) pos[i * 3 + 1] = -9999;
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("psize", new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 650 } },
      vertexShader: `
        attribute float psize;
        varying vec3 vCol;
        uniform float scale;
        void main() {
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vCol;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.04, length(d));
          if (a < 0.02) discard;
          gl_FragColor = vec4(vCol, a * 0.65);
        }`,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.pData = { life: new Float32Array(max), vel: new Float32Array(max * 3), max, cursor: 0 };
  }

  private emit(
    x: number,
    y: number,
    z: number,
    color: THREE.Color,
    vx: number,
    vy: number,
    vz: number,
    size: number,
  ) {
    const d = this.pData;
    const i = d.cursor;
    d.cursor = (d.cursor + 1) % d.max;
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.particles.geometry.attributes.color as THREE.BufferAttribute;
    const psz = this.particles.geometry.attributes.psize as THREE.BufferAttribute;
    pos.setXYZ(i, x, y, z);
    col.setXYZ(i, color.r, color.g, color.b);
    psz.setX(i, size);
    d.life[i] = 1;
    d.vel[i * 3] = vx;
    d.vel[i * 3 + 1] = vy;
    d.vel[i * 3 + 2] = vz;
  }

  private updateParticles(dt: number) {
    const d = this.pData;
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const psz = this.particles.geometry.attributes.psize as THREE.BufferAttribute;
    let dirty = false;
    for (let i = 0; i < d.max; i++) {
      if (d.life[i] <= 0) continue;
      d.life[i] -= dt * 0.85;
      dirty = true;
      if (d.life[i] <= 0) {
        pos.setY(i, -9999);
        continue;
      }
      pos.setXYZ(
        i,
        pos.getX(i) + d.vel[i * 3] * dt,
        pos.getY(i) + d.vel[i * 3 + 1] * dt,
        pos.getZ(i) + d.vel[i * 3 + 2] * dt,
      );
      psz.setX(i, psz.getX(i) * (1 + dt * 1.2));
    }
    if (dirty) {
      pos.needsUpdate = true;
      psz.needsUpdate = true;
      (this.particles.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /* ------------------------------------------------------------ */
  start() {
    this.clock.start();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 1 / 25);
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  private frame(dt: number) {
    if (!this.path) return;
    this.pollGamepad();
    const active = !this.paused;
    if (active) {
      if (this.state === "countdown") {
        const before = Math.ceil(this.countdown);
        this.countdown -= dt;
        const after = Math.ceil(this.countdown);
        if (after !== before && after >= 0) this.sfx.beep(after === 0 ? 880 : 440);
        if (this.countdown <= 0) {
          this.state = "racing";
          this.goTimer = 1;
          this.onState?.(this.state);
        }
        this.stepVehicles(dt, false);
      } else if (this.state === "racing") {
        this.raceTime += dt;
        if (this.goTimer > 0) this.goTimer -= dt;
        this.stepVehicles(dt, true);
      } else if (this.state === "finished") {
        this.stepVehicles(dt, true, true);
      } else {
        this.previewAngle += dt * 0.09;
        this.advancePreviewShot(dt);
        if (this.previewMode === "garage" && this.player) this.driveShowroom(dt);
      }
      this.updateParticles(dt);
    }

    this.updateCamera(dt, false);
    this.world.update(
      this.state === "preview" || !this.player ? this.previewFocus : this.player.pos,
    );
    this.updateTelemetry();
    this.updateAudio(dt);

    const speedNorm = Math.min(1, Math.abs(this.player?.speed ?? 0) / 120);
    const boosting = (this.player?.boostTime ?? 0) > 0;
    this.flash *= 0.86;
    const vid = this.settings.video;
    this.post.render(
      this.scene,
      this.camera,
      this.world.occluderScene,
      this.world.sunWorld,
      {
        bloom: this.trackDef.theme.bloom * vid.bloom * (boosting ? 1.25 : 1),
        rays: this.trackDef.theme.godRays,
        rayColor: this.rayColor.set(this.trackDef.theme.sunGlow),
        exposure: vid.exposure,
        speed:
          this.state === "preview" ? 0 : speedNorm * (boosting ? 1.7 : 1) * vid.motionBlur,
        flash: this.flash,
        chroma: 0.0035 * vid.chromatic,
        vignette: vid.vignette,
      },
      performance.now() * 0.001,
      this.particles,
    );

    this.fpsAcc += dt;
    this.fpsCount++;
    if (this.fpsAcc > 0.5) {
      this.telemetry.fps = Math.round(this.fpsCount / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsCount = 0;
    }
  }

  private advancePreviewShot(dt: number) {
    this.previewCutTimer -= dt;
    this.previewShotTime += dt;
    if (this.previewCutTimer > 0) return;

    const shots = this.previewMode === "garage" ? 4 : 6;
    // fully random, never the same as last shot
    let next: number;
    do {
      next = Math.floor(Math.random() * shots);
    } while (shots > 1 && next === this.previewPhase);
    this.previewPhase = next;
    this.previewCutTimer = this.previewMode === "garage" ? 4.8 + Math.random() * 1.4 : 5.5 + Math.random() * 2.2;
    this.previewShotTime = 0;
    this.previewSeed = Math.random() * 1000;
    this.previewDir = Math.random() < 0.5 ? -1 : 1;
    this.lastShowroomPhase = -1;
  }

  private stageShowroomShot(v: Vehicle) {
    const center = this.garageCenter;
    // reset
    v.vel.set(0, 0, 0);
    v.speed = 0;
    v.slip = 0;
    v.controls.throttle = 0;
    v.controls.brake = 0;
    v.controls.steer = 0;
    v.controls.handbrake = false;
    v.controls.boost = false;
    v.hintIndex = -1;

    if (this.previewPhase === 1) {
      // Slow-roll: start 12m behind center, facing +Z
      v.pos.set(center.x, center.y + 0.02, center.z - 12);
      v.yaw = 0;
      v.speed = 5;
      v.vel.set(0, 0, v.speed);
    } else if (this.previewPhase === 2) {
      // Drift entry: start on circle south side, already with yaw offset
      const R = 7.2;
      const ang = -Math.PI / 2;
      v.pos.set(center.x + Math.cos(ang) * R, center.y + 0.02, center.z + Math.sin(ang) * R);
      v.yaw = ang + Math.PI / 2 + this.previewDir * 0.38;
      v.speed = 18;
      v.vel.set(Math.sin(v.yaw) * v.speed, 0, Math.cos(v.yaw) * v.speed);
    } else if (this.previewPhase === 3) {
      v.pos.set(center.x, center.y + 0.02, center.z);
      v.yaw = Math.PI * 0.35 * this.previewDir;
    } else {
      v.pos.set(center.x, center.y + 0.02, center.z);
      v.yaw = 0.28;
    }
    v.syncMesh();
  }

  /**
   * Garage cutscene director — runs on a flat, isolated plaza at garageCenter,
   * away from the main track. Each shot has its own behaviour, wheels spin
   * in place (no orbiting), lights stay fixed, and drift is a flat slide.
   */
  private driveShowroom(dt: number) {
    const v = this.player;
    if (!v) return;
    const st = this.previewShotTime;
    const dir = this.previewDir;
    const center = this.garageCenter;

    if (this.lastShowroomPhase !== this.previewPhase) {
      this.lastShowroomPhase = this.previewPhase;
      this.stageShowroomShot(v);
    }

    // keep on garage floor
    const groundY = center.y + 0.02;

    switch (this.previewPhase) {
      case 0: {
        // STATIC HERO — fully still, subtle front-wheel wiggle, orbit cam is the star
        v.pos.set(center.x, groundY, center.z);
        v.yaw = 0.28;
        v.speed = 0;
        v.slip = 0;
        v.vel.set(0, 0, 0);
        v.showroom(dt, Math.sin(st * 0.55) * 0.10);
        break;
      }
      case 1: {
        // SLOW-MO ROLL — straight line across the plaza, normal -> slow-mo -> normal
        // timeScale gives the "slow-mo" feel inside one shot
        const timeScale = st < 1.2 ? 1 : st < 3.2 ? 0.35 : 1;
        const speed = 4.2;
        const dist = -12 + st * speed * 0.5; // kinematic, not physics
        // clamp so it doesn't run off the floor
        const clamped = Math.max(-12, Math.min(12, dist));
        v.pos.set(center.x, groundY, center.z + clamped);
        v.yaw = 0;
        v.speed = speed * timeScale;
        v.slip = 0;
        // wheel spin tied to actual movement speed
        v.showroom(dt * timeScale, 0);
        // keep velocity for smoke logic consistency
        v.vel.set(0, 0, speed);
        break;
      }
      case 2: {
        // DRIFT ON CURVE — real circular drift around the garage ring
        const R = 7.0;
        const driftAngle = dir * 0.38; // ~22deg slip
        const speed = 11;
        // angular progress along the circle
        const ang = -Math.PI / 2 + st * (speed / R) * 0.55;
        const cx = center.x + Math.cos(ang) * R;
        const cz = center.z + Math.sin(ang) * R;
        const tangent = ang + Math.PI / 2;
        v.pos.set(cx, groundY, cz);
        v.yaw = tangent + driftAngle;
        v.speed = speed;
        v.slip = dir * 7.5;
        v.showroom(dt, -dir * 0.42); // counter-steer

        // smoke from rear tyres while sliding — smaller, lower
        if (Math.random() < 0.75 * this.settings.graphics.particles) {
          const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
          const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
          const smoke = new THREE.Color(0xd6d6d6);
          for (const side of [-1, 1]) {
            this.emit(
              v.pos.x - fx * 1.2 + rx * side * 0.72,
              v.pos.y + 0.14,
              v.pos.z - fz * 1.2 + rz * side * 0.72,
              smoke,
              (Math.random() - 0.5) * 0.7,
              Math.random() * 0.35 + 0.18,
              (Math.random() - 0.5) * 0.7,
              1.05,
            );
          }
        }
        break;
      }
      default: {
        // LOW DETAIL ORBIT — also static, different camera angle
        v.pos.set(center.x, groundY, center.z);
        v.yaw = Math.PI * 0.36 * dir;
        v.speed = 0;
        v.slip = 0;
        v.vel.set(0, 0, 0);
        v.showroom(dt, 0);
        break;
      }
    }
    v.syncMesh();
  }

  private stepVehicles(dt: number, racing: boolean, autoPilot = false) {
    const p = this.player;
    // player controls
    const c = p.controls;
    if (racing && !autoPilot) {
      const cs = this.settings.controls;

      // throttle / brake — analogue triggers take priority, then keyboard,
      // then touch. c.throttle is used as a 0..1 multiplier by the physics.
      let up: number;
      let down: number;
      if (this.padThrottle > 0.04) up = this.padThrottle;
      else up = this.held("up") || this.touch.throttle || cs.autoAccelerate ? 1 : 0;
      if (this.padBrake > 0.04) down = this.padBrake;
      else down = this.held("down") || this.touch.brake ? 1 : 0;

      // steering — analogue stick overrides the digital keys while it is active.
      // Stick +X is physically "right", but positive steerInput turns LEFT
      // (same convention as the keyboard branch below), so the axis is negated.
      let steerInput: number;
      if (Math.abs(this.padSteer) > 0.02) {
        steerInput = -this.padSteer * cs.steerSensitivity * cs.padSensitivity;
      } else {
        const left = this.held("left") ? 1 : 0;
        const right = this.held("right") ? 1 : 0;
        // world +X appears on screen-left for a chase camera, so a right turn is -yaw
        steerInput = (left - right) * cs.steerSensitivity;
      }
      steerInput += this.touch.steer ?? 0;

      // counter-steer assist: nudge the wheel into the slide when drifting
      if (cs.countersteerAssist > 0 && Math.abs(p.speed) > 12) {
        const slideAngle = Math.atan2(p.slip, Math.abs(p.speed));
        steerInput += slideAngle * 1.5 * cs.countersteerAssist;
      }
      const target = THREE.MathUtils.clamp(steerInput, -1, 1);
      const rate = (Math.abs(target) > 0 ? 9 : 14) * cs.steerSpeed;
      c.steer += (target - c.steer) * Math.min(1, dt * rate);
      c.throttle = down > 0 && cs.autoAccelerate ? 0 : up;
      c.brake = down;
      c.handbrake = !!(this.padHand || this.held("hand") || this.touch.handbrake);
      const wantBoost = !!(this.padBoost || this.held("boost") || this.touch.boost);
      if (wantBoost && this.boostFuel > 0.02) {
        if (p.boostTime <= 0.001) {
          this.sfx.nitro();
          this.rumble(0.5, 200);
        }
        p.boostTime = 0.14;
        this.boostFuel = Math.max(0, this.boostFuel - dt * 0.32);
        this.flash = Math.min(0.06, this.flash + dt * 0.4);
      }
    } else if (autoPilot) {
      driveAI(p, this.path, dt, this.raceTime, p.totalProgress, 1, this.vehicles);
    } else {
      c.throttle = 0;
      c.brake = 0;
      c.steer = 0;
      c.handbrake = false;
    }

    for (const v of this.vehicles) {
      if (!v.isPlayer) {
        if (racing) {
          driveAI(v, this.path, dt, this.raceTime, p.totalProgress, 1, this.vehicles);
        } else {
          v.controls.throttle = 0;
          v.controls.brake = 0;
          v.controls.steer = 0;
        }
      }
      const before = v.totalProgress;
      v.update(dt, this.path, 1);
      if (racing) this.checkLap(v, before);
    }

    this.resolveCollisions();

    // drift scoring + boost gain
    if (racing && !autoPilot) {
      if (p.sliding && !p.offTrack) {
        this.driftCombo += dt;
        this.driftScore += Math.abs(p.slip) * dt * 9;
        this.boostFuel = Math.min(1, this.boostFuel + dt * 0.16);
      } else {
        this.driftCombo *= 0.9;
      }
      // slipstream
      for (const o of this.vehicles) {
        if (o === p) continue;
        const dx = o.pos.x - p.pos.x;
        const dz = o.pos.z - p.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 18 && dist > 2) {
          const fx = Math.sin(p.yaw);
          const fz = Math.cos(p.yaw);
          if ((dx * fx + dz * fz) / dist > 0.86) {
            this.boostFuel = Math.min(1, this.boostFuel + dt * 0.1);
            p.vel.x += fx * 6 * dt;
            p.vel.z += fz * 6 * dt;
          }
        }
      }
    }

    // particles + effects — tighter, smaller smoke
    const density = this.settings.graphics.particles;
    const dust = new THREE.Color(this.trackDef.theme.groundColors[0]).lerp(new THREE.Color(0xffffff), 0.25);
    const smoke = new THREE.Color(0xe5e5e5);
    const boostColors = [new THREE.Color(0x00eaff), new THREE.Color(0x4d9eff), new THREE.Color(0xffb13a)];

    for (const v of density > 0.001 ? this.vehicles : []) {
      const spd = Math.abs(v.speed);
      const emitDust = v.offTrack && spd > 8;
      const emitSmoke = v.sliding;
      if ((emitDust || emitSmoke) && Math.random() < 0.65 * density) {
        const fx = Math.sin(v.yaw);
        const fz = Math.cos(v.yaw);
        const rx = Math.cos(v.yaw);
        const rz = -Math.sin(v.yaw);
        for (const side of [-1, 1]) {
          this.emit(
            v.pos.x - fx * 1.3 + rx * side * 0.82,
            v.pos.y + 0.12,
            v.pos.z - fz * 1.3 + rz * side * 0.82,
            emitDust ? dust : smoke,
            (Math.random() - 0.5) * (emitDust ? 1.6 : 0.8) + v.vel.x * 0.06,
            Math.random() * (emitDust ? 0.9 : 0.45) + 0.18,
            (Math.random() - 0.5) * (emitDust ? 1.6 : 0.8) + v.vel.z * 0.06,
            emitDust ? 1.5 : 1.1,
          );
        }
      }
      if (v.boostTime > 0 && Math.random() < 0.75 * density) {
        const fx = Math.sin(v.yaw);
        const fz = Math.cos(v.yaw);
        const rx = Math.cos(v.yaw);
        const rz = -Math.sin(v.yaw);
        const flameCol = boostColors[Math.floor(Math.random() * boostColors.length)];
        for (const side of [-0.35, 0.35]) {
          this.emit(
            v.pos.x - fx * 1.8 + rx * side,
            v.pos.y + 0.32,
            v.pos.z - fz * 1.8 + rz * side,
            flameCol,
            -fx * (10 + Math.random() * 6) + (Math.random() - 0.5) * 0.9,
            Math.random() * 0.7 + 0.25,
            -fz * (10 + Math.random() * 6) + (Math.random() - 0.5) * 0.9,
            1.2,
          );
        }
      }
    }

    if (p.hitTimer > 0.3) {
      this.shake = Math.min(1, this.shake + 0.55);
      this.sfx.thud(Math.min(1.2, 0.5 + Math.abs(p.speed) / 90));
      this.rumble(0.8, 300);
    }

    this.updateStandings();
  }

  private checkLap(v: Vehicle, before: number) {
    const beforeLap = Math.floor(before);
    const nowLap = Math.floor(v.totalProgress);
    if (nowLap <= beforeLap || v.finished) return;
    if (nowLap <= 0) {
      v.lapStart = this.raceTime;
      return;
    }
    const t = this.raceTime - v.lapStart;
    v.lapStart = this.raceTime;
    v.lapTimes.push(t);
    if (!v.bestLap || t < v.bestLap) v.bestLap = t;
    v.lap = nowLap;
    if (nowLap >= this.totalLaps) {
      v.finished = true;
      v.finishTime = this.raceTime;
      if (v.isPlayer) {
        this.rumble(0.5, 450);
        this.finishRace();
      }
    } else if (v.isPlayer) {
      this.sfx.beep(660, 0.12);
      this.rumble(0.35, 300);
    }
  }

  private finishRace() {
    if (this.state === "finished") return;
    this.state = "finished";
    this.lastFinishCheck = this.raceTime;
    this.updateStandings();
    const p = this.player;
    this.onState?.(this.state);
    this.onFinish?.({
      position: p.position,
      totalCars: this.vehicles.length,
      time: p.finishTime,
      bestLap: p.bestLap,
      laps: p.lapTimes.slice(),
      standings: this.telemetry.standings.slice(),
      trackId: this.trackDef.id,
      carId: this.carDef.id,
    });
  }

  private resolveCollisions() {
    const n = this.vehicles.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.vehicles[i];
        const b = this.vehicles[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = 3.5;
        if (d > min || d < 0.0001) continue;
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) * 0.5;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        const rvx = b.vel.x - a.vel.x;
        const rvz = b.vel.z - a.vel.z;
        const rel = rvx * nx + rvz * nz;
        if (rel < 0) {
          const imp = rel * 0.85;
          a.vel.x += nx * imp;
          a.vel.z += nz * imp;
          b.vel.x -= nx * imp;
          b.vel.z -= nz * imp;
          if ((a.isPlayer || b.isPlayer) && Math.abs(rel) > 6) {
            this.shake = Math.min(1, this.shake + 0.3);
            this.sfx.thud();
            this.rumble(0.6, 250);
          }
        }
      }
    }
  }

  private updateStandings() {
    const sorted = [...this.vehicles].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });
    sorted.forEach((v, i) => (v.position = i + 1));
    const leader = sorted[0];
    this.telemetry.standings = sorted.map((v) => {
      let hex = "ffffff";
      try {
        const matColor = v.rig?.bodyMat?.color;
        if (matColor && typeof matColor.getHexString === "function") {
          hex = matColor.getHexString();
        }
      } catch { /* fallback */ }
      return {
        name: v.name,
        isPlayer: v.isPlayer,
        lap: Math.max(1, Math.min(this.totalLaps, Math.floor(v.totalProgress) + 1)),
        color: "#" + hex,
        gap: (leader.totalProgress - v.totalProgress) * this.path.length,
        finished: v.finished,
        time: v.finishTime,
        best: v.bestLap,
      };
    });
  }

  /* ------------------------------------------------------------ */
  private updateCamera(dt: number, snap: boolean) {
    const p = this.player;
    if (!p) return;
    const t = Math.min(1, dt * 6);

    if (this.state === "preview") {
      // cutscene cameras are always 3rd person — hide interior
      if (p.rig.interior) p.rig.interior.visible = false;
      // `st` drives the motion inside a shot, so every angle is a moving
      // camera rather than a frozen frame.
      const st = this.previewShotTime;
      const sd = this.previewSeed;
      const dir = this.previewDir;
      // Each shot owns a fixed focal length. It is applied instantly on the
      // cut and never animated, so a cut is a pure cut — no zoom in/out.
      let fov = 52;

      if (this.previewMode === "garage" && p) {
        const cp = p.pos;
        const cy = p.yaw;
        const fwX = Math.sin(cy), fwZ = Math.cos(cy);
        const rgX = Math.cos(cy), rgZ = -Math.sin(cy);
        // scale distances to the car's actual body so wide/narrow cars fit
        // Every distance is expressed in units of the car's own size, so a
        // wide prototype and a narrow rally car are framed identically.
        const rig = p.rig;
        const W = rig.flareW;        // widest half-width
        const L = rig.length;        // nose to tail
        const H = rig.height;        // roof height
        const frame = Math.max(L, W * 2.8, H * 3.2);
        const eye = cp.y + H * 0.55; // aim at the beltline

        switch (this.previewPhase) {
          case 0: {
            // STATIC HERO — slow arc across the front three-quarter.
            const orb = 0.7 + st * 0.10 * dir;
            const r = frame * 1.18;
            this.camPos.set(
              cp.x + fwX * Math.cos(orb) * r + rgX * Math.sin(orb) * r,
              cp.y + H * 0.62,
              cp.z + fwZ * Math.cos(orb) * r + rgZ * Math.sin(orb) * r,
            );
            this.camLook.set(cp.x, eye, cp.z);
            fov = 42;
            break;
          }
          case 1: {
            // ROLLING SHOWCASE — locked-off camera, the car drives past it.
            // Anchored to the world (not the car) so the motion really reads.
            const a = this.garageAnchor;
            const ax = Math.sin(this.previewSeed), az = Math.cos(this.previewSeed);
            this.camPos.set(a.x + ax * frame * 1.35, a.y + H * 0.55, a.z + az * frame * 1.35);
            this.camLook.set(cp.x, cp.y + H * 0.5, cp.z);
            fov = 42;
            break;
          }
          case 2: {
            // DRIFT — high, far chase looking down on the slide.
            const rear = frame * 1.65;
            const side = frame * 1.15 * dir;
            this.camPos.set(
              cp.x - fwX * rear + rgX * side,
              cp.y + H * 2.1,
              cp.z - fwZ * rear + rgZ * side,
            );
            this.camLook.set(cp.x + fwX * L * 0.22, eye, cp.z + fwZ * L * 0.22);
            fov = 48;
            break;
          }
          default: {
            // SLOW REVEAL — tight low orbit showing the wheels and flanks.
            const orb = sd + st * 0.16 * dir;
            const r = frame * 1.0;
            this.camPos.set(
              cp.x + Math.cos(orb) * r,
              cp.y + H * 0.34,
              cp.z + Math.sin(orb) * r,
            );
            this.camLook.set(cp.x, cp.y + H * 0.42, cp.z);
            fov = 40;
            break;
          }
        }
      } else {
        // ---- track cinematics: the focus travels along the spline ----
        const at = (prog: number) => {
          const u = prog - Math.floor(prog);
          this.path.curve.getPointAt(u, this.pvPoint);
          this.path.curve.getTangentAt(u, this.pvTangent);
          return this.pvPoint;
        };
        const base = (sd * 0.013) % 1;

        switch (this.previewPhase) {
          case 0: {
            const f = at(base + st * 0.0016 * dir);
            const ang = sd + st * 0.14 * dir;
            const r = 56;
            this.camPos.set(f.x + Math.cos(ang) * r, f.y + 19, f.z + Math.sin(ang) * r);
            this.camLook.copy(f);
            break;
          }
          case 1: {
            const f = at(base + st * 0.0075);
            const tx = this.pvTangent.x, tz = this.pvTangent.z;
            this.camPos.set(f.x - tx * 16, f.y + 3.4, f.z - tz * 16);
            this.camLook.set(f.x + tx * 10, f.y + 1.9, f.z + tz * 10);
            break;
          }
          case 2: {
            const anchor = at(base).clone();
            const ax = this.pvTangent.x, az = this.pvTangent.z;
            const nx = -az, nz = ax;
            const off = (this.path.halfWidth + 15) * dir;
            this.camPos.set(anchor.x + nx * off, anchor.y + 2.4, anchor.z + nz * off);
            const f = at(base - 0.006 + st * 0.0042);
            this.camLook.set(f.x, f.y + 1.0, f.z);
            break;
          }
          case 3: {
            const f = at(base + st * 0.006);
            const tx = this.pvTangent.x, tz = this.pvTangent.z;
            this.camPos.set(f.x + tx * 9, f.y + 0.95, f.z + tz * 9);
            this.camLook.set(f.x - tx * 5, f.y + 1.25, f.z - tz * 5);
            break;
          }
          case 4: {
            const f = at(base + st * 0.0022);
            const h = 74 - st * 3.4;
            this.camPos.set(f.x + Math.cos(sd) * (10 + st * 1.1), f.y + h, f.z + Math.sin(sd) * (10 + st * 1.1));
            this.camLook.set(f.x, f.y, f.z);
            break;
          }
          default: {
            const f = at(base + st * 0.0035);
            const ang = sd + st * 0.36 * dir;
            const r = 21;
            this.camPos.set(f.x + Math.cos(ang) * r, f.y + 6.5, f.z + Math.sin(ang) * r);
            this.camLook.copy(f);
            break;
          }
        }
      }

      // A cut is instantaneous in position AND focal length. Between cuts the
      // analytic path is already smooth, so the camera follows it exactly —
      // no easing means no lag, no drift, no wobble.
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      if (this.camera.fov !== fov) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }

      // feed the shadow/sky rig a smoothed focus — always lerp, even on cuts,
      // so the sun/shadow rig and fog never pop when the camera hard-cuts
      this.previewFocus.lerp(this.camLook, Math.min(1, dt * (snap ? 4.5 : 2.2)));
      return;
    }

    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const spd = Math.abs(p.speed);

    if (this.state === "countdown") {
      const k = THREE.MathUtils.clamp(this.countdown / 3, 0, 1);
      const a = p.yaw + Math.PI + k * 2.4;
      const r = 9 + k * 6;
      this.camPos.set(p.pos.x + Math.sin(a) * r, p.pos.y + 3.2 + k * 1.6, p.pos.z + Math.cos(a) * r);
      this.camLook.set(p.pos.x, p.pos.y + 1.1, p.pos.z);
      this.camera.position.lerp(this.camPos, snap ? 1 : Math.min(1, dt * 5));
      this.camera.lookAt(this.camLook);
      return;
    }

    // hide interior for third-person views, show for cockpit
    if (this.cameraMode !== 1) p.rig.interior.visible = false;

    const looking = this.padLook || this.held("look");
    if (looking) {
      // look behind: swing the camera round to the nose of the car
      const dist = 9.5 + spd * 0.02;
      this.camPos.set(p.pos.x + fx * dist, p.pos.y + 3.1, p.pos.z + fz * dist);
      this.camera.position.lerp(this.camPos, snap ? 1 : Math.min(1, dt * 10));
      this.camLook.set(p.pos.x - fx * 6, p.pos.y + 1.4, p.pos.z - fz * 6);
    } else if (this.cameraMode === 1) {
      // cockpit cam — sits at the driver's eye inside the cabin
      const eye = p.rig.eyePos;
      this.camPos.set(
        p.pos.x + fx * eye.z + Math.cos(p.yaw) * eye.x,
        p.pos.y + eye.y,
        p.pos.z + fz * eye.z - Math.sin(p.yaw) * eye.x,
      );
      this.camLook.set(p.pos.x + fx * 20, p.pos.y + eye.y - 0.08, p.pos.z + fz * 20);
      this.camera.position.copy(this.camPos);
      // show interior in cockpit mode
      p.rig.interior.visible = true;
    } else {
      p.rig.interior.visible = false;
      // tight chase cam — much closer, more connected to the car
      const dist = (this.cameraMode === 2 ? 6.0 : 3.2) + spd * 0.012;
      const height = (this.cameraMode === 2 ? 2.6 : 1.35) + spd * 0.004;
      // trail behind the velocity direction slightly for a drifty feel
      const driftLead = THREE.MathUtils.clamp(-p.slip * 0.045, -0.35, 0.35);
      const camYaw = p.yaw + driftLead;
      this.camPos.set(
        p.pos.x - Math.sin(camYaw) * dist,
        p.pos.y + height,
        p.pos.z - Math.cos(camYaw) * dist,
      );
      const groundY = this.path.terrainHeight(this.camPos.x, this.camPos.z) + 1.6;
      if (this.camPos.y < groundY) this.camPos.y = groundY;
      this.camera.position.lerp(this.camPos, snap ? 1 : t);
      this.camLook.set(p.pos.x + fx * 2.4, p.pos.y + 0.85, p.pos.z + fz * 2.4);
    }

    if (this.shake > 0.001) {
      const s = this.shake * this.settings.controls.cameraShake;
      this.camera.position.x += (Math.random() - 0.5) * s * 0.9;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.7;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.9;
      this.shake *= Math.pow(0.02, dt);
    }
    this.camera.lookAt(this.camLook);
    const targetFov = 59 + Math.min(11, spd * 0.07) + (p.boostTime > 0 ? 3 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------ */
  private updateTelemetry() {
    const t = this.telemetry;
    const p = this.player;
    t.state = this.state;
    if (!p) return;
    // realistic conversion: internal units ~ m/s * ~1.1, map to km/h with ~1.95 factor
    const kmh = Math.abs(p.speed) * 1.95;
    t.speed = this.settings.gameplay.units === "mph" ? kmh * 0.6214 : kmh;
    const topKmh = p.def.topSpeed * 1.95 + 20;
    t.speedMax = this.settings.gameplay.units === "mph" ? topKmh * 0.6214 : topKmh;
    t.units = this.settings.gameplay.units === "mph" ? "MPH" : "KM/H";
    const gearCount = 6;
    const ratio = Math.min(0.999, Math.abs(p.speed) / (p.def.topSpeed * 1.02));
    const g = Math.floor(ratio * gearCount);
    t.gear = p.speed < -0.6 ? 0 : g + 1;
    t.rpm = 0.18 + (ratio * gearCount - g) * 0.8;
    if (p.controls.throttle > 0 && Math.abs(p.speed) < 1) t.rpm = 0.5 + Math.sin(performance.now() * 0.02) * 0.1;
    t.lap = Math.max(1, Math.min(this.totalLaps, Math.floor(p.totalProgress) + 1));
    t.totalLaps = this.totalLaps;
    t.position = p.position;
    t.totalCars = this.vehicles.length;
    t.raceTime = this.raceTime;
    t.lapTime = this.state === "racing" ? Math.max(0, this.raceTime - p.lapStart) : 0;
    t.bestLap = p.bestLap;
    t.lastLap = p.lapTimes.length ? p.lapTimes[p.lapTimes.length - 1] : 0;
    t.countdown =
      this.state === "countdown"
        ? Math.max(1, Math.ceil(this.countdown))
        : this.goTimer > 0
          ? 0
          : -1;
    t.drift = Math.min(1, Math.abs(p.slip) / 18);
    t.driftScore = this.driftScore;
    t.boost = this.boostFuel;
    t.boosting = p.boostTime > 0;
    t.offTrack = p.offTrack;

    // wrong way detection
    const s = this.path.sampleAt(p.hintIndex >= 0 ? p.hintIndex : 0);
    const dot = Math.sin(p.yaw) * s.tx + Math.cos(p.yaw) * s.tz;
    t.wrongWay = dot < -0.35 && Math.abs(p.speed) > 6 && this.state === "racing";

    t.cars = this.vehicles.map((v) => {
      const m = this.mapCoord(v.pos.x, v.pos.z);
      return {
        x: m.x,
        z: m.y,
        isPlayer: v.isPlayer,
        color: "#" + v.rig.bodyMat.color.getHexString(),
        angle: v.yaw,
      };
    });

    if (this.state === "finished" && this.raceTime - this.lastFinishCheck > 0.4) {
      this.lastFinishCheck = this.raceTime;
      this.updateStandings();
    }
  }

  private updateAudio(dt: number) {
    const p = this.player;
    if (!p || !this.sfx.ready) return;
    const spec = p.def.engine;
    this.sfx.setEngineSpec(spec, p.def.id);

    if (this.muted || this.paused || this.state === "preview") {
      this.sfx.silence();
      return;
    }

    // convert the gear-relative telemetry RPM into a real crank speed
    const rpm = spec.idleRpm + this.telemetry.rpm * (spec.redlineRpm - spec.idleRpm);
    const load = Math.max(p.controls.throttle, this.state === "countdown" ? 0.15 : 0);
    this.sfx.updateEngine(rpm, load, dt, true);

    // ignition cut on gear change
    if (this.telemetry.gear !== this.prevGear) {
      if (this.telemetry.gear > this.prevGear && this.prevGear > 0) this.sfx.shiftPop();
      this.prevGear = this.telemetry.gear;
    }

    const speedNorm = Math.min(1, Math.abs(p.speed) / p.def.topSpeed);
    const slip = p.sliding && !p.offTrack ? Math.min(1, Math.abs(p.slip) / 16) : 0;
    const rough = p.offTrack ? 1 : 0;
    this.sfx.setTyres(slip, rough, speedNorm);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.sfx.setMuted(m);
  }

  uiClick() { this.sfx.uiClick(); }
  uiHover() { this.sfx.uiHover(); }
  uiWhoosh(dir: number) { this.sfx.uiWhoosh(dir); }

  /* ------------------------------------------------------------ */
  private disposeWorld() {
    if (!this.world) return;
    this.world.dispose();
    for (const v of this.vehicles) {
      v.rig.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      this.scene.remove(v.rig.group);
    }
    (this.particles?.material as THREE.Material)?.dispose();
    this.particles?.geometry.dispose();
    // preserve garage — scene.clear() would delete it and it would never
    // reappear after a race until the next garage open
    const savedGarage = this.garageGroup;
    if (savedGarage) this.scene.remove(savedGarage);
    this.scene.clear();
    if (savedGarage) this.scene.add(savedGarage);
    this.vehicles = [];
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.disposeWorld();
    this.post.dispose();
    this.sfx.dispose();
    this.renderer.dispose();
  }
}
