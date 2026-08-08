import type { Language } from "./i18n";

export type AAMode = "off" | "fxaa" | "msaa2" | "msaa4" | "msaa8";
export type ShadowMode = "off" | "low" | "medium" | "high";
export type RayMode = "off" | "low" | "high";
export type QualityPreset = "low" | "medium" | "high" | "ultra" | "custom";

export type Action =
  | "up"
  | "down"
  | "left"
  | "right"
  | "hand"
  | "boost"
  | "camera"
  | "reset"
  | "look";

export const ACTION_LABELS: Record<Action, string> = {
  up: "Accelerate",
  down: "Brake / Reverse",
  left: "Steer Left",
  right: "Steer Right",
  hand: "Handbrake / Drift",
  boost: "Nitro",
  camera: "Change Camera",
  reset: "Respawn",
  look: "Look Behind",
};

export interface GraphicsSettings {
  qualityPreset: QualityPreset;
  resolutionScale: number;
  antialiasing: AAMode;
  shadows: ShadowMode;
  godRays: RayMode;
  particles: number;
  drawDistance: number;
}

export interface VideoSettings {
  bloom: number;
  motionBlur: number;
  chromatic: number;
  vignette: number;
  exposure: number;
  showFps: boolean;
}

export interface AudioSettings {
  master: number;
  music: number;
  engine: number;
  sfx: number;
  musicEnabled: boolean;
  shuffle: boolean;
}

export interface ControlSettings {
  bindings: Record<Action, string>;
  secondary: Record<Action, string>;
  steerSpeed: number;
  steerSensitivity: number;
  countersteerAssist: number;
  autoAccelerate: boolean;
  defaultCamera: number;
  cameraShake: number;
  padDeadzone: number;
  padSensitivity: number;
  padVibration: boolean;
}

export interface GameplaySettings {
  language: Language;
  units: "kmh" | "mph";
  hudMinimap: boolean;
  hudStandings: boolean;
  hudSpeedo: boolean;
  hudTimers: boolean;
}

export interface Settings {
  graphics: GraphicsSettings;
  video: VideoSettings;
  audio: AudioSettings;
  controls: ControlSettings;
  gameplay: GameplaySettings;
}

export const DEFAULT_BINDINGS: Record<Action, string> = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  hand: "Space",
  boost: "ShiftLeft",
  camera: "KeyC",
  reset: "KeyR",
  look: "KeyQ",
};

export const DEFAULT_SECONDARY: Record<Action, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  hand: "",
  boost: "ShiftRight",
  camera: "",
  reset: "",
  look: "",
};

export const QUALITY_PRESETS: Record<Exclude<QualityPreset, "custom">, Partial<GraphicsSettings>> = {
  low: {
    resolutionScale: 0.75,
    antialiasing: "off",
    shadows: "off",
    godRays: "off",
    particles: 0.5,
    drawDistance: 0.7,
  },
  medium: {
    resolutionScale: 1.0,
    antialiasing: "fxaa",
    shadows: "low",
    godRays: "low",
    particles: 0.8,
    drawDistance: 0.9,
  },
  high: {
    resolutionScale: 1.2,
    antialiasing: "msaa4",
    shadows: "medium",
    godRays: "high",
    particles: 1.0,
    drawDistance: 1.0,
  },
  ultra: {
    resolutionScale: 1.6,
    antialiasing: "msaa8",
    shadows: "high",
    godRays: "high",
    particles: 1.2,
    drawDistance: 1.25,
  },
};

export function defaultSettings(): Settings {
  return {
    graphics: {
      qualityPreset: "high",
      resolutionScale: 1.0,
      antialiasing: "msaa4",
      shadows: "medium",
      godRays: "high",
      particles: 1.0,
      drawDistance: 1.0,
    },
    video: {
      bloom: 0.55,
      motionBlur: 0.35,
      chromatic: 0.15,
      vignette: 0.22,
      exposure: 1.08,
      showFps: false,
    },
    audio: {
      master: 0.85,
      music: 0.5,
      engine: 0.8,
      sfx: 0.85,
      musicEnabled: true,
      shuffle: true,
    },
    controls: {
      bindings: { ...DEFAULT_BINDINGS },
      secondary: { ...DEFAULT_SECONDARY },
      steerSpeed: 1,
      steerSensitivity: 1,
      countersteerAssist: 0.35,
      autoAccelerate: false,
      defaultCamera: 0,
      cameraShake: 1,
      padDeadzone: 0.16,
      padSensitivity: 1,
      padVibration: true,
    },
    gameplay: {
      language: "en",
      units: "kmh",
      hudMinimap: true,
      hudStandings: true,
      hudSpeedo: true,
      hudTimers: true,
    },
  };
}

export function applyQualityPreset(s: Settings, preset: Exclude<QualityPreset, "custom">): Settings {
  return {
    ...s,
    graphics: {
      ...s.graphics,
      ...QUALITY_PRESETS[preset],
      qualityPreset: preset,
    },
  };
}

const KEY = "overtake.settings.v4";

function deepMerge<T>(base: T, patch: unknown): T {
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return patch === undefined ? base : (patch as T);
  }
  if (typeof patch !== "object" || patch === null) return base;
  const out = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(out)) {
    if (k in (patch as Record<string, unknown>)) {
      out[k] = deepMerge(out[k], (patch as Record<string, unknown>)[k]);
    }
  }
  return out as T;
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    return deepMerge(base, JSON.parse(raw));
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function keyLabel(code: string): string {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) {
    const d = code.slice(5);
    return { Up: "↑", Down: "↓", Left: "←", Right: "→" }[d] ?? d;
  }
  const map: Record<string, string> = {
    Space: "SPACE",
    ShiftLeft: "L-SHIFT",
    ShiftRight: "R-SHIFT",
    ControlLeft: "L-CTRL",
    ControlRight: "R-CTRL",
    AltLeft: "L-ALT",
    AltRight: "R-ALT",
    Enter: "ENTER",
    Tab: "TAB",
    Backspace: "BKSP",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Minus: "-",
    Equal: "=",
  };
  return map[code] ?? code.toUpperCase();
}

export const AA_LABELS: Record<AAMode, string> = {
  off: "OFF",
  fxaa: "FXAA",
  msaa2: "MSAA 2×",
  msaa4: "MSAA 4×",
  msaa8: "MSAA 8×",
};

export function msaaSamples(mode: AAMode): number {
  switch (mode) {
    case "msaa2":
      return 2;
    case "msaa4":
      return 4;
    case "msaa8":
      return 8;
    default:
      return 0;
  }
}

export function shadowMapSize(mode: ShadowMode): number {
  switch (mode) {
    case "low":
      return 1024;
    case "medium":
      return 2048;
    case "high":
      return 4096;
    default:
      return 0;
  }
}

export function raySamples(mode: RayMode): number {
  return mode === "high" ? 48 : mode === "low" ? 20 : 0;
}
