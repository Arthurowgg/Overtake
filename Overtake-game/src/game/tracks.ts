export type PropKind = "pine" | "palm" | "rock" | "cactus" | "block" | "arch" | "crystal";

export interface TrackTheme {
  skyTop: number;
  skyHorizon: number;
  skyGround: number;
  sunColor: number;
  sunGlow: number;
  sunDir: [number, number, number];
  fogColor: number;
  fogDensity: number;
  ambient: number;
  ambientIntensity: number;
  hemiGround: number;
  groundColors: number[];
  roadColor: number;
  curbA: number;
  curbB: number;
  wallColor: number;
  props: { kind: PropKind; density: number; colors: number[]; scale: [number, number] }[];
  bloom: number;
  godRays: number;
  cloudColor: number;
  cloudCount: number;
  snow?: boolean;
  waterColor?: number;
}

export interface TrackDef {
  id: string;
  name: string;
  location: string;
  difficulty: 1 | 2 | 3 | 4;
  laps: number;
  base: number;
  radii: number[];
  elev: number[];
  aspect: [number, number];
  rotation: number;
  width: number;
  terrain?: { amp: number; scale: number };
  theme: TrackTheme;
  blurb: string;
  accent: string;
}

const PALM_COLORS = [0x2f9e5f, 0x38b06b, 0x27884f];
const SNOW_PINE = [0x2a5a3a, 0x3a6a4a, 0x1f4430];

export const TRACKS: TrackDef[] = [
  {
    id: "sunset-bay",
    name: "Sunset Bay",
    location: "Costa Dorada",
    difficulty: 1,
    laps: 3,
    base: 300,
    radii: [1.0, 1.12, 1.22, 1.05, 0.82, 0.9, 1.14, 1.26, 1.1, 0.88, 0.78, 0.92, 1.06, 1.02],
    elev: [0, 3, 8, 12, 9, 2, -3, -6, -4, 0, 5, 7, 4, 1],
    aspect: [1.3, 0.86],
    rotation: 0.2,
    width: 26,
    terrain: { amp: 18, scale: 0.0035 },
    blurb: "Wide sweeping curves along a golden coastline. Perfect for your first laps.",
    accent: "#ff8a3d",
    theme: {
      skyTop: 0x2b3f8f,
      skyHorizon: 0xffb266,
      skyGround: 0x3a2b4a,
      sunColor: 0xffd9a0,
      sunGlow: 0xff9d4d,
      sunDir: [-0.55, 0.16, -1],
      fogColor: 0xffb98a,
      fogDensity: 0.00085,
      ambient: 0xffd7c2,
      ambientIntensity: 0.55,
      hemiGround: 0x6b4b3a,
      groundColors: [0xd8b477, 0xc9a469, 0x8fae5e, 0x7ba055],
      roadColor: 0x3b3b45,
      curbA: 0xff5a4d,
      curbB: 0xf4f4f4,
      wallColor: 0xf0efe6,
      bloom: 0.75,
      godRays: 0.75,
      cloudColor: 0xffc9a0,
      cloudCount: 18,
      waterColor: 0x1b6fa6,
      props: [
        { kind: "palm", density: 0.9, colors: PALM_COLORS, scale: [1.0, 1.6] },
        { kind: "rock", density: 0.25, colors: [0xc2a883, 0xab9070], scale: [0.9, 1.8] },
      ],
    },
  },
  {
    id: "frost-peak",
    name: "Frost Peak",
    location: "Alps - 2,420m",
    difficulty: 3,
    laps: 3,
    base: 310,
    radii: [1.0, 1.06, 0.88, 0.82, 0.96, 1.18, 1.22, 1.08, 0.86, 0.80, 0.94, 1.10, 1.14, 1.02],
    elev: [18, 22, 28, 32, 28, 20, 12, 6, 8, 14, 22, 30, 26, 20],
    aspect: [1.05, 0.98],
    rotation: -0.25,
    width: 24,
    terrain: { amp: 28, scale: 0.0026 },
    blurb: "A high-altitude alpine circuit carved through snowfields and frozen pine forests.",
    accent: "#7ec8ff",
    theme: {
      skyTop: 0x1a3a60,
      skyHorizon: 0xc4ddff,
      skyGround: 0xa8c0d8,
      sunColor: 0xfffaf0,
      sunGlow: 0xd8e8ff,
      sunDir: [0.62, 0.52, -0.58],
      fogColor: 0xd4e6f4,
      fogDensity: 0.00072,
      ambient: 0xe8f0ff,
      ambientIntensity: 0.62,
      hemiGround: 0x9fb8cc,
      groundColors: [0xf5f8fb, 0xe6ecf2, 0xd2dbe6, 0xb8c6d6, 0xa8b8c8],
      roadColor: 0x32363d,
      curbA: 0x4da3ff,
      curbB: 0xffffff,
      wallColor: 0xe8eef5,
      bloom: 0.55,
      godRays: 0.65,
      cloudColor: 0xffffff,
      cloudCount: 22,
      snow: true,
      props: [
        { kind: "pine", density: 1.15, colors: SNOW_PINE, scale: [1.0, 1.9] },
        { kind: "rock", density: 0.45, colors: [0xaeb8c4, 0x9aa5b2, 0xc2cdd8], scale: [1.0, 2.4] },
      ],
    },
  },
];

export function trackById(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
