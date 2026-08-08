import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, type InputDevice, type RaceResult } from "./game/Engine";
import { TRACKS } from "./game/tracks";
import { loadSettings, saveSettings, type Settings } from "./game/settings";
import { CARS } from "./game/cars";
import { preloadGlb } from "./game/glb";
import type { MusicStatus } from "./game/audio";
import { NavProvider } from "./hooks/GamepadNav";
import Menu from "./components/Menu";
import Hud from "./components/Hud";
import SettingsPanel from "./components/Settings";
import { BootLoader, Pause, Results, TouchControls } from "./components/Overlays";

const BEST_KEY = "apexrush.best.v1";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const touchRef = useRef<Record<string, unknown>>({});

  const [engineReady, setEngineReady] = useState(false);
  const [mode, setMode] = useState<"menu" | "race">("menu");
  const [menuStep, setMenuStep] = useState<"home" | "garage" | "event">("home");
  const [booting, setBooting] = useState(true);
  const [bootStatus, setBootStatus] = useState("Starting engine");
  const [bootProgress, setBootProgress] = useState(0.05);
  const [trackId, setTrackId] = useState(TRACKS[0].id);
  const [carId, setCarId] = useState(CARS[0].id);
  const [difficulty, setDifficulty] = useState(1);
  const [opponents, setOpponents] = useState(5);
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [newRecord, setNewRecord] = useState(false);
  const [muted, setMuted] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [music, setMusic] = useState<{ title: string; status: MusicStatus }>({
    title: "",
    status: "idle",
  });
  const [fps, setFps] = useState(60);
  const [padConnected, setPadConnected] = useState(false);
  const [padName, setPadName] = useState("");
  const [inputDevice, setInputDevice] = useState<InputDevice>("keyboard");
  const [best, setBest] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const accent = "#ff4a15";

  /* ---------------- engine bootstrap ---------------- */
  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    if (!engineRef.current) {
      const e = new Engine(canvasRef.current, wrapRef.current);
      e.onFinish = (r) => {
        setResult(r);
        setBest((prev) => {
          const cur = prev[r.trackId];
          if (!cur || (r.bestLap > 0 && r.bestLap < cur)) {
            const next = { ...prev, [r.trackId]: r.bestLap };
            try {
              localStorage.setItem(BEST_KEY, JSON.stringify(next));
            } catch {
              /* ignore */
            }
            setNewRecord(true);
            return next;
          }
          return prev;
        });
      };
      e.sfx.music.onChange = () =>
        setMusic({ title: e.sfx.music.title, status: e.sfx.music.status });
      e.onInputDevice = (d) => setInputDevice(d);
      engineRef.current = e;
      setEngineReady(true);
    }
    engineRef.current.start();
    return () => engineRef.current?.stop();
  }, []);

  /* ---------------- settings persistence + application ---------------- */
  useEffect(() => {
    saveSettings(settings);
    engineRef.current?.applySettings(settings);
  }, [settings, engineReady]);

  /* ---------------- one-time boot preload ---------------- */
  useEffect(() => {
    if (!engineReady) return;
    let cancelled = false;
    const e = engineRef.current;
    if (!e) return;

    (async () => {
      // 1. Preload every car model, one at a time (keeps peak memory low and
      //    lets us report exactly which vehicle is downloading).
      const models = CARS.filter((c) => c.modelUrl);
      for (let i = 0; i < models.length; i++) {
        if (cancelled) return;
        setBootStatus(`Loading ${models[i].name}`);
        setBootProgress(0.1 + (i / Math.max(1, models.length)) * 0.6);
        await preloadGlb(models[i].modelUrl!);
      }
      if (cancelled) return;

      // 2. Build the opening scene once so the menu has a live 3D backdrop.
      setBootStatus("Building circuit");
      setBootProgress(0.8);
      e.loadRace(trackId, carId, 3, difficulty, true);
      e.applySettings(settings);
      e.setPreviewMode("track");

      // 3. Let the first frames render before revealing the menu.
      setBootStatus("Warming up");
      setBootProgress(0.95);
      await new Promise((r) => setTimeout(r, 180));
      if (cancelled) return;

      setBootProgress(1);
      setBootStatus("Ready");
      setBooting(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady]);

  /* ---------------- controller polling for UI hints ---------------- */
  useEffect(() => {
    const id = window.setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      setPadConnected(e.gamepad.connected);
      setPadName(e.gamepad.friendlyName());
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  /* ---------------- fps sampling for the settings panel ---------------- */
  useEffect(() => {
    if (!showSettings) return;
    const id = window.setInterval(() => setFps(engineRef.current?.telemetry.fps ?? 60), 600);
    return () => window.clearInterval(id);
  }, [showSettings]);

  /* ---------------- menu state sync ---------------- */
  useEffect(() => {
    const e = engineRef.current;
    if (!e || mode !== "menu") return;
    e.setPreviewMode(menuStep === "garage" ? "garage" : "track");
  }, [menuStep, mode]);

  /* ---------------- rebuild the preview world for the menu ---------------- */
  // No loading overlay here — the scene simply swaps in place. Runs when the
  // track changes or when we return to the menu from a race.
  useEffect(() => {
    const e = engineRef.current;
    if (!e || booting || mode !== "menu") return;
    e.loadRace(trackId, carId, 3, difficulty, true);
    e.applySettings(settings);
    e.setPreviewMode(menuStep === "garage" ? "garage" : "track");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, mode]);

  /* ---------------- pause handling ---------------- */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code !== "Escape" && ev.code !== "KeyP") return;
      if (showSettings) {
        setShowSettings(false);
        return;
      }
      if (mode !== "race" || result) return;
      setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, result, showSettings]);

  useEffect(() => {
    const e = engineRef.current;
    if (e) e.paused = paused || showSettings;
  }, [paused, showSettings]);

  useEffect(() => {
    engineRef.current?.setMuted(muted);
  }, [muted]);

  /* ---------------- audio kickoff on first gesture ---------------- */
  const kickAudio = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.sfx.resume();
    e.applySettings(settings);
    if (settings.audio.musicEnabled && !muted) e.sfx.music.start();
  }, [settings, muted]);

  useEffect(() => {
    const handler = () => kickAudio();
    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [kickAudio]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e?.sfx.ready) return;
    if (muted || !settings.audio.musicEnabled) e.sfx.music.setEnabled(false);
    else {
      e.sfx.music.setEnabled(true);
      e.sfx.music.start();
    }
  }, [muted, settings.audio.musicEnabled]);

  /* ---------------- actions ---------------- */
  const startRace = useCallback(
    (tid = trackId, cid = carId) => {
      const e = engineRef.current;
      if (!e) return;
      e.sfx.resume();
      if (settings.audio.musicEnabled && !muted) e.sfx.music.start();
      setResult(null);
      setNewRecord(false);
      setPaused(false);
      setMode("race");
      // Build and start immediately — the scene just changes, no loading screen.
      e.setMuted(muted);
      e.loadRace(tid, cid, opponents, difficulty, false);
      e.applySettings(settings);
      e.beginCountdown();
    },
    [trackId, carId, opponents, difficulty, muted, settings],
  );

  const quitToMenu = useCallback(() => {
    setPaused(false);
    setResult(null);
    setMode("menu");
  }, []);

  const nextTrack = useCallback(() => {
    const idx = TRACKS.findIndex((t) => t.id === trackId);
    const next = TRACKS[(idx + 1) % TRACKS.length];
    setTrackId(next.id);
    startRace(next.id, carId);
  }, [trackId, carId, startRace]);

  const handleCarSwap = useCallback((id: string) => {
    setCarId(id);
    engineRef.current?.swapPlayerCar(id);
  }, []);

  const handleTouch = useCallback((c: Record<string, unknown>) => {
    touchRef.current = { ...touchRef.current, ...c };
    engineRef.current?.setTouch(touchRef.current as never);
  }, []);

  const musicLabel = settings.audio.musicEnabled && !muted && music.status === "playing" ? music.title : "";

  return (
    <NavProvider>
      <div ref={wrapRef} className="relative h-screen w-screen overflow-hidden bg-[#05070d]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]" />

      <div className="absolute inset-0 z-20">
        {mode === "menu" && !booting && (
          <div className="animate-fade absolute inset-0">
            <Menu
              step={menuStep}
              setStep={setMenuStep}
              trackId={trackId}
              carId={carId}
              onTrack={setTrackId}
              onCar={handleCarSwap}
              difficulty={difficulty}
              setDifficulty={setDifficulty}
              opponents={opponents}
              setOpponents={setOpponents}
              onStart={() => startRace()}
              best={best}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onSettings={() => setShowSettings(true)}
              musicTitle={musicLabel}
              padConnected={padConnected}
              padName={padName}
              inputDevice={inputDevice}
              lang={settings.gameplay.language}
              onClick={() => engineRef.current?.uiClick()}
              onHover={() => engineRef.current?.uiHover()}
              onWhoosh={(d) => engineRef.current?.uiWhoosh(d)}
            />
          </div>
        )}

        {mode === "race" && !booting && engineRef.current && (
          <>
            <Hud
              engine={engineRef.current}
              accent={accent}
              onPause={() => setPaused(true)}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              hud={settings.gameplay}
              showFps={settings.video.showFps}
              musicTitle={musicLabel}
              lang={settings.gameplay.language}
              onClick={() => engineRef.current?.uiClick()}
              onHover={() => engineRef.current?.uiHover()}
            />
            <TouchControls onInput={handleTouch} />
          </>
        )}

        {paused && !result && !showSettings && (
          <Pause
            accent={accent}
            onResume={() => setPaused(false)}
            onRestart={() => {
              setPaused(false);
              engineRef.current?.restart();
            }}
            onQuit={quitToMenu}
            onSettings={() => setShowSettings(true)}
            lang={settings.gameplay.language}
            onClick={() => engineRef.current?.uiClick()}
            onHover={() => engineRef.current?.uiHover()}
          />
        )}

        {result && !showSettings && (
          <Results
            result={result}
            accent={accent}
            isBest={newRecord}
            onRetry={() => startRace()}
            onNext={nextTrack}
            onMenu={quitToMenu}
            lang={settings.gameplay.language}
            onClick={() => engineRef.current?.uiClick()}
            onHover={() => engineRef.current?.uiHover()}
          />
        )}

        {showSettings && (
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
            accent={accent}
            fps={fps}
            music={{
              title: music.title,
              status: music.status,
              onNext: () => { engineRef.current?.uiClick(); engineRef.current?.sfx.music.next(); },
              onPrev: () => { engineRef.current?.uiClick(); engineRef.current?.sfx.music.prev(); },
            }}
            onClick={() => engineRef.current?.uiClick()}
            onHover={() => engineRef.current?.uiHover()}
          />
        )}

        {booting && <BootLoader status={bootStatus} progress={bootProgress} accent={accent} />}
      </div>
      </div>
    </NavProvider>
  );
}
