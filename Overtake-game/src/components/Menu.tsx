import { TRACKS, trackById } from "../game/tracks";
import { CARS } from "../game/cars";
import type { InputDevice } from "../game/Engine";
import { NavSurface, NavButton } from "../hooks/GamepadNav";
import { t, type Language } from "../game/i18n";

export type MenuStep = "home" | "garage" | "event";

interface Props {
  step: MenuStep;
  setStep: (s: MenuStep) => void;
  trackId: string;
  carId: string;
  onTrack: (id: string) => void;
  onCar: (id: string) => void;
  difficulty: number;
  setDifficulty: (n: number) => void;
  opponents: number;
  setOpponents: (n: number) => void;
  onStart: () => void;
  best: Record<string, number>;
  muted: boolean;
  onToggleMute: () => void;
  onSettings: () => void;
  musicTitle: string;
  padConnected: boolean;
  padName: string;
  inputDevice: InputDevice;
  lang: Language;
  onClick: () => void;
  onHover: () => void;
  onWhoosh: (dir: number) => void;
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-10 text-[8px] font-bold tracking-[0.15em] text-white/40">{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.round(value * 100)}%`, background: `linear-gradient(90deg,${accent},#fff)` }}
        />
      </div>
    </div>
  );
}

export default function Menu(p: Props) {
  const lang = p.lang ?? "en";
  const track = trackById(p.trackId);
  // fixed brand accent — UI doesn't change color per track anymore
  const accent = "#ff4a15";
  const car = CARS.find((c) => c.id === p.carId) ?? CARS[0];

  const diffLabels = [
    t(lang, "diff0"),
    t(lang, "diff1"),
    t(lang, "diff2"),
    t(lang, "diff3"),
  ];

  const trackSelect = (id: string) => {
    if (id !== p.trackId) p.onWhoosh(1);
    p.onClick();
    p.onTrack(id);
  };
  const carSelect = (id: string) => {
    if (id !== p.carId) p.onWhoosh(1);
    p.onClick();
    p.onCar(id);
  };
  const btnClick = () => {
    p.onClick();
    p.onStart();
  };
  const toggleClick = (setter: (n: number) => void, val: number) => {
    p.onClick();
    setter(val);
  };

  const carIdx = CARS.findIndex((c) => c.id === p.carId);
  const trackIdx = TRACKS.findIndex((t) => t.id === p.trackId);

  const prevCar = () => carSelect(CARS[(carIdx - 1 + CARS.length) % CARS.length].id);
  const nextCar = () => carSelect(CARS[(carIdx + 1) % CARS.length].id);

  const prevTrack = () => trackSelect(TRACKS[(trackIdx - 1 + TRACKS.length) % TRACKS.length].id);
  const nextTrack = () => trackSelect(TRACKS[(trackIdx + 1) % TRACKS.length].id);

  const handleBumper = (dir: "left" | "right") => {
    if (p.step === "garage") {
      if (dir === "left") prevCar();
      else nextCar();
    } else if (p.step === "event") {
      if (dir === "left") prevTrack();
      else nextTrack();
    }
  };

  const usePad = p.padConnected || p.inputDevice === "gamepad";
  const hint = (l: string, r: string) => (
    <span className="flex items-center gap-1.5">
      <kbd className="kbd">{l}</kbd>
      <span>{r}</span>
    </span>
  );

  if (p.step === "home") {
    return (
      <NavSurface>
        <div className="absolute inset-0 overflow-hidden text-white flex flex-col items-center justify-center">
          <div className="pointer-events-none absolute inset-0 bg-black/40" />
          <div className="relative z-10 flex flex-col items-center">
            <h1 className="text-6xl font-black italic tracking-tighter drop-shadow-2xl md:text-8xl lg:text-[9rem]">
              OVER<span style={{ color: accent }}>TAKE</span>
            </h1>
            <p className="mt-2 text-xs font-bold tracking-[0.4em] text-white/60 md:text-sm drop-shadow-md">
              {t(lang, "gameSubtitle")}
            </p>
            <div className="mt-16 flex flex-col items-center gap-5">
              <NavButton
                id="menu-play"
                onClick={() => {
                  p.onClick();
                  p.setStep("garage");
                }}
                onMouseEnter={p.onHover}
                className="px-14 py-4 rounded-full text-2xl font-black italic tracking-wider transition hover:scale-105 active:scale-95 nav-active-glow"
                style={{ background: `linear-gradient(100deg, ${accent}, #fff)`, color: "#000" }}
              >
                {t(lang, "play")}
              </NavButton>
              <NavButton
                id="menu-settings"
                onClick={() => {
                  p.onClick();
                  p.onSettings();
                }}
                onMouseEnter={p.onHover}
                className="px-10 py-3 rounded-full border border-white/20 text-xs font-bold tracking-[0.2em] transition hover:bg-white/10 hover:border-white/40"
              >
                {t(lang, "settings")}
              </NavButton>
            </div>
            <div className="mt-10 flex items-center gap-4 text-[10px] font-bold tracking-[0.2em] text-white/35">
              {usePad ? hint("A", t(lang, "select")) : hint("ENTER", t(lang, "select"))}
              <span className="text-white/15">|</span>
              {usePad ? hint("B", t(lang, "back")) : hint("ESC", t(lang, "back"))}
            </div>
          </div>
        </div>
      </NavSurface>
    );
  }

  return (
    <NavSurface onBack={() => p.setStep(p.step === "event" ? "garage" : "home")} onBumper={handleBumper}>
      <div className="absolute inset-0 overflow-hidden text-white">
        {/* gradient overlays for the 3D preview behind */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/80 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-6 md:p-8">
          {/* ───── top bar ───── */}
          <header className="flex items-center justify-between">
            <NavButton
              id="menu-back"
              onClick={() => {
                p.onClick();
                p.setStep(p.step === "garage" ? "home" : "garage");
              }}
              onMouseEnter={p.onHover}
              className="flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-[10px] font-bold tracking-widest backdrop-blur transition hover:bg-white/10 hover:border-white/40"
            >
              ← {t(lang, "back")}
            </NavButton>

            <div className="flex items-center gap-4">
              {p.padConnected && (
                <div className="hidden items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-[9px] font-bold tracking-[0.18em] text-emerald-200 backdrop-blur md:flex">
                  🎮 {p.padName.toUpperCase()}
                </div>
              )}
              {p.musicTitle && (
                <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[9px] font-bold tracking-[0.18em] text-white/40 backdrop-blur md:flex">
                  <span style={{ color: accent }}>♪</span>
                  <span className="max-w-[160px] truncate">{p.musicTitle}</span>
                </div>
              )}
              <NavButton
                id="menu-mute"
                onClick={() => {
                  p.onClick();
                  p.onToggleMute();
                }}
                onMouseEnter={p.onHover}
                className="rounded-full border border-white/20 bg-black/40 px-3 py-2 text-[10px] font-bold tracking-widest backdrop-blur transition hover:bg-white/10 hover:border-white/40"
              >
                {p.muted ? "🔇" : "🔊"}
              </NavButton>
            </div>
          </header>

          {p.step === "garage" && (
            <div className="flex flex-1 flex-col justify-end gap-6 pb-4">
              <div className="flex flex-col items-center justify-between gap-6 md:flex-row md:items-end">
                {/* Car Info Panel */}
                <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/50 p-5 backdrop-blur-md">
                  <div className="mb-3 flex items-baseline justify-between">
                    <div className="text-[10px] font-black tracking-[0.3em] text-white/40">
                      {t(lang, "carStats")}
                    </div>
                    <div className="text-[10px] font-bold tracking-[0.2em]" style={{ color: accent }}>
                      {car.klass}
                    </div>
                  </div>
                  <div className="mb-4 space-y-1.5">
                    <Stat label={t(lang, "statSpeed")} value={car.topSpeed / 150} accent={accent} />
                    <Stat label={t(lang, "statAccel")} value={car.accel / 62} accent={accent} />
                    <Stat label={t(lang, "statBrakes")} value={car.brake / 95} accent={accent} />
                    <Stat label={t(lang, "statHandling")} value={car.handling / 3} accent={accent} />
                  </div>
                  <div className="border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.15em] text-white/50">
                      <span>{car.engine.layout}</span>
                      <span>{car.engine.cylinders} CYL</span>
                      <span>{car.engine.redlineRpm.toLocaleString()} RPM</span>
                    </div>
                  </div>
                </div>

                {/* Car Carousel Controls */}
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/60 px-6 py-3 backdrop-blur-xl">
                    <NavButton
                      id="garage-prev"
                      onClick={prevCar}
                      onMouseEnter={p.onHover}
                      className="p-2 text-white/50 transition hover:text-white hover:scale-110 active:scale-95"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </NavButton>
                    <div className="w-48 text-center">
                      <h2 className="text-3xl font-black italic tracking-tight">{car.name}</h2>
                    </div>
                    <NavButton
                      id="garage-next"
                      onClick={nextCar}
                      onMouseEnter={p.onHover}
                      className="p-2 text-white/50 transition hover:text-white hover:scale-110 active:scale-95"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </NavButton>
                  </div>
                  <NavButton
                    id="garage-next-step"
                    onClick={() => {
                      p.onClick();
                      p.setStep("event");
                    }}
                    onMouseEnter={p.onHover}
                    className="rounded-full px-12 py-3 text-sm font-black italic tracking-widest text-black transition hover:scale-105 active:scale-95 nav-active-glow"
                    style={{ background: `linear-gradient(100deg, ${accent}, #fff)` }}
                  >
                    {t(lang, "nextCircuit")}
                  </NavButton>
                </div>
              </div>
            </div>
          )}

          {p.step === "event" && (
            <div className="flex flex-1 flex-col justify-end gap-6 pb-4">
              <div className="flex flex-col items-center justify-between gap-6 md:flex-row md:items-end">
                {/* Event Options Panel */}
                <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/50 p-5 backdrop-blur-md">
                  <div className="mb-4 text-[10px] font-black tracking-[0.3em] text-white/40">
                    {t(lang, "eventSetup")}
                  </div>

                  <div className="mb-4">
                    <div className="mb-2 text-[9px] font-black tracking-[0.2em] text-white/50">
                      {t(lang, "difficulty")}
                    </div>
                    <div className="flex gap-1.5">
                      {diffLabels.map((d, i) => (
                        <NavButton
                          key={d}
                          id={`event-diff-${i}`}
                          onClick={() => toggleClick(p.setDifficulty, i)}
                          onMouseEnter={p.onHover}
                          className={`flex-1 rounded py-1.5 text-[9px] font-black tracking-widest transition ${
                            p.difficulty === i ? "text-black font-bold" : "bg-white/10 text-white/60 hover:bg-white/20"
                          }`}
                          style={p.difficulty === i ? { background: accent } : undefined}
                        >
                          {d}
                        </NavButton>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[9px] font-black tracking-[0.2em] text-white/50">
                      {t(lang, "opponents")}
                    </div>
                    <div className="flex gap-1.5">
                      {[3, 5, 7].map((n) => (
                        <NavButton
                          key={n}
                          id={`event-opp-${n}`}
                          onClick={() => toggleClick(p.setOpponents, n)}
                          onMouseEnter={p.onHover}
                          className={`flex-1 rounded py-1.5 text-[10px] font-black tracking-widest transition ${
                            p.opponents === n ? "text-black font-bold" : "bg-white/10 text-white/60 hover:bg-white/20"
                          }`}
                          style={p.opponents === n ? { background: accent } : undefined}
                        >
                          {t(lang, "opponentsCount", { n })}
                        </NavButton>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Track Carousel Controls */}
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/60 px-6 py-3 backdrop-blur-xl">
                    <NavButton
                      id="event-prev"
                      onClick={prevTrack}
                      onMouseEnter={p.onHover}
                      className="p-2 text-white/50 transition hover:text-white hover:scale-110 active:scale-95"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </NavButton>
                    <div className="w-56 text-center">
                      <h2 className="text-3xl font-black italic tracking-tight truncate">{track.name}</h2>
                      <p className="mt-1 text-[9px] font-bold tracking-[0.2em] text-white/50">
                        {track.location.toUpperCase()}
                      </p>
                    </div>
                    <NavButton
                      id="event-next"
                      onClick={nextTrack}
                      onMouseEnter={p.onHover}
                      className="p-2 text-white/50 transition hover:text-white hover:scale-110 active:scale-95"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </NavButton>
                  </div>
                  <NavButton
                    id="event-start"
                    onClick={btnClick}
                    onMouseEnter={p.onHover}
                    className="rounded-full px-16 py-4 text-xl font-black italic tracking-widest text-black transition hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)] nav-active-glow"
                    style={{ background: `linear-gradient(100deg, ${accent}, #fff)` }}
                  >
                    {t(lang, "startRace")}
                  </NavButton>
                </div>
              </div>
            </div>
          )}

          {/* ───── bottom hints ───── */}
          <div className="mt-2 flex items-center justify-center gap-4 text-[9px] font-bold tracking-[0.22em] text-white/30">
            {usePad ? (
              <>
                {hint("LB/RB", "PREV/NEXT")}
                <span className="text-white/12">|</span>
                {hint("A", t(lang, "select"))}
                <span className="text-white/12">|</span>
                {hint("B", t(lang, "back"))}
              </>
            ) : (
              <>
                {hint("Q/E", "PREV/NEXT")}
                <span className="text-white/12">|</span>
                <span>{t(lang, "hintDrive")}</span>
                <span className="text-white/12">|</span>
                <span>{t(lang, "hintDrift")}</span>
                <span className="text-white/12">|</span>
                <span>{t(lang, "hintNitro")}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </NavSurface>
  );
}
