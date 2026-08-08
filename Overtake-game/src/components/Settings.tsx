import { useEffect, useRef, useState } from "react";
import {
  AA_LABELS,
  ACTION_LABELS,
  defaultSettings,
  keyLabel,
  type AAMode,
  type Action,
  type RayMode,
  type Settings,
  type ShadowMode,
} from "../game/settings";
import type { MusicStatus } from "../game/audio";
import { NavSurface, NavButton, useNavItem } from "../hooks/GamepadNav";
import { cn } from "../utils/cn";
import { t, LANGUAGE_NAMES, type Language } from "../game/i18n";

type Tab = "graphics" | "video" | "audio" | "controls" | "game";

const TABS: Tab[] = ["graphics", "video", "audio", "controls", "game"];

const TAB_ICONS: Record<Tab, string> = {
  graphics: "▨",
  video: "◐",
  audio: "♪",
  controls: "⌘",
  game: "◈",
};

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  accent: string;
  music: { title: string; status: MusicStatus; onNext: () => void; onPrev: () => void };
  fps: number;
  onClick?: () => void;
  onHover?: () => void;
}

/* ---------------- primitives ---------------- */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-white/6 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-white/85">{label}</div>
        {hint && <div className="text-[10px] leading-tight text-white/35">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  accent,
  wide,
  navBase,
}: {
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
  accent: string;
  wide?: boolean;
  navBase?: string;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-white/12 bg-black/40">
      {options.map((o, i) => (
        <SegBtn
          key={String(o.v)}
          id={navBase ? `${navBase}-${i}` : undefined}
          active={value === o.v}
          onClick={() => onChange(o.v)}
          className={`${wide ? "min-w-[64px]" : "min-w-[42px]"} ${
            value === o.v ? "text-black font-bold" : "text-white/55 hover:bg-white/10"
          }`}
          activeStyle={value === o.v ? { background: accent } : undefined}
        >
          {o.l}
        </SegBtn>
      ))}
    </div>
  );
}

function SegBtn({
  id,
  active,
  onClick,
  className,
  activeStyle,
  children,
}: {
  id?: string;
  active: boolean;
  onClick: () => void;
  className?: string;
  activeStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { ref, isActive } = useNavItem(id ?? `seg-${Math.random().toString(36).slice(2)}`, "button");
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      onClick={onClick}
      className={cn("px-2.5 py-1.5 text-[10px] font-black tracking-wider transition", className, isActive && "nav-active")}
      style={active ? activeStyle : undefined}
    >
      {children}
    </button>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  accent,
  format,
  navId,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  accent: string;
  format?: (v: number) => string;
  navId?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const { ref, isActive } = useNavItem(navId ?? `slider-${Math.random().toString(36).slice(2)}`, "slider");
  return (
    <div className={cn("flex items-center gap-2.5 rounded-md px-1 py-0.5", isActive && "nav-active")}>
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="ar-range h-1.5 w-32 cursor-pointer appearance-none rounded-full md:w-40"
        style={{
          background: `linear-gradient(90deg, ${accent} ${pct}%, rgba(255,255,255,0.14) ${pct}%)`,
        }}
      />
      <span className="w-12 text-right text-[10px] font-bold tabular-nums text-white/60">
        {format ? format(value) : `${Math.round(value * 100)}%`}
      </span>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  accent,
  navId,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  accent: string;
  navId?: string;
}) {
  const { ref, isActive } = useNavItem(navId ?? `toggle-${Math.random().toString(36).slice(2)}`, "toggle");
  const toggle = () => onChange(!on);
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          toggle();
        }
      }}
      role="switch"
      aria-checked={on}
      className={cn("relative h-6 w-11 rounded-full border border-white/15 transition", isActive && "nav-active")}
      style={{ background: on ? accent : "rgba(255,255,255,0.1)" }}
    >
      <span
        className="absolute top-[2px] rounded-full bg-white shadow transition-all"
        style={{ left: on ? 23 : 3, height: 18, width: 18 }}
      />
    </button>
  );
}

/* ---------------- main ---------------- */
export default function SettingsPanel({
  settings,
  onChange,
  onClose,
  accent,
  music,
  fps,
  onClick,
  onHover,
}: Props) {
  const [tab, setTab] = useState<Tab>("graphics");
  const [listening, setListening] = useState<{ action: Action; slot: 0 | 1 } | null>(null);
  const listenRef = useRef(listening);
  listenRef.current = listening;

  const g = settings.graphics;
  const v = settings.video;
  const a = settings.audio;
  const c = settings.controls;
  const gp = settings.gameplay;
  const lang = gp.language ?? "en";

  const setG = (patch: Partial<typeof g>) =>
    onChange({
      ...settings,
      graphics: { ...g, ...patch, qualityPreset: patch.qualityPreset ?? g.qualityPreset },
    });
  const setV = (patch: Partial<typeof v>) =>
    onChange({
      ...settings,
      video: { ...v, ...patch },
    });
  const setA = (patch: Partial<typeof a>) => onChange({ ...settings, audio: { ...a, ...patch } });
  const setC = (patch: Partial<typeof c>) => onChange({ ...settings, controls: { ...c, ...patch } });
  const setGP = (patch: Partial<typeof gp>) => onChange({ ...settings, gameplay: { ...gp, ...patch } });

  const handleBumper = (dir: "left" | "right") => {
    onClick?.();
    const idx = TABS.indexOf(tab);
    if (dir === "left") setTab(TABS[(idx - 1 + TABS.length) % TABS.length]);
    else setTab(TABS[(idx + 1) % TABS.length]);
  };

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const l = listenRef.current;
      if (!l) return;
      if (e.code === "Escape") {
        setListening(null);
        return;
      }
      const field = l.slot === 0 ? "bindings" : "secondary";
      const other = l.slot === 0 ? "secondary" : "bindings";
      const next = { ...c[field], [l.action]: e.code };
      const otherMap = { ...c[other] };
      for (const k of Object.keys(next) as Action[]) {
        if (k !== l.action && next[k] === e.code) next[k] = "";
      }
      for (const k of Object.keys(otherMap) as Action[]) {
        if (otherMap[k] === e.code) otherMap[k] = "";
      }
      setC({ [field]: next, [other]: otherMap } as never);
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening]); // eslint-disable-line react-hooks/exhaustive-deps

  const qualityPresets: { v: string; l: string }[] = [
    { v: "low", l: t(lang, "qualityLow") },
    { v: "medium", l: t(lang, "qualityMedium") },
    { v: "high", l: t(lang, "qualityHigh") },
    { v: "ultra", l: t(lang, "qualityUltra") },
  ];

  return (
    <NavSurface onBack={onClose} onBumper={handleBumper}>
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-md">
        <div className="animate-rise flex h-[min(700px,94vh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#080b12]/95 text-white shadow-[0_40px_100px_-20px_rgba(0,0,0,1)]">
          {/* header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-3.5">
            <div className="flex items-center gap-3">
              <div className="h-7 w-1 rounded-full" style={{ background: accent }} />
              <h2 className="text-2xl font-black italic tracking-tight">{t(lang, "settings")}</h2>
              <span className="rounded bg-white/8 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white/45">
                {fps} FPS
              </span>
            </div>
            <NavButton
              id="settings-close"
              onClick={() => {
                onClick?.();
                onClose();
              }}
              onMouseEnter={onHover}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white/60 transition hover:bg-white/15 hover:text-white"
            >
              ✕
            </NavButton>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* tabs */}
            <div className="flex w-36 shrink-0 flex-col gap-1 border-r border-white/10 p-3 md:w-44">
              {TABS.map((tKey) => {
                const tabLabelKey = (`tab${tKey.charAt(0).toUpperCase()}${tKey.slice(1)}`) as keyof typeof import("../game/i18n").TRANSLATIONS["en"];
                return (
                  <NavButton
                    key={tKey}
                    id={`settings-tab-${tKey}`}
                    onClick={() => {
                      onClick?.();
                      setTab(tKey);
                    }}
                    onMouseEnter={onHover}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[11px] font-black tracking-wider transition ${
                      tab === tKey ? "bg-white/12 text-white" : "text-white/45 hover:bg-white/6"
                    }`}
                    style={tab === tKey ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
                  >
                    <span style={{ color: tab === tKey ? accent : undefined }}>{TAB_ICONS[tKey]}</span>
                    {t(lang, tabLabelKey)}
                  </NavButton>
                );
              })}
              <div className="flex-1" />
              <NavButton
                id="settings-reset"
                onClick={() => {
                  onClick?.();
                  onChange(defaultSettings());
                }}
                onMouseEnter={onHover}
                className="rounded-lg border border-white/10 px-2 py-2 text-[10px] font-bold tracking-wider text-white/40 transition hover:bg-white/10 hover:text-white"
              >
                {t(lang, "resetAll")}
              </NavButton>
            </div>

            {/* content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {tab === "graphics" && (
                <div className="space-y-1">
                  <Row label={t(lang, "qualityPreset")} hint={t(lang, "qualityPresetHint")}>
                    <Seg
                      navBase="g-qpreset"
                      value={g.qualityPreset}
                      options={
                        g.qualityPreset === "custom"
                          ? [...qualityPresets, { v: "custom", l: t(lang, "qualityCustom") }]
                          : qualityPresets
                      }
                      onChange={(val) => {
                        if (val !== "custom") {
                          onChange({
                            ...settings,
                            graphics: {
                              ...settings.graphics,
                              ...((
                                {
                                  low: { resolutionScale: 0.75, antialiasing: "off", shadows: "off", godRays: "off", particles: 0.5, drawDistance: 0.7 },
                                  medium: { resolutionScale: 1.0, antialiasing: "fxaa", shadows: "low", godRays: "low", particles: 0.8, drawDistance: 0.9 },
                                  high: { resolutionScale: 1.2, antialiasing: "msaa4", shadows: "medium", godRays: "high", particles: 1.0, drawDistance: 1.0 },
                                  ultra: { resolutionScale: 1.6, antialiasing: "msaa8", shadows: "high", godRays: "high", particles: 1.2, drawDistance: 1.25 },
                                } as const
                              )[val as "low" | "medium" | "high" | "ultra"]),
                              qualityPreset: val as any,
                            },
                          });
                        } else setG({ qualityPreset: val as any });
                      }}
                      accent={accent}
                    />
                  </Row>

                  <Row label={t(lang, "renderScale")} hint={t(lang, "renderScaleHint")}>
                    <Slider
                      navId="g-res"
                      value={g.resolutionScale}
                      min={0.5}
                      max={3.0}
                      step={0.1}
                      onChange={(val) => setG({ resolutionScale: val })}
                      accent={accent}
                      format={(val) => `${val.toFixed(1)}x`}
                    />
                  </Row>

                  <Row label={t(lang, "antiAliasing")} hint={t(lang, "antiAliasingHint")}>
                    <Seg
                      navBase="g-aa"
                      value={g.antialiasing}
                      options={(["off", "fxaa", "msaa2", "msaa4", "msaa8"] as AAMode[]).map((val) => ({
                        v: val,
                        l: AA_LABELS[val],
                      }))}
                      onChange={(val) => setG({ antialiasing: val })}
                      accent={accent}
                    />
                  </Row>

                  <Row label={t(lang, "shadowQuality")} hint={t(lang, "shadowQualityHint")}>
                    <Seg
                      navBase="g-shadows"
                      value={g.shadows}
                      options={(["off", "low", "medium", "high"] as ShadowMode[]).map((val) => ({
                        v: val,
                        l: val.toUpperCase(),
                      }))}
                      onChange={(val) => setG({ shadows: val })}
                      accent={accent}
                    />
                  </Row>

                  <Row label={t(lang, "sunBeams")} hint={t(lang, "sunBeamsHint")}>
                    <Seg
                      navBase="g-rays"
                      value={g.godRays}
                      options={(["off", "low", "high"] as RayMode[]).map((val) => ({ v: val, l: val.toUpperCase() }))}
                      onChange={(val) => setG({ godRays: val })}
                      accent={accent}
                    />
                  </Row>

                  <Row label={t(lang, "particleDensity")} hint={t(lang, "particleDensityHint")}>
                    <Slider navId="g-particles" value={g.particles} min={0} max={1.5} step={0.1} onChange={(val) => setG({ particles: val })} accent={accent} format={(val) => `${val.toFixed(1)}x`} />
                  </Row>

                  <Row label={t(lang, "drawDistance")} hint={t(lang, "drawDistanceHint")}>
                    <Slider navId="g-draw" value={g.drawDistance} min={0.5} max={1.6} step={0.1} onChange={(val) => setG({ drawDistance: val })} accent={accent} format={(val) => `${val.toFixed(1)}x`} />
                  </Row>
                </div>
              )}

              {tab === "video" && (
                <div className="space-y-1">
                  <Row label={t(lang, "bloom")} hint={t(lang, "bloomHint")}>
                    <Slider navId="v-bloom" value={v.bloom} min={0} max={2} step={0.05} onChange={(val) => setV({ bloom: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "motionBlur")} hint={t(lang, "motionBlurHint")}>
                    <Slider navId="v-blur" value={v.motionBlur} min={0} max={1} step={0.05} onChange={(val) => setV({ motionBlur: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "chromatic")} hint={t(lang, "chromaticHint")}>
                    <Slider navId="v-chroma" value={v.chromatic} min={0} max={1} step={0.05} onChange={(val) => setV({ chromatic: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "vignette")}>
                    <Slider navId="v-vignette" value={v.vignette} min={0} max={1} step={0.05} onChange={(val) => setV({ vignette: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "exposure")}>
                    <Slider navId="v-exposure" value={v.exposure} min={0.6} max={1.8} step={0.02} onChange={(val) => setV({ exposure: val })} accent={accent} format={(val) => val.toFixed(2)} />
                  </Row>
                  <Row label={t(lang, "showFps")}>
                    <Toggle navId="v-fps" on={v.showFps} onChange={(val) => setV({ showFps: val })} accent={accent} />
                  </Row>
                </div>
              )}

              {tab === "audio" && (
                <div className="space-y-1">
                  <Row label={t(lang, "masterVolume")}>
                    <Slider navId="a-master" value={a.master} min={0} max={1} step={0.02} onChange={(val) => setA({ master: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "musicVolume")}>
                    <Slider navId="a-music" value={a.music} min={0} max={1} step={0.02} onChange={(val) => setA({ music: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "engineVolume")} hint={t(lang, "engineVolumeHint")}>
                    <Slider navId="a-engine" value={a.engine} min={0} max={1} step={0.02} onChange={(val) => setA({ engine: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "effectsVolume")} hint={t(lang, "effectsVolumeHint")}>
                    <Slider navId="a-sfx" value={a.sfx} min={0} max={1} step={0.02} onChange={(val) => setA({ sfx: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "bgMusic")}>
                    <Toggle navId="a-music-on" on={a.musicEnabled} onChange={(val) => setA({ musicEnabled: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "shufflePlaylist")}>
                    <Toggle navId="a-shuffle" on={a.shuffle} onChange={(val) => setA({ shuffle: val })} accent={accent} />
                  </Row>

                  <div className="mt-4 rounded-xl border border-white/12 bg-black/40 p-4">
                    <div className="mb-2 text-[10px] font-black tracking-[0.3em] text-white/40">{t(lang, "nowPlaying")}</div>
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg" style={{ background: `${accent}22`, color: accent }}>
                        ♪
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{music.title || "—"}</div>
                        <div className="text-[10px] uppercase tracking-widest text-white/35">
                          {music.status === "playing"
                            ? "Streaming"
                            : music.status === "loading"
                              ? "Buffering…"
                              : music.status === "error"
                                ? "Unavailable — skipping"
                                : "Paused"}
                        </div>
                      </div>
                      <NavButton id="music-prev" onClick={music.onPrev} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 transition hover:bg-white/15">
                        ⏮
                      </NavButton>
                      <NavButton id="music-next" onClick={music.onNext} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 transition hover:bg-white/15">
                        ⏭
                      </NavButton>
                    </div>
                  </div>
                </div>
              )}

              {tab === "controls" && (
                <div className="space-y-1">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-black tracking-[0.3em] text-white/40">
                    <span>{t(lang, "keyBindings")}</span>
                    <span className="flex gap-2">
                      <span className="w-[68px] text-center">{t(lang, "primaryKey")}</span>
                      <span className="w-[68px] text-center">{t(lang, "altKey")}</span>
                    </span>
                  </div>
                  {(Object.keys(ACTION_LABELS) as Action[]).map((action) => (
                    <div key={action} className="flex items-center gap-3 border-b border-white/6 py-2 last:border-0">
                      <span className="flex-1 text-[12px] font-semibold text-white/85">{ACTION_LABELS[action]}</span>
                      {([0, 1] as const).map((slot) => {
                        const code = slot === 0 ? c.bindings[action] : c.secondary[action];
                        const active = listening?.action === action && listening.slot === slot;
                        return (
                          <NavButton
                            key={slot}
                            id={`bind-${action}-${slot}`}
                            onClick={() => setListening({ action, slot })}
                            className={`w-[68px] rounded-md border py-1.5 text-[10px] font-black tracking-wider transition ${
                              active ? "animate-pulse border-transparent text-black" : "border-white/15 bg-black/40 text-white/70 hover:bg-white/10"
                            }`}
                            style={active ? { background: accent } : undefined}
                          >
                            {active ? "PRESS…" : keyLabel(code)}
                          </NavButton>
                        );
                      })}
                    </div>
                  ))}

                  <div className="pt-4">
                    <div className="mb-2 mt-4 flex items-center gap-3 text-[10px] font-black tracking-[0.3em] text-white/40">
                      {t(lang, "wheelFeel")}
                      <span className="h-px flex-1 bg-white/8" />
                    </div>
                    <Row label={t(lang, "steeringSens")} hint={t(lang, "steeringSensHint")}>
                      <Slider navId="c-steer-sens" value={c.steerSensitivity} min={0.5} max={1.6} step={0.05} onChange={(val) => setC({ steerSensitivity: val })} accent={accent} format={(val) => `${val.toFixed(2)}×`} />
                    </Row>
                    <Row label={t(lang, "steeringSpeed")} hint={t(lang, "steeringSpeedHint")}>
                      <Slider navId="c-steer-speed" value={c.steerSpeed} min={0.5} max={2} step={0.05} onChange={(val) => setC({ steerSpeed: val })} accent={accent} format={(val) => `${val.toFixed(2)}×`} />
                    </Row>
                    <Row label={t(lang, "countersteer")} hint={t(lang, "countersteerHint")}>
                      <Slider navId="c-counter" value={c.countersteerAssist} min={0} max={1} step={0.05} onChange={(val) => setC({ countersteerAssist: val })} accent={accent} />
                    </Row>
                    <Row label={t(lang, "cameraShake")}>
                      <Slider navId="c-shake" value={c.cameraShake} min={0} max={1.5} step={0.05} onChange={(val) => setC({ cameraShake: val })} accent={accent} />
                    </Row>
                    <Row label={t(lang, "autoAccelerate")} hint={t(lang, "autoAccelerateHint")}>
                      <Toggle navId="c-auto" on={c.autoAccelerate} onChange={(val) => setC({ autoAccelerate: val })} accent={accent} />
                    </Row>
                    <Row label={t(lang, "defaultCamera")}>
                      <Seg
                        navBase="c-camera"
                        value={c.defaultCamera}
                        options={[
                          { v: 0, l: t(lang, "camChase") },
                          { v: 1, l: t(lang, "camCockpit") },
                          { v: 2, l: t(lang, "camFar") },
                        ]}
                        onChange={(val) => setC({ defaultCamera: val })}
                        accent={accent}
                        wide
                      />
                    </Row>

                    <div className="mb-2 mt-4 flex items-center gap-3 text-[10px] font-black tracking-[0.3em] text-white/40">
                      {t(lang, "padSection")}
                      <span className="h-px flex-1 bg-white/8" />
                    </div>
                    <Row label={t(lang, "padDeadzone")} hint={t(lang, "padDeadzoneHint")}>
                      <Slider navId="c-pad-dz" value={c.padDeadzone} min={0.05} max={0.4} step={0.01} onChange={(val) => setC({ padDeadzone: val })} accent={accent} format={(val) => `${Math.round(val * 100)}%`} />
                    </Row>
                    <Row label={t(lang, "padSens")} hint={t(lang, "padSensHint")}>
                      <Slider navId="c-pad-sens" value={c.padSensitivity} min={0.5} max={1.6} step={0.05} onChange={(val) => setC({ padSensitivity: val })} accent={accent} format={(val) => `${val.toFixed(2)}×`} />
                    </Row>
                    <Row label={t(lang, "padVibration")} hint={t(lang, "padVibrationHint")}>
                      <Toggle navId="c-pad-vib" on={c.padVibration} onChange={(val) => setC({ padVibration: val })} accent={accent} />
                    </Row>
                    <Row label={t(lang, "padScheme")} hint={t(lang, "padSchemeText")}>
                      <span className="max-w-[240px] text-right text-[9px] font-bold tracking-wider text-white/35">RT/LT · LS STEER</span>
                    </Row>
                  </div>
                </div>
              )}

              {tab === "game" && (
                <div className="space-y-1">
                  <Row label={t(lang, "language")} hint={t(lang, "languageHint")}>
                    <Seg
                      navBase="gp-lang"
                      value={gp.language ?? "en"}
                      options={(["en", "pt-BR"] as Language[]).map((val) => ({
                        v: val,
                        l: LANGUAGE_NAMES[val],
                      }))}
                      onChange={(val) => setGP({ language: val })}
                      accent={accent}
                      wide
                    />
                  </Row>
                  <Row label={t(lang, "speedUnits")}>
                    <Seg navBase="gp-units" value={gp.units} options={[{ v: "kmh" as const, l: t(lang, "kmh") }, { v: "mph" as const, l: t(lang, "mph") }]} onChange={(val) => setGP({ units: val })} accent={accent} wide />
                  </Row>
                  <Row label={t(lang, "hudMinimap")}>
                    <Toggle navId="gp-minimap" on={gp.hudMinimap} onChange={(val) => setGP({ hudMinimap: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "hudStandings")}>
                    <Toggle navId="gp-standings" on={gp.hudStandings} onChange={(val) => setGP({ hudStandings: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "hudSpeedo")}>
                    <Toggle navId="gp-speedo" on={gp.hudSpeedo} onChange={(val) => setGP({ hudSpeedo: val })} accent={accent} />
                  </Row>
                  <Row label={t(lang, "hudTimers")}>
                    <Toggle navId="gp-timers" on={gp.hudTimers} onChange={(val) => setGP({ hudTimers: val })} accent={accent} />
                  </Row>
                  <div className="mt-5 rounded-xl border border-white/10 bg-black/35 p-4 text-[11px] leading-relaxed text-white/45">
                    <div className="mb-1 font-black tracking-[0.2em] text-white/60">{t(lang, "aboutTitle")}</div>
                    {t(lang, "aboutText")}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-6 py-3">
            <span className="text-[10px] tracking-widest text-white/25">{t(lang, "saveNotice")}</span>
            <NavButton
              id="settings-done"
              onClick={() => {
                onClick?.();
                onClose();
              }}
              onMouseEnter={onHover}
              className="rounded-lg px-6 py-2 text-[12px] font-black italic tracking-wide text-black transition hover:brightness-110"
              style={{ background: accent }}
            >
              {t(lang, "done")}
            </NavButton>
          </div>
        </div>
      </div>
    </NavSurface>
  );
}
