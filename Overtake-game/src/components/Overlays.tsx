import type { RaceResult } from "../game/Engine";
import { trackById } from "../game/tracks";
import { carById } from "../game/cars";
import { fmtTime } from "./Hud";
import { NavSurface, NavButton } from "../hooks/GamepadNav";
import { t, type Language } from "../game/i18n";

/**
 * Full-screen boot loader shown once, while the game preloads models and warms
 * up the first scene. It reports exactly what it is loading and how far along
 * it is. Nothing heavy is created here — it just renders text and a bar.
 */
export function BootLoader({
  status,
  progress,
  accent,
}: {
  status: string;
  progress: number;
  accent: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[#05070d]">
      {/* subtle vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.7)_100%)]" />

      <div className="relative flex flex-col items-center px-6">
        <h1 className="text-5xl font-black italic tracking-tighter text-white md:text-7xl">
          OVER<span style={{ color: accent }}>TAKE</span>
        </h1>
        <p className="mt-1 text-[10px] font-bold tracking-[0.5em] text-white/40">
          LOW-POLY RACING
        </p>

        <div className="mt-10 h-1.5 w-72 max-w-[80vw] overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, background: accent }}
          />
        </div>

        <div className="mt-3 flex w-72 max-w-[80vw] items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wide text-white/55">
            {status}
          </span>
          <span className="text-[11px] font-bold tabular-nums text-white/40">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

export function Pause({
  accent,
  onResume,
  onRestart,
  onQuit,
  onSettings,
  lang,
  onClick,
  onHover,
}: {
  accent: string;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onSettings: () => void;
  lang: Language;
  onClick?: () => void;
  onHover?: () => void;
}) {
  return (
    <NavSurface onBack={onResume}>
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-md">
        <div className="w-[340px] rounded-2xl border border-white/15 bg-[#0b0f18]/90 p-6 text-white shadow-2xl">
          <div className="mb-1 text-[10px] font-black tracking-[0.4em] text-white/40">{t(lang, "race")}</div>
          <h2 className="mb-5 text-3xl font-black italic tracking-tight">{t(lang, "paused")}</h2>
          <div className="flex flex-col gap-2">
            <NavButton
              id="pause-resume"
              onClick={() => { onClick?.(); onResume(); }}
              onMouseEnter={onHover}
              className="rounded-lg py-3 text-sm font-black italic tracking-wide text-black transition hover:brightness-110"
              style={{ background: accent }}
            >
              {t(lang, "resume")}
            </NavButton>
            <NavButton
              id="pause-restart"
              onClick={() => { onClick?.(); onRestart(); }}
              onMouseEnter={onHover}
              className="rounded-lg border border-white/15 bg-white/5 py-3 text-sm font-black italic tracking-wide transition hover:bg-white/15"
            >
              {t(lang, "restart")}
            </NavButton>
            <NavButton
              id="pause-settings"
              onClick={() => { onClick?.(); onSettings(); }}
              onMouseEnter={onHover}
              className="rounded-lg border border-white/15 bg-white/5 py-3 text-sm font-black italic tracking-wide transition hover:bg-white/15"
            >
              {t(lang, "settings")}
            </NavButton>
            <NavButton
              id="pause-quit"
              onClick={() => { onClick?.(); onQuit(); }}
              onMouseEnter={onHover}
              className="rounded-lg border border-white/10 py-3 text-sm font-black italic tracking-wide text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              {t(lang, "quit")}
            </NavButton>
          </div>
        </div>
      </div>
    </NavSurface>
  );
}

const ORDINAL = ["", "1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH"];

export function Results({
  result,
  accent,
  onRetry,
  onNext,
  onMenu,
  isBest,
  lang,
  onClick,
  onHover,
}: {
  result: RaceResult;
  accent: string;
  onRetry: () => void;
  onNext: () => void;
  onMenu: () => void;
  isBest: boolean;
  lang: Language;
  onClick?: () => void;
  onHover?: () => void;
}) {
  const podium = result.position <= 3;
  const track = trackById(result.trackId);
  const car = carById(result.carId);
  return (
    <NavSurface onBack={onMenu}>
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-black/80 via-black/70 to-black/90 p-4 backdrop-blur-sm">
        <div className="animate-rise w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-[#080b12]/92 text-white shadow-[0_30px_90px_-20px_rgba(0,0,0,1)]">
          <div
            className="flex items-center justify-between px-7 py-5"
            style={{ background: `linear-gradient(100deg, ${accent}26, transparent)` }}
          >
            <div>
              <div className="text-[10px] font-black tracking-[0.4em] text-white/40">
                {track.name.toUpperCase()} · {car.name.toUpperCase()}
              </div>
              <h2 className="text-4xl font-black italic tracking-tight">
                {podium ? "🏆 " : ""}
                <span style={{ color: accent }}>{ORDINAL[result.position] ?? `${result.position}º`}</span> {t(lang, "place")}
              </h2>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black tracking-[0.3em] text-white/40">{t(lang, "totalTime")}</div>
              <div className="text-3xl font-black tabular-nums">{fmtTime(result.time)}</div>
              <div className="text-[11px] font-bold" style={{ color: isBest ? accent : "rgba(255,255,255,0.45)" }}>
                {t(lang, "bestLap")} {fmtTime(result.bestLap)} {isBest ? t(lang, "newRecord") : ""}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 px-7 py-5 md:grid-cols-[1fr_220px]">
            <div>
              <div className="mb-2 text-[10px] font-black tracking-[0.3em] text-white/40">{t(lang, "finalStandings")}</div>
              <div className="space-y-1">
                {result.standings.map((s, i) => (
                  <div
                    key={s.name + i}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      s.isPlayer ? "bg-white/12 font-bold" : "bg-white/4"
                    }`}
                  >
                    <span className="w-5 text-white/40 tabular-nums">{i + 1}</span>
                    <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
                    <span className="flex-1">{s.name}</span>
                    <span className="tabular-nums text-white/50">
                      {s.finished ? fmtTime(s.time) : `+${(s.gap / 40).toFixed(1)}s`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[10px] font-black tracking-[0.3em] text-white/40">{t(lang, "lapTimes")}</div>
              <div className="space-y-1">
                {result.laps.map((l, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2 text-sm tabular-nums"
                    style={l === result.bestLap ? { color: accent } : undefined}
                  >
                    <span className="text-white/40">{t(lang, "lap")} {i + 1}</span>
                    <span className="font-semibold">{fmtTime(l)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-white/10 px-7 py-5 sm:flex-row">
            <NavButton
              id="results-retry"
              onClick={() => { onClick?.(); onRetry(); }}
              onMouseEnter={onHover}
              className="flex-1 rounded-lg py-3 text-sm font-black italic tracking-wide text-black transition hover:brightness-110"
              style={{ background: accent }}
            >
              {t(lang, "raceAgain")}
            </NavButton>
            <NavButton
              id="results-next"
              onClick={() => { onClick?.(); onNext(); }}
              onMouseEnter={onHover}
              className="flex-1 rounded-lg border border-white/15 bg-white/5 py-3 text-sm font-black italic tracking-wide transition hover:bg-white/15"
            >
              {t(lang, "nextCircuitBtn")}
            </NavButton>
            <NavButton
              id="results-menu"
              onClick={() => { onClick?.(); onMenu(); }}
              onMouseEnter={onHover}
              className="rounded-lg border border-white/10 px-6 py-3 text-sm font-black italic tracking-wide text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              {t(lang, "quit")}
            </NavButton>
          </div>
        </div>
      </div>
    </NavSurface>
  );
}

export function TouchControls({
  onInput,
}: {
  onInput: (c: { throttle?: boolean; brake?: boolean; steer?: number; handbrake?: boolean; boost?: boolean }) => void;
}) {
  const btn =
    "pointer-events-auto select-none rounded-2xl border border-white/25 bg-white/10 backdrop-blur-md active:bg-white/30 flex items-center justify-center font-black italic text-white/90";
  return (
    <div className="absolute inset-0 z-30 md:hidden">
      <div className="absolute bottom-24 left-4 flex gap-3">
        <button
          className={`${btn} h-20 w-20 text-2xl`}
          onPointerDown={() => onInput({ steer: 1 })}
          onPointerUp={() => onInput({ steer: 0 })}
          onPointerLeave={() => onInput({ steer: 0 })}
        >
          ◀
        </button>
        <button
          className={`${btn} h-20 w-20 text-2xl`}
          onPointerDown={() => onInput({ steer: -1 })}
          onPointerUp={() => onInput({ steer: 0 })}
          onPointerLeave={() => onInput({ steer: 0 })}
        >
          ▶
        </button>
      </div>
      <div className="absolute bottom-24 right-4 flex flex-col items-end gap-3">
        <div className="flex gap-3">
          <button
            className={`${btn} h-14 w-14 text-[10px]`}
            onPointerDown={() => onInput({ boost: true })}
            onPointerUp={() => onInput({ boost: false })}
          >
            NOS
          </button>
          <button
            className={`${btn} h-14 w-14 text-[10px]`}
            onPointerDown={() => onInput({ handbrake: true })}
            onPointerUp={() => onInput({ handbrake: false })}
          >
            DRIFT
          </button>
        </div>
        <div className="flex gap-3">
          <button
            className={`${btn} h-20 w-20 text-xl`}
            onPointerDown={() => onInput({ brake: true })}
            onPointerUp={() => onInput({ brake: false })}
          >
            ▼
          </button>
          <button
            className={`${btn} h-20 w-20 text-xl`}
            onPointerDown={() => onInput({ throttle: true })}
            onPointerUp={() => onInput({ throttle: false })}
          >
            ▲
          </button>
        </div>
      </div>
    </div>
  );
}
