export type Language = "en" | "pt-BR";

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  "pt-BR": "Português (Brasil)",
};

export const TRANSLATIONS = {
  en: {
    // General / Common
    gameTitle: "OVERTAKE",
    gameSubtitle: "LOW-POLY RACING",
    play: "PLAY",
    settings: "SETTINGS",
    back: "BACK",
    done: "DONE",
    resetAll: "RESET ALL",
    soundOn: "SOUND ON",
    soundOff: "SOUND OFF",
    soundOnShort: "ON",
    soundOffShort: "OFF",
    select: "SELECT",
    
    // Menu Steps & Sections
    selectCircuit: "SELECT CIRCUIT",
    garage: "GARAGE",
    difficulty: "DIFFICULTY",
    opponents: "OPPONENTS",
    startRace: "START RACE",
    nextCircuit: "NEXT: CIRCUIT →",
    eventSetup: "EVENT SETUP",
    carStats: "CAR STATS",
    laps: "LAPS",
    best: "BEST",
    noTime: "NO TIME SET",
    opponentsCount: "{n} OPPONENTS",

    // Stats
    statSpeed: "SPEED",
    statAccel: "ACCEL",
    statBrakes: "BRAKES",
    statGrip: "GRIP",
    statHandling: "TURN",

    // Controls Hints
    hintDrive: "W A S D — DRIVE",
    hintDrift: "SPACE — DRIFT",
    hintNitro: "SHIFT — NITRO",
    hintCamera: "C — CAMERA",
    hintPause: "ESC — PAUSE",
    padSteer: "LS — STEER",
    padGas: "RT — GAS",
    padBrake: "LT — BRAKE",
    padHandbrake: "A — DRIFT",
    padNitro: "B — NITRO",
    padCamera: "R3 — CAMERA",

    // HUD & Race
    pos: "POS",
    lap: "LAP",
    race: "RACE",
    nitro: "NITRO",
    kmh: "KM/H",
    mph: "MPH",
    go: "GO!",
    wrongWay: "⚠ WRONG WAY",
    finalLap: "FINAL LAP",
    drift: "DRIFT",
    nowPlaying: "NOW PLAYING",

    // Overlays - Pause & Results
    paused: "PAUSED",
    resume: "RESUME",
    restart: "RESTART RACE",
    quit: "QUIT TO MENU",
    place: "PLACE",
    totalTime: "TOTAL TIME",
    bestLap: "BEST LAP",
    newRecord: "· NEW RECORD!",
    finalStandings: "FINAL STANDINGS",
    lapTimes: "LAP TIMES",
    raceAgain: "RACE AGAIN",
    nextCircuitBtn: "NEXT CIRCUIT →",

    // Settings Tabs
    tabGraphics: "GRAPHICS",
    tabVideo: "VIDEO",
    tabAudio: "AUDIO",
    tabControls: "CONTROLS",
    tabGameplay: "GAMEPLAY",

    // Settings Labels & Hints
    language: "Language",
    languageHint: "Select UI language",
    stylePreset: "Visual Style",
    stylePresetHint: "Color & atmospheric post-processing profile",
    qualityPreset: "Quality Preset",
    qualityPresetHint: "Rendering performance profile (shadows, AA, particles)",
    antiAliasing: "Anti-Aliasing",
    antiAliasingHint: "MSAA smooths edges; FXAA is lighter",
    renderScale: "Render Scale",
    renderScaleHint: "Internal rendering resolution",
    shadowQuality: "Shadow Quality",
    shadowQualityHint: "Sun shadow map resolution",
    sunBeams: "Sun Beams (God Rays)",
    sunBeamsHint: "Volumetric light shafts",
    bloom: "Bloom Glow",
    bloomHint: "HDR glow around bright lights",
    motionBlur: "Motion Blur",
    motionBlurHint: "Speed blur scaling with velocity",
    chromatic: "Chromatic Aberration",
    chromaticHint: "Lens color separation near edges",
    vignette: "Vignette",
    exposure: "Exposure",
    particleDensity: "Particle Density",
    particleDensityHint: "Tyre smoke, dust & nitro effects",
    drawDistance: "Draw Distance",
    drawDistanceHint: "Atmospheric fog distance",
    showFps: "Show FPS Counter",

    // Audio Settings
    masterVolume: "Master Volume",
    musicVolume: "Music Volume",
    engineVolume: "Engine Volume",
    engineVolumeHint: "Combustion, turbo & gear whine",
    effectsVolume: "Effects Volume",
    effectsVolumeHint: "Tyres, collisions & wind",
    bgMusic: "Background Music",
    shufflePlaylist: "Shuffle Playlist",

    // Controls Settings
    keyBindings: "KEY BINDINGS",
    primaryKey: "PRIMARY",
    altKey: "ALT",
    wheelFeel: "STEERING & FEEL",
    steeringSens: "Steering Sensitivity",
    steeringSensHint: "Wheel turn ratio",
    steeringSpeed: "Steering Speed",
    steeringSpeedHint: "How quickly lock is reached",
    countersteer: "Counter-Steer Assist",
    countersteerHint: "Helps catch slides automatically",
    cameraShake: "Camera Shake",
    autoAccelerate: "Auto Accelerate",
    autoAccelerateHint: "Auto-hold throttle",
    defaultCamera: "Default Camera",
    padSection: "GAMEPAD",
    padDeadzone: "Stick Deadzone",
    padDeadzoneHint: "Smaller = twitchier, larger = reduces drift",
    padSens: "Stick Sensitivity",
    padSensHint: "Controller steering multiplier",
    padVibration: "Vibration / Rumble",
    padVibrationHint: "Haptic feedback on impacts & nitro",
    padScheme: "Controller Mapping",
    padSchemeText: "RT/LT Gas/Brake · LS Steer · A Drift · B Nitro · R3 Cam",

    // Gameplay Settings
    speedUnits: "Speed Units",
    hudMinimap: "Minimap",
    hudStandings: "Live Standings",
    hudSpeedo: "Speedometer",
    hudTimers: "Lap Timers",

    // Style Presets
    styleNormal: "NORMAL",
    styleSummer: "SUMMER",
    styleWinter: "WINTER",
    styleCinematic: "CINEMATIC",
    styleSynth: "RETRO / SYNTH",
    styleCustom: "CUSTOM",

    // Quality Presets
    qualityLow: "LOW",
    qualityMedium: "MED",
    qualityHigh: "HIGH",
    qualityUltra: "ULTRA",
    qualityCustom: "CUSTOM",

    // Cameras
    camChase: "CHASE",
    camCockpit: "COCKPIT",
    camFar: "FAR",

    // Difficulties
    diff0: "ROOKIE",
    diff1: "PRO",
    diff2: "ACE",
    diff3: "LEGEND",

    // About
    aboutTitle: "ABOUT",
    aboutText: "Overtake is a high-speed low-poly arcade racer built with Three.js. Real-time engine synthesis, dynamic weather lighting, and physics-driven drifting.",
    saveNotice: "SETTINGS SAVE AUTOMATICALLY",
  },

  "pt-BR": {
    // General / Common
    gameTitle: "OVERTAKE",
    gameSubtitle: "CORRIDA LOW-POLY",
    play: "JOGAR",
    settings: "CONFIGURAÇÕES",
    back: "VOLTAR",
    done: "CONCLUÍDO",
    resetAll: "RESTAURAR",
    soundOn: "SOM LIGADO",
    soundOff: "SOM DESLIGADO",
    soundOnShort: "LIG",
    soundOffShort: "DES",
    select: "SELECIONAR",

    // Menu Steps & Sections
    selectCircuit: "SELECIONAR CIRCUITO",
    garage: "GARAGEM",
    difficulty: "DIFICULDADE",
    opponents: "OPONENTES",
    startRace: "INICIAR CORRIDA",
    nextCircuit: "PRÓXIMO: CIRCUITO →",
    eventSetup: "CONFIGURAR EVENTO",
    carStats: "DESEMPENHO DO CARRO",
    laps: "VOLTAS",
    best: "MELHOR",
    noTime: "SEM TEMPO",
    opponentsCount: "{n} OPONENTES",

    // Stats
    statSpeed: "VELOC",
    statAccel: "ACEL",
    statBrakes: "FREIOS",
    statGrip: "GRIP",
    statHandling: "CURVA",

    // Controls Hints
    hintDrive: "W A S D — PILOTAR",
    hintDrift: "ESPAÇO — DRIFT",
    hintNitro: "SHIFT — NITRO",
    hintCamera: "C — CÂMERA",
    hintPause: "ESC — PAUSA",
    padSteer: "LS — DIREÇÃO",
    padGas: "RT — ACELERAR",
    padBrake: "LT — FREIAR",
    padHandbrake: "A — DRIFT",
    padNitro: "B — NITRO",
    padCamera: "R3 — CÂMERA",

    // HUD & Race
    pos: "POS",
    lap: "VOLTA",
    race: "CORRIDA",
    nitro: "NITRO",
    kmh: "KM/H",
    mph: "MPH",
    go: "VAI!",
    wrongWay: "⚠ CONTRAMÃO",
    finalLap: "ÚLTIMA VOLTA",
    drift: "DRIFT",
    nowPlaying: "TOCANDO AGORA",

    // Overlays - Pause & Results
    paused: "PAUSADO",
    resume: "CONTINUAR",
    restart: "REINICIAR CORRIDA",
    quit: "SAIR PARA O MENU",
    place: "LUGAR",
    totalTime: "TEMPO TOTAL",
    bestLap: "MELHOR VOLTA",
    newRecord: "· NOVO RECORDE!",
    finalStandings: "CLASSIFICAÇÃO FINAL",
    lapTimes: "TEMPOS POR VOLTA",
    raceAgain: "CORRER NOVAMENTE",
    nextCircuitBtn: "PRÓXIMO CIRCUITO →",

    // Settings Tabs
    tabGraphics: "GRÁFICOS",
    tabVideo: "VÍDEO",
    tabAudio: "ÁUDIO",
    tabControls: "CONTROLES",
    tabGameplay: "JOGABILIDADE",

    // Settings Labels & Hints
    language: "Idioma / Language",
    languageHint: "Selecione o idioma da interface",
    stylePreset: "Estilo Visual",
    stylePresetHint: "Perfil de cores e pós-processamento atmosférico",
    qualityPreset: "Qualidade Gráfica",
    qualityPresetHint: "Perfil de desempenho (sombras, serrilhado, partículas)",
    antiAliasing: "Anti-Serrilhado",
    antiAliasingHint: "MSAA suaviza bordas; FXAA é mais leve",
    renderScale: "Escala de Renderização",
    renderScaleHint: "Resolução interna de renderização",
    shadowQuality: "Qualidade das Sombras",
    shadowQualityHint: "Resolução do mapa de sombras do sol",
    sunBeams: "Raios de Sol (God Rays)",
    sunBeamsHint: "Feixes de luz volumétricos",
    bloom: "Brilho Bloom",
    bloomHint: "Brilho HDR em superfícies reluzentes",
    motionBlur: "Desenfoque de Movimento",
    motionBlurHint: "Desfoque de velocidade com a aceleração",
    chromatic: "Aberração Cromática",
    chromaticHint: "Separação de cores nas bordas da lente",
    vignette: "Efeito Vinheta",
    exposure: "Exposição / Brilho",
    particleDensity: "Densidade de Partículas",
    particleDensityHint: "Fumaça de pneu, poeira e rastros de nitro",
    drawDistance: "Distância de Visão",
    drawDistanceHint: "Alcance do nevoeiro atmosférico",
    showFps: "Exibir Contador de FPS",

    // Audio Settings
    masterVolume: "Volume Geral",
    musicVolume: "Volume da Música",
    engineVolume: "Volume do Motor",
    engineVolumeHint: "Combustão, turbo e assobio da transmissão",
    effectsVolume: "Volume dos Efeitos",
    effectsVolumeHint: "Pneus, colisões, vento e interface",
    bgMusic: "Música de Fundo",
    shufflePlaylist: "Ordem Aleatória",

    // Controls Settings
    keyBindings: "MAPEAMENTO DE TECLAS",
    primaryKey: "PRINCIPAL",
    altKey: "ALT",
    wheelFeel: "DIREÇÃO E SENSIBILIDADE",
    steeringSens: "Sensibilidade da Direção",
    steeringSensHint: "Relação de giro do volante",
    steeringSpeed: "Velocidade de Esterço",
    steeringSpeedHint: "Rapidez ao esterçar o volante",
    countersteer: "Assistente de Contra-Esterço",
    countersteerHint: "Ajuda a controlar derrapagens automaticamente",
    cameraShake: "Vibração da Câmera",
    autoAccelerate: "Aceleração Automática",
    autoAccelerateHint: "Acelera sozinho — o freio continua ativo",
    defaultCamera: "Câmera Padrão",
    padSection: "CONTROLE / GAMEPAD",
    padDeadzone: "Zona Morta do Analógico",
    padDeadzoneHint: "Menor = mais sensível; Maior = evita folgas",
    padSens: "Sensibilidade do Controle",
    padSensHint: "Multiplicador de esterço no controle",
    padVibration: "Vibração / Force Feedback",
    padVibrationHint: "Efeitos táteis em impactos e nitro",
    padScheme: "Esquema do Controle",
    padSchemeText: "RT/LT Acelera/Freia · LS Esterça · A Drift · B Nitro · R3 Câmera",

    // Gameplay Settings
    speedUnits: "Unidade de Velocidade",
    hudMinimap: "Minimapa",
    hudStandings: "Classificação em Tempo Real",
    hudSpeedo: "Velocímetro",
    hudTimers: "Cronômetro de Voltas",

    // Style Presets
    styleNormal: "NORMAL",
    styleSummer: "VERÃO",
    styleWinter: "INVERNO",
    styleCinematic: "CINEMÁTICO",
    styleSynth: "RETRO / SYNTH",
    styleCustom: "PERSONALIZADO",

    // Quality Presets
    qualityLow: "BAIXO",
    qualityMedium: "MÉDIO",
    qualityHigh: "ALTO",
    qualityUltra: "ULTRA",
    qualityCustom: "PERSONALIZADO",

    // Cameras
    camChase: "TRASEIRA",
    camCockpit: "COCKPIT",
    camFar: "DISTANTE",

    // Difficulties
    diff0: "INICIANTE",
    diff1: "PRO",
    diff2: "ÁS",
    diff3: "LENDA",

    // About
    aboutTitle: "SOBRE",
    aboutText: "Overtake é um jogo de corrida arcade low-poly criado com Three.js. Som de motor sintetizado em tempo real, iluminação dinâmica e física de drift responsiva.",
    saveNotice: "AS CONFIGURAÇÕES SÃO SALVAS AUTOMATICAMENTE",
  },
} as const;

export function t(lang: Language, key: keyof typeof TRANSLATIONS["en"], vars?: Record<string, string | number>): string {
  const dict = TRANSLATIONS[lang] ?? TRANSLATIONS["en"];
  let str: string = (dict[key] ?? TRANSLATIONS["en"][key] ?? key) as string;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}
