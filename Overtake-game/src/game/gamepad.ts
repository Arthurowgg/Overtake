/**
 * Lightweight Gamepad API wrapper.
 *
 * - Polls the first connected gamepad every frame.
 * - Exposes analog axes with a proper deadzone, button states, edge-triggered
 *   presses and rumble (vibration actuator where supported).
 * - Standard mapping: axes 0/1 = left stick, 2/3 = right stick,
 *   buttons 0/1/2/3 = A/B/X/Y, 4/5 = LB/RB, 6/7 = LT/RT, 8/9 = back/start,
 *   10/11 = LS/RS click, 12-15 = d-pad.
 */

export const PAD = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9,
  LS: 10, RS: 11,
  DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15,
  AX_LX: 0, AX_LY: 1, AX_RX: 2, AX_RY: 3,
} as const;

export class GamepadManager {
  connected = false;
  index = -1;
  id = "";
  onConnect: ((id: string) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  private deadzone: number;
  private prev = new Map<number, Uint8Array>();
  private lastRumble = 0;

  constructor(deadzone = 0.16) {
    this.deadzone = deadzone;
  }

  setDeadzone(dz: number) {
    this.deadzone = Math.max(0.01, Math.min(0.5, dz));
  }

  /** Detect connection changes. Call once per frame. */
  poll(): void {
    if (typeof navigator === "undefined" || !navigator.getGamepads) {
      if (this.connected) {
        this.connected = false;
        this.index = -1;
        this.id = "";
        this.onDisconnect?.();
      }
      return;
    }
    let found = -1;
    let foundId = "";
    try {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (p && p.connected) {
          found = i;
          foundId = p.id || "controller";
          break;
        }
      }
    } catch {
      /* ignore */
    }
    if (found >= 0) {
      if (!this.connected || this.index !== found) {
        this.connected = true;
        this.index = found;
        this.id = foundId;
        this.onConnect?.(this.id);
      }
    } else if (this.connected) {
      this.connected = false;
      this.index = -1;
      this.id = "";
      this.onDisconnect?.();
    }
  }

  private pad(): Gamepad | null {
    if (this.index < 0 || typeof navigator === "undefined") return null;
    try {
      const p = navigator.getGamepads?.()[this.index];
      return p && p.connected ? p : null;
    } catch {
      return null;
    }
  }

  /** Analog axis in -1..1 with deadzone applied and re-normalised. */
  axis(n: number): number {
    const p = this.pad();
    if (!p || n >= p.axes.length) return 0;
    const raw = p.axes[n];
    if (Number.isNaN(raw) || Math.abs(raw) < this.deadzone) return 0;
    const sign = raw > 0 ? 1 : -1;
    const mag = (Math.abs(raw) - this.deadzone) / (1 - this.deadzone);
    return sign * Math.min(1, mag);
  }

  /** True while the button is held. */
  button(b: number): boolean {
    const p = this.pad();
    if (!p || b >= p.buttons.length) return false;
    return p.buttons[b].pressed;
  }

  /** Analog trigger value 0..1 (LT/RT are analog buttons). */
  value(b: number): number {
    const p = this.pad();
    if (!p || b >= p.buttons.length) return 0;
    const v = p.buttons[b].value ?? (p.buttons[b].pressed ? 1 : 0);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : p.buttons[b].pressed ? 1 : 0;
  }

  /** True only on the frame the button goes from released to pressed. */
  justPressed(b: number): boolean {
    const p = this.pad();
    if (!p || b >= p.buttons.length) return false;
    const prev = this.prev.get(this.index);
    const cur = p.buttons[b].pressed;
    return cur && (!prev || !prev[b]);
  }

  /** Call at the end of the frame to record button snapshots. */
  snapshot(): void {
    const p = this.pad();
    if (!p) return;
    const arr = new Uint8Array(p.buttons.length);
    for (let i = 0; i < p.buttons.length; i++) arr[i] = p.buttons[i].pressed ? 1 : 0;
    this.prev.set(this.index, arr);
  }

  /** Rumble — throttled so effects don't spam the actuator. */
  rumble(durationMs: number, strength: number): void {
    const now = performance.now();
    if (now - this.lastRumble < 120) return;
    this.lastRumble = now;
    const p = this.pad();
    if (!p) return;
    const any = p as unknown as {
      vibrationActuator?: { playEffect?: (t: string, o: Record<string, unknown>) => Promise<void> };
      hapticActuators?: { pulse?: (s: number, d: number) => Promise<void> }[];
    };
    const act = any.vibrationActuator ?? any.hapticActuators?.[0];
    if (!act) return;
    try {
      if ("playEffect" in act && act.playEffect) {
        void act.playEffect("dual-rumble", {
          duration: durationMs,
          strongMagnitude: Math.min(1, strength),
          weakMagnitude: Math.min(1, strength * 0.5),
        });
      } else if ("pulse" in act && act.pulse) {
        void act.pulse(Math.min(1, strength), durationMs);
      }
    } catch {
      /* ignore */
    }
  }

  /** Stable-ish name for the UI, e.g. "Xbox Wireless Controller". */
  friendlyName(): string {
    const raw = this.id.toLowerCase();
    if (raw.includes("xbox")) return "Xbox Controller";
    if (raw.includes("dualshock") || raw.includes("dual sense") || raw.includes("playstation")) return "PlayStation Controller";
    if (raw.includes("switch")) return "Switch Pro Controller";
    if (raw.includes("8bitdo")) return "8BitDo Controller";
    if (raw.includes("dualsense")) return "DualSense";
    return this.id ? "Controller" : "Controller";
  }
}
