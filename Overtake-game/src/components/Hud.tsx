import { useEffect, useMemo, useRef, useState } from "react";
import type { Engine, Standing } from "../game/Engine";
import { t, type Language } from "../game/i18n";

export function fmtTime(tVal: number, showZero = false) {
  if (!tVal && !showZero) return "--:--.---";
  const m = Math.floor(tVal / 60);
  const s = Math.floor(tVal % 60);
  const ms = Math.floor((tVal % 1) * 1000);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

export function fmtGap(g: number) {
  if (g <= 0.4) return "LEADER";
  return `+${(g / 40).toFixed(1)}s`;
}

const ARC_LEN = 2 * Math.PI * 78 * 0.75;

interface Props {
  engine: Engine;
  accent: string;
  onPause: () => void;
  muted: boolean;
  onToggleMute: () => void;
  hud: { hudMinimap: boolean; hudStandings: boolean; hudSpeedo: boolean; hudTimers: boolean };
  showFps: boolean;
  musicTitle: string;
  lang: Language;
  onClick?: () => void;
  onHover?: () => void;
}

export default function Hud({
  engine,
  accent,
  onPause,
  muted,
  onToggleMute,
  hud,
  showFps,
  musicTitle,
  lang,
  onClick,
  onHover,
}: Props) {
  const speedRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<SVGGElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const rpmRef = useRef<SVGCircleElement>(null);
  const lapTimeRef = useRef<HTMLDivElement>(null);
  const raceTimeRef = useRef<HTMLDivElement>(null);
  const bestRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<HTMLDivElement>(null);
  const lapRef = useRef<HTMLDivElement>(null);
  const boostRef = useRef<HTMLDivElement>(null);
  const driftRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<(SVGGElement | null)[]>([]);
  const warnRef = useRef<HTMLDivElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const unitRef = useRef<HTMLDivElement>(null);

  const [standings, setStandings] = useState<Standing[]>([]);
  const [, setCars] = useState<{ color: string; isPlayer: boolean }[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const mapPath = useMemo(() => engine.mapPath, [engine, engine.mapPath]);

  useEffect(() => {
    let raf = 0;
    let sig = "";
    let lastLap = 0;
    let lastCd = -1;
    let carCount = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const tData = engine.telemetry;

      if (speedRef.current) speedRef.current.textContent = Math.round(Math.abs(tData.speed)).toString();
      if (gearRef.current) gearRef.current.textContent = tData.gear === 0 ? "R" : tData.gear.toString();
      const frac = Math.min(1, Math.abs(tData.speed) / tData.speedMax);
      if (unitRef.current) unitRef.current.textContent = tData.units;
      if (needleRef.current)
        needleRef.current.style.transform = `rotate(${-135 + frac * 270}deg)`;
      if (arcRef.current) arcRef.current.style.strokeDashoffset = `${ARC_LEN * (1 - frac)}`;
      if (rpmRef.current) rpmRef.current.style.strokeDashoffset = `${ARC_LEN * (1 - tData.rpm)}`;
      if (lapTimeRef.current) lapTimeRef.current.textContent = fmtTime(tData.lapTime, true);
      if (raceTimeRef.current) raceTimeRef.current.textContent = fmtTime(tData.raceTime, true);
      if (bestRef.current) bestRef.current.textContent = fmtTime(tData.bestLap);
      if (posRef.current) posRef.current.textContent = tData.position.toString();
      if (lapRef.current) lapRef.current.textContent = `${tData.lap}/${tData.totalLaps}`;
      if (boostRef.current) boostRef.current.style.width = `${Math.round(tData.boost * 100)}%`;
      if (fpsRef.current) fpsRef.current.textContent = `${tData.fps}`;
      if (driftRef.current) {
        const show = tData.drift > 0.25 && !tData.offTrack;
        driftRef.current.style.opacity = show ? "1" : "0";
        driftRef.current.style.transform = `scale(${show ? 1 : 0.85})`;
        driftRef.current.textContent = `${t(lang, "drift")}  ${Math.round(tData.driftScore)}`;
      }
      if (warnRef.current) warnRef.current.style.opacity = tData.wrongWay ? "1" : "0";

      for (let i = 0; i < tData.cars.length; i++) {
        const g = dotsRef.current[i];
        if (!g) continue;
        const c = tData.cars[i];
        g.setAttribute("transform", `translate(${c.x.toFixed(2)} ${c.z.toFixed(2)})`);
      }

      const cd = tData.countdown;
      if (cd !== lastCd) {
        lastCd = cd;
        setCountdown(cd >= 0 ? cd : null);
      }
      if (tData.lap !== lastLap) {
        lastLap = tData.lap;
        if (tData.lap === tData.totalLaps && tData.totalLaps > 1) {
          setBanner(t(lang, "finalLap"));
          setTimeout(() => setBanner(null), 2200);
        } else if (tData.lap > 1) {
          setBanner(`${t(lang, "lap")} ${tData.lap}`);
          setTimeout(() => setBanner(null), 1600);
        }
      }
      const sSig = tData.standings.map((x) => `${x.name}${x.lap}${x.finished ? 1 : 0}`).join("|");
      if (sSig !== sig) {
        sig = sSig;
        setStandings(tData.standings.slice(0, 8));
      }
      if (tData.cars.length !== carCount) {
        carCount = tData.cars.length;
        setCars(tData.cars.map((c) => ({ color: c.color, isPlayer: c.isPlayer })));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, lang]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none text-white">
      {/* ---------- top bar ---------- */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 md:p-6">
        <div className="flex items-stretch gap-3">
          <div
            className="hud-panel flex flex-col items-center justify-center px-4 py-2"
            style={{ borderColor: accent + "66" }}
          >
            <div className="text-[10px] font-bold tracking-[0.25em] text-white/50">{t(lang, "pos")}</div>
            <div className="flex items-baseline gap-1">
              <div ref={posRef} className="text-4xl font-black italic leading-none tabular-nums">
                1
              </div>
              <div className="text-sm font-bold text-white/40">/{engine.telemetry.totalCars}</div>
            </div>
          </div>
          <div className="hud-panel flex flex-col justify-center px-4 py-2">
            <div className="text-[10px] font-bold tracking-[0.25em] text-white/50">{t(lang, "lap")}</div>
            <div ref={lapRef} className="text-2xl font-black italic leading-none tabular-nums">
              1/3
            </div>
          </div>
        </div>

        <div
          className="hud-panel hidden flex-col items-center px-5 py-2 md:flex"
          style={{ visibility: hud.hudTimers ? "visible" : "hidden" }}
        >
          <div className="text-[10px] font-bold tracking-[0.3em] text-white/50">{t(lang, "race")}</div>
          <div ref={raceTimeRef} className="text-2xl font-bold tabular-nums leading-tight">
            0:00.000
          </div>
          <div className="mt-1 flex gap-4 text-[11px]">
            <div className="text-white/60">
              {t(lang, "lap")} <span ref={lapTimeRef} className="font-semibold tabular-nums text-white">0:00.000</span>
            </div>
            <div style={{ color: accent }}>
              {t(lang, "best")} <span ref={bestRef} className="font-semibold tabular-nums">--:--.---</span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div
            className={`hud-panel w-52 flex-col gap-0.5 px-3 py-2 ${
              hud.hudStandings ? "hidden lg:flex" : "hidden"
            }`}
          >
            {standings.map((sItem, i) => (
              <div
                key={sItem.name}
                className={`flex items-center gap-2 rounded px-1.5 py-[3px] text-[11px] ${
                  sItem.isPlayer ? "bg-white/15 font-bold" : ""
                }`}
              >
                <span className="w-4 text-white/40 tabular-nums">{i + 1}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: sItem.color }} />
                <span className="flex-1 truncate">{sItem.name}</span>
                <span className="tabular-nums text-white/50">
                  {sItem.finished ? fmtTime(sItem.time) : fmtGap(sItem.gap)}
                </span>
              </div>
            ))}
          </div>
          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              onClick={() => {
                onClick?.();
                onPause();
              }}
              onMouseEnter={onHover}
              className="hud-panel grid h-10 w-10 place-items-center transition hover:bg-white/20"
              title="Pause (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="4" width="5" height="16" rx="1" />
                <rect x="14" y="4" width="5" height="16" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => {
                onClick?.();
                onToggleMute();
              }}
              onMouseEnter={onHover}
              className="hud-panel grid h-10 w-10 place-items-center transition hover:bg-white/20"
              title="Mute"
            >
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 9v6h4l5 4V5L8 9H4z" />
                  <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 9v6h4l5 4V5L8 9H4z" />
                  <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="1.8" fill="none" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- centre messages ---------- */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {countdown !== null && (
          <div
            key={countdown}
            className="animate-count text-center"
            style={{ color: countdown === 0 ? accent : "#fff" }}
          >
            <div className="text-[9rem] font-black italic leading-none drop-shadow-[0_0_40px_rgba(0,0,0,0.6)]">
              {countdown === 0 ? t(lang, "go") : countdown}
            </div>
          </div>
        )}
      </div>
      {banner && (
        <div className="absolute inset-x-0 top-1/3 flex justify-center">
          <div
            className="animate-banner rounded-sm border-y-2 bg-black/40 px-10 py-2 text-3xl font-black italic tracking-widest backdrop-blur-sm"
            style={{ borderColor: accent, color: accent }}
          >
            {banner}
          </div>
        </div>
      )}
      <div
        ref={warnRef}
        className="absolute inset-x-0 top-[22%] flex justify-center opacity-0 transition-opacity duration-200"
      >
        <div className="animate-pulse rounded bg-red-600/80 px-6 py-1.5 text-xl font-black italic tracking-widest">
          {t(lang, "wrongWay")}
        </div>
      </div>

      {/* ---------- now playing ---------- */}
      {musicTitle && (
        <div className="absolute left-4 top-24 hidden items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 backdrop-blur md:flex">
          <span className="text-xs" style={{ color: accent }}>
            ♪
          </span>
          <span className="text-[10px] font-bold tracking-[0.18em] text-white/60">{musicTitle}</span>
        </div>
      )}

      {/* ---------- bottom left: minimap ---------- */}
      <div
        className="absolute bottom-4 left-4 md:bottom-6 md:left-6"
        style={{ display: hud.hudMinimap ? undefined : "none" }}
      >
        <div className="hud-panel p-2">
          <svg viewBox="-4 -4 108 108" className="h-32 w-32 md:h-40 md:w-40">
            <path
              d={mapPath}
              fill="none"
              stroke="rgba(0,0,0,0.45)"
              strokeWidth={7.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={mapPath}
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth={4}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="1 3"
            />
            {engine.telemetry.cars.map((c, i) => (
              <g
                key={i}
                ref={(el) => {
                  dotsRef.current[i] = el;
                }}
              >
                <circle
                  r={c.isPlayer ? 4.2 : 3}
                  fill={c.color}
                  stroke={c.isPlayer ? "#fff" : "rgba(0,0,0,0.5)"}
                  strokeWidth={c.isPlayer ? 1.6 : 1}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* ---------- bottom centre: boost ---------- */}
      <div className="absolute inset-x-0 bottom-5 flex flex-col items-center gap-2">
        <div
          ref={driftRef}
          className="text-lg font-black italic tracking-widest opacity-0 transition-all duration-150"
          style={{ color: accent, textShadow: "0 0 18px currentColor" }}
        >
          {t(lang, "drift")}
        </div>
        <div className="hud-panel flex items-center gap-2 px-3 py-1.5">
          <span className="text-[10px] font-bold tracking-[0.2em] text-white/60">{t(lang, "nitro")}</span>
          <div className="h-2.5 w-40 overflow-hidden rounded-full bg-white/10 md:w-56">
            <div
              ref={boostRef}
              className="h-full rounded-full transition-[width] duration-100"
              style={{ width: "35%", background: `linear-gradient(90deg, ${accent}, #fff)` }}
            />
          </div>
          <span className="hidden text-[10px] font-semibold text-white/40 md:inline">SHIFT</span>
        </div>
      </div>

      {/* ---------- bottom right: speedo ---------- */}
      <div
        className="absolute bottom-2 right-2 md:bottom-4 md:right-4"
        style={{ display: hud.hudSpeedo ? undefined : "none" }}
      >
        <div className="relative h-44 w-44 md:h-52 md:w-52">
          <svg viewBox="0 0 200 200" className="h-full w-full -rotate-[0deg]">
            <defs>
              <linearGradient id="spdGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={accent} />
                <stop offset="100%" stopColor="#ffffff" />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="92" fill="rgba(8,10,16,0.55)" />
            <circle
              cx="100"
              cy="100"
              r="78"
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="10"
              strokeDasharray={`${ARC_LEN} 999`}
              strokeLinecap="round"
              transform="rotate(135 100 100)"
            />
            <circle
              ref={rpmRef}
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="rgba(255,80,80,0.65)"
              strokeWidth="3"
              strokeDasharray={`${ARC_LEN} 999`}
              strokeDashoffset={ARC_LEN}
              strokeLinecap="round"
              transform="rotate(135 100 100)"
            />
            <circle
              ref={arcRef}
              cx="100"
              cy="100"
              r="78"
              fill="none"
              stroke="url(#spdGrad)"
              strokeWidth="10"
              strokeDasharray={`${ARC_LEN} 999`}
              strokeDashoffset={ARC_LEN}
              strokeLinecap="round"
              transform="rotate(135 100 100)"
            />
            {Array.from({ length: 13 }).map((_, i) => {
              const a = (-135 + (i / 12) * 270) * (Math.PI / 180);
              const r1 = 62;
              const r2 = i % 3 === 0 ? 50 : 56;
              return (
                <line
                  key={i}
                  x1={100 + Math.sin(a) * r1}
                  y1={100 - Math.cos(a) * r1}
                  x2={100 + Math.sin(a) * r2}
                  y2={100 - Math.cos(a) * r2}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={i % 3 === 0 ? 2.5 : 1.2}
                />
              );
            })}
            <g ref={needleRef} style={{ transformOrigin: "100px 100px", transition: "transform 60ms linear" }}>
              <polygon points="100,32 96,104 104,104" fill={accent} />
              <circle cx="100" cy="100" r="7" fill="#fff" />
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-9">
            <div ref={speedRef} className="text-4xl font-black italic leading-none tabular-nums md:text-5xl">
              0
            </div>
            <div ref={unitRef} className="text-[10px] font-bold tracking-[0.3em] text-white/50">
              KM/H
            </div>
          </div>
          <div
            className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md border text-lg font-black italic"
            style={{ borderColor: accent + "88", color: accent, background: "rgba(0,0,0,0.4)" }}
          >
            <span ref={gearRef}>1</span>
          </div>
        </div>
      </div>

      {showFps && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/25">
          <span ref={fpsRef}>60</span> FPS
        </div>
      )}
    </div>
  );
}
