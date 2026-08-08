/** Physical description of the engine used to synthesise its sound. */
export interface EngineSpec {
  /** layout label shown in the garage */
  layout: string;
  cylinders: number;
  idleRpm: number;
  redlineRpm: number;
  /** exhaust resonance fundamental in Hz — the "voice" of the engine */
  resonance: number;
  /** 0..1 how much high-order combustion crackle the exhaust has */
  harshness: number;
  /** crossplane lope: uneven firing intervals (V8 burble) */
  lope: number;
  /** turbo whistle / blow-off amount */
  turbo: number;
  /** straight-cut gear / supercharger whine */
  whine: number;
  /** overall body/size — bigger engines get more low end */
  bass: number;
}

export interface CarDef {
  id: string;
  name: string;
  klass: string;
  /** max forward speed in units/sec */
  topSpeed: number;
  accel: number;
  brake: number;
  /** steering rate rad/sec at low speed */
  handling: number;
  /** lateral grip 0..1 (higher = less slide) */
  grip: number;
  /** how easily it drifts when handbraking */
  drift: number;
  mass: number;
  color: number;
  accentColor: number;
  /** paint job description */
  blurb: string;
  style: "gt" | "muscle" | "rally" | "proto";
  engine: EngineSpec;
  /**
   * Optional path to a .glb model. When the file is present it replaces the
   * procedural low-poly body; otherwise the game falls back automatically.
   */
  modelUrl?: string;
}

export const CARS: CarDef[] = [
  {
    id: "mustang",
    name: "Ford Mustang",
    klass: "Muscle",
    topSpeed: 124,
    accel: 38,
    brake: 86,
    handling: 2.55,
    grip: 0.94,
    drift: 0.38,
    mass: 1.24,
    color: 0xc8102e,
    accentColor: 0xf2f2f2,
    blurb: "Classic American V8 muscle. Heavy, planted, with a roaring torque curve.",
    style: "muscle",
    modelUrl: "https://raw.githubusercontent.com/Arthurowgg/CarGameTest/refs/heads/main/low_poly_ford_mustang.glb",
    engine: {
      layout: "5.0L V8",
      cylinders: 8,
      idleRpm: 750,
      redlineRpm: 7500,
      resonance: 78,
      harshness: 0.58,
      lope: 0.30,
      turbo: 0,
      whine: 0.22,
      bass: 0.95,
    },
  },
  {
    id: "lambo",
    name: "Lambo",
    klass: "Hyper",
    topSpeed: 158,
    accel: 52,
    brake: 92,
    handling: 2.85,
    grip: 0.96,
    drift: 0.28,
    mass: 1.08,
    color: 0xffc800,
    accentColor: 0x1a1a1a,
    blurb: "V12 hypercar. Brutal acceleration but needs precise inputs at the limit.",
    style: "proto",
    modelUrl: "https://raw.githubusercontent.com/Arthurowgg/CarGameTest/refs/heads/main/Lambo.glb",
    engine: {
      layout: "6.5L V12",
      cylinders: 12,
      idleRpm: 1100,
      redlineRpm: 9500,
      resonance: 185,
      harshness: 0.28,
      lope: 0,
      turbo: 0,
      whine: 0.55,
      bass: 0.40,
    },
  },
];

export const AI_NAMES = [
  "K. Rivera",
  "M. Sato",
  "D. Novak",
  "L. Okafor",
  "V. Ferrand",
  "A. Lindqvist",
  "R. Castillo",
];

export const AI_COLORS = [0xffd23f, 0x00e5ff, 0xff5fa2, 0x8bff4d, 0xff8a3d, 0x9d7bff, 0xffffff];

export function carById(id: string): CarDef {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}
