import {
  createSystem,
  World,
  Entity,
  Mesh,
  Group,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  IcosahedronGeometry,
  TorusGeometry,
  ConeGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Color,
  Vector3,
  AdditiveBlending,
  InputComponent,
} from '@iwsdk/core';

import type { UISystem } from './ui-system.js';
import type { AudioManager } from './audio-system.js';
import type { StatsTracker } from './stats-tracker.js';

// ── Constants ─────────────────────────────────────────────────

const LANE_WIDTH = 2;
const LANE_POSITIONS = [-LANE_WIDTH, 0, LANE_WIDTH];
const BASE_SPEED = 10;
const MAX_SPEED = 45;
const SPEED_INCREASE_RATE = 0.12;
const LANE_SWITCH_SPEED = 14;
const LANE_SWITCH_COOLDOWN = 0.12;
const SPAWN_Z = -90;
const DESPAWN_Z = 12;
const INITIAL_LIVES = 3;
const INVINCIBILITY_TIME = 1.8;
const ORB_BASE_SCORE = 100;
const DISTANCE_SCORE_RATE = 10;
const MAX_MULTIPLIER = 10;
const MULTIPLIER_DECAY_TIME = 2.5;
const OBSTACLE_BASE_INTERVAL = 1.4;
const OBSTACLE_MIN_INTERVAL = 0.35;
const COLLECTIBLE_INTERVAL = 0.6;

// ── Round 2 Constants ─────────────────────────────────────────
const PARTICLE_POOL_SIZE = 80;
const POWERUP_POOL_PER_TYPE = 4;
const POWERUP_SPAWN_INTERVAL = 18;
const POWERUP_MAGNET_DURATION = 8;
const POWERUP_SLOWMO_DURATION = 5;
const POWERUP_SLOWMO_FACTOR = 0.6;
const POWERUP_DOUBLE_POINTS_DURATION = 10;
const POWERUP_PHASE_DURATION = 4;
const SHAKE_DECAY = 8;
const WAVE_REST_DURATION = 3;

// ── Floor pulse constants ─────────────────────────────────
const FLOOR_PULSE_COUNT = 6;
const FLOOR_PULSE_SPEED = 30; // m/s down corridor

// ── Types ─────────────────────────────────────────────────────

export enum GameState {
  MENU = 'menu',
  MODE_SELECT = 'mode_select',
  SETTINGS = 'settings',
  ACHIEVEMENTS = 'achievements',
  TUTORIAL = 'tutorial',
  STATS = 'stats',
  LEADERBOARD = 'leaderboard',
  COUNTDOWN = 'countdown',
  PLAYING = 'playing',
  PAUSED = 'paused',
  GAME_OVER = 'game_over',
}

export enum GameMode {
  CLASSIC = 'classic',
  SPRINT = 'sprint',
  TIME_ATTACK = 'time_attack',
  ZEN = 'zen',
  ENDLESS = 'endless',
  CHALLENGE = 'challenge',
}

export enum PowerUpType {
  SHIELD = 'shield',
  MAGNET = 'magnet',
  SLOW_MO = 'slow_mo',
  DOUBLE_POINTS = 'double_points',
  PHASE = 'phase',
}

export interface GameModeConfig {
  name: string;
  description: string;
  lives: number;
  hasObstacles: boolean;
  timeLimit: number; // 0 = no limit
  targetDistance: number; // 0 = no target
  speedMultiplier: number;
}

export const GAME_MODES: Record<GameMode, GameModeConfig> = {
  [GameMode.CLASSIC]: {
    name: 'Classic',
    description: '3 lives - survive as far as you can',
    lives: 3,
    hasObstacles: true,
    timeLimit: 0,
    targetDistance: 0,
    speedMultiplier: 1,
  },
  [GameMode.SPRINT]: {
    name: 'Sprint',
    description: 'Race to 2000m as fast as possible',
    lives: 1,
    hasObstacles: true,
    timeLimit: 0,
    targetDistance: 2000,
    speedMultiplier: 1.3,
  },
  [GameMode.TIME_ATTACK]: {
    name: 'Time Attack',
    description: '90 seconds - maximize your distance',
    lives: 99,
    hasObstacles: true,
    timeLimit: 90,
    targetDistance: 0,
    speedMultiplier: 1.1,
  },
  [GameMode.ZEN]: {
    name: 'Zen',
    description: 'No obstacles - just run and collect',
    lives: 99,
    hasObstacles: false,
    timeLimit: 0,
    targetDistance: 0,
    speedMultiplier: 0.8,
  },
  [GameMode.ENDLESS]: {
    name: 'Endless',
    description: 'One life - how far can you go?',
    lives: 1,
    hasObstacles: true,
    timeLimit: 0,
    targetDistance: 0,
    speedMultiplier: 1.2,
  },
  [GameMode.CHALLENGE]: {
    name: 'Challenge',
    description: 'Preset wave patterns - 5 lives',
    lives: 5,
    hasObstacles: true,
    timeLimit: 0,
    targetDistance: 0,
    speedMultiplier: 1,
  },
};

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  progress: number;
  target: number;
}

interface ObstacleObj {
  group: Group;
  lane: number;
  active: boolean;
  width: number;
}

interface CollectibleObj {
  mesh: Mesh;
  lane: number;
  active: boolean;
  pulsePhase: number;
  value: number;
}

interface Particle {
  mesh: Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

interface PowerUpObj {
  group: Group;
  type: PowerUpType;
  lane: number;
  active: boolean;
}

export interface CorridorRefs {
  floorMat: MeshStandardMaterial;
  wallMat: MeshStandardMaterial;
  gridMat: { color: Color };
  laneMat: { color: Color };
  trimMat: { color: Color };
  beamMat: MeshStandardMaterial;
  pointLights: Array<{ color: Color }>;
}

interface EnvColorZone {
  dist: number;
  primary: Color;
  wallEmissive: Color;
  floorEmissive: Color;
  bg: Color;
}

interface WavePattern {
  name: string;
  duration: number;
  spawnInterval: number;
  patterns: number[][];
}

// ── Materials ─────────────────────────────────────────────────

const OBSTACLE_COLORS = [
  new Color(0xff0044),
  new Color(0xff4400),
  new Color(0xff00ff),
  new Color(0xff8800),
];

const COLLECTIBLE_COLORS = [
  new Color(0x00ffff),
  new Color(0x00ff88),
  new Color(0xffff00),
  new Color(0x88ff00),
];

function createObstacleMaterial(color: Color): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.4),
    emissive: color,
    emissiveIntensity: 2.5,
    transparent: true,
    opacity: 0.85,
  });
}

function createCollectibleMaterial(color: Color): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.3),
    emissive: color,
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.8,
  });
}

function createGlowMaterial(color: Color): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.3,
    blending: AdditiveBlending,
  });
}

// ── Obstacle Geometry Factories ───────────────────────────────

function createBarrierObstacle(color: Color): Group {
  const group = new Group();
  const mat = createObstacleMaterial(color);
  const body = new Mesh(new BoxGeometry(1.6, 1.8, 0.3), mat);
  body.position.y = 0.9;
  group.add(body);
  // Edge glow
  const glowMat = createGlowMaterial(color);
  const glow = new Mesh(new BoxGeometry(1.8, 2, 0.5), glowMat);
  glow.position.y = 1;
  group.add(glow);
  return group;
}

function createColumnObstacle(color: Color): Group {
  const group = new Group();
  const mat = createObstacleMaterial(color);
  const body = new Mesh(new CylinderGeometry(0.35, 0.35, 2.5, 8), mat);
  body.position.y = 1.25;
  group.add(body);
  const glowMat = createGlowMaterial(color);
  const glow = new Mesh(new CylinderGeometry(0.5, 0.5, 2.7, 8), glowMat);
  glow.position.y = 1.35;
  group.add(glow);
  return group;
}

function createDoubleBarrierObstacle(color: Color): Group {
  const group = new Group();
  const mat = createObstacleMaterial(color);
  const left = new Mesh(new BoxGeometry(0.6, 2.2, 0.25), mat);
  left.position.set(-0.5, 1.1, 0);
  group.add(left);
  const right = new Mesh(new BoxGeometry(0.6, 2.2, 0.25), mat);
  right.position.set(0.5, 1.1, 0);
  group.add(right);
  const top = new Mesh(new BoxGeometry(1.6, 0.25, 0.25), mat);
  top.position.set(0, 2.2, 0);
  group.add(top);
  return group;
}

function createPyramidObstacle(color: Color): Group {
  const group = new Group();
  const mat = createObstacleMaterial(color);
  const body = new Mesh(new ConeGeometry(0.6, 2, 4), mat);
  body.position.y = 1;
  body.rotation.y = Math.PI / 4;
  group.add(body);
  const glowMat = createGlowMaterial(color);
  const glow = new Mesh(new ConeGeometry(0.75, 2.2, 4), glowMat);
  glow.position.y = 1.1;
  glow.rotation.y = Math.PI / 4;
  group.add(glow);
  return group;
}

function createDiamondObstacle(color: Color): Group {
  const group = new Group();
  const mat = createObstacleMaterial(color);
  const body = new Mesh(new OctahedronGeometry(0.7, 0), mat);
  body.position.y = 1.2;
  group.add(body);
  const glowMat = createGlowMaterial(color);
  const glow = new Mesh(new OctahedronGeometry(0.85, 0), glowMat);
  glow.position.y = 1.2;
  group.add(glow);
  return group;
}

type ObstacleFactory = (color: Color) => Group;
const OBSTACLE_FACTORIES: ObstacleFactory[] = [
  createBarrierObstacle,
  createColumnObstacle,
  createDoubleBarrierObstacle,
  createPyramidObstacle,
  createDiamondObstacle,
];

// ── Environment Color Zones ───────────────────────────────────

const ENV_COLOR_ZONES: EnvColorZone[] = [
  { dist: 0,    primary: new Color(0x00ffff), wallEmissive: new Color(0x0044aa), floorEmissive: new Color(0x001133), bg: new Color(0x000811) },
  { dist: 500,  primary: new Color(0x00ff88), wallEmissive: new Color(0x004422), floorEmissive: new Color(0x001a0d), bg: new Color(0x000a04) },
  { dist: 1500, primary: new Color(0xff00ff), wallEmissive: new Color(0x440044), floorEmissive: new Color(0x1a001a), bg: new Color(0x0a0011) },
  { dist: 3000, primary: new Color(0xff4400), wallEmissive: new Color(0x440000), floorEmissive: new Color(0x1a0500), bg: new Color(0x110200) },
];

// ── Challenge Wave Patterns ───────────────────────────────────

const CHALLENGE_WAVES: WavePattern[] = [
  { name: 'Wave 1', duration: 15, spawnInterval: 1.2,
    patterns: [[0], [1], [2], [0], [2], [1]] },
  { name: 'Wave 2', duration: 18, spawnInterval: 1.0,
    patterns: [[0, 1], [1, 2], [0, 2], [0, 1], [1, 2], [0, 2]] },
  { name: 'Wave 3', duration: 15, spawnInterval: 0.8,
    patterns: [[0], [2], [0], [2], [1], [0], [2], [1]] },
  { name: 'Wave 4', duration: 18, spawnInterval: 0.7,
    patterns: [[0, 1], [0, 1], [0, 1], [1, 2], [1, 2], [1, 2], [0, 2], [0, 2]] },
  { name: 'Boss Wave', duration: 12, spawnInterval: 0.5,
    patterns: [[0, 1], [1, 2], [0, 2], [0, 1], [1, 2], [0, 2]] },
];

// ── GameSystem ────────────────────────────────────────────────

// Runtime InputManager has keyboard; types expose only XRInputManager
interface KeyboardLike {
  getKeyDown(code: string): boolean;
  getKeyPressed(code: string): boolean;
  getKeyUp(code: string): boolean;
}

export class GameSystem extends createSystem({}) {
  private worldRef!: World;
  private uiSystem!: UISystem;
  private audio!: AudioManager;
  private stats!: StatsTracker;

  /** Access keyboard via the runtime InputManager (not exposed in types) */
  _kb(): KeyboardLike {
    return (this.input as unknown as { keyboard: KeyboardLike }).keyboard;
  }

  // Game state
  state: GameState = GameState.MENU;
  mode: GameMode = GameMode.CLASSIC;
  modeConfig: GameModeConfig = GAME_MODES[GameMode.CLASSIC];

  // Settings
  screenShakeEnabled = true;
  speedLinesEnabled = true;

  // Player
  private playerLane = 1; // 0=left, 1=center, 2=right
  private playerX = 0;
  private targetX = 0;
  private laneSwitchCooldown = 0;

  // Scoring
  score = 0;
  distance = 0;
  speed = BASE_SPEED;
  lives = INITIAL_LIVES;
  multiplier = 1;
  private multiplierTimer = 0;
  orbsCollected = 0;
  private invincibilityTimer = 0;
  elapsedTime = 0;
  maxSpeed = 0;
  private totalOrbsThisRun = 0;
  longestCombo = 0;
  private currentCombo = 0;

  // Track objects
  private obstacles: ObstacleObj[] = [];
  private collectibles: CollectibleObj[] = [];
  private obstacleSpawnTimer = 0;
  private collectibleSpawnTimer = 0;

  // Player visual
  private playerMesh!: Mesh;
  private playerGlow!: Mesh;

  // Speed lines
  private speedLines: Mesh[] = [];

  // High scores
  highScores: Record<string, number> = {};
  isNewRecord = false;

  // Achievements
  achievements: Achievement[] = [];

  // Challenge mode waves
  private challengeWave = 0;
  private challengeTimer = 0;

  // Countdown
  countdownValue = 3;
  private countdownTimer = 0;

  // ── Round 2 State ─────────────────────────────────────────

  // Particles
  private particles: Particle[] = [];

  // Power-ups
  private powerUps: PowerUpObj[] = [];
  private powerUpSpawnTimer = 0;
  activePowerUp: PowerUpType | null = null;
  powerUpTimer = 0;
  powerUpMaxTime = 0;
  private hasShield = false;
  powerUpsCollected = 0;

  // Round 4 tracking
  private phaseDodgesThisActivation = 0;
  private doublePointsScoreStart = 0;
  private powerUpTypesCollected = new Set<PowerUpType>();

  // Round 5: Near-miss detection
  nearMissTimer = 0; // timer for HUD display
  nearMissCount = 0; // count this run
  private nearMissedObstacles = new Set<ObstacleObj>(); // prevent double-counting

  // Round 5: Distance milestones
  milestoneTimer = 0;
  milestoneText = '';
  private lastMilestone = 0;
  private readonly MILESTONE_DISTANCES = [100, 250, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000];

  // Round 5: Lane tracking for all-lanes achievement
  private recentLanes: Array<{ lane: number; time: number }> = [];

  // Round 5: No-orbs distance tracking
  private distanceSinceLastOrb = 0;
  private distanceSinceLastHit = 0;

  // Round 5: Star field
  private starField: Mesh[] = [];
  private static readonly STAR_COUNT = 60;

  // Round 5: Player trail
  private trailSegments: Mesh[] = [];
  private static readonly TRAIL_LENGTH = 15;
  private trailPositions: Array<{ x: number; z: number }> = [];

  // Round 5: Difficulty zone
  currentZoneName = '';
  zoneChangeTimer = 0;

  // Round 6: Wall holograms
  private wallHolograms: Mesh[] = [];
  private static readonly HOLO_COUNT = 10;

  // Round 6: Warning markers
  private warningMarkers: Mesh[] = [];
  private static readonly WARNING_COUNT = 8;

  // Round 6: Performance rating
  rating = '';

  // Round 6: Tracking
  private flawlessRun = true; // no hits taken
  private speed25Time = -1; // time when 25 m/s reached

  // Round 7: Polish
  private baseFov = 75;
  deathExplosionTimer = 0;
  comboFlashTimer = 0;
  private bestRunDistance = 0; // for revival prompt awareness

  // Challenge waves (extended)
  private challengeWaveTimer = 0;
  private challengeRestTimer = 0;
  private inWaveRest = false;
  private waveSpawnTimer = 0;
  private wavePatternIdx = 0;
  challengeWaveNum = 0; // 1-based for display

  // Environment color
  private corridorRefs: CorridorRefs | null = null;
  private _tmpPrimary = new Color();
  private _tmpWall = new Color();
  private _tmpFloor = new Color();
  private _tmpBg = new Color();

  // Screen shake
  private shakeIntensity = 0;

  // Floor pulse waves
  private floorPulses: Mesh[] = [];

  // Phase visual effect
  private phaseGlow: Mesh | null = null;

  setRefs(refs: { world: World; uiSystem: UISystem; corridorRefs?: CorridorRefs; audioManager?: AudioManager; statsTracker?: StatsTracker }) {
    this.worldRef = refs.world;
    this.uiSystem = refs.uiSystem;
    if (refs.corridorRefs) this.corridorRefs = refs.corridorRefs;
    if (refs.audioManager) this.audio = refs.audioManager;
    if (refs.statsTracker) this.stats = refs.statsTracker;
    this.loadPrefs();
  }

  init() {
    this.initAchievements();
    this.loadHighScores();
    this.loadPrefs();
    this.createPlayerVisual();
    this.createSpeedLines();
    this.createObstaclePool();
    this.createCollectiblePool();
    this.createParticlePool();
    this.createPowerUpPool();
    this.createFloorPulses();
    this.createPhaseGlow();
    this.createStarField();
    this.createPlayerTrail();
    this.createWallHolograms();
    this.createWarningMarkers();
    this.hidePlayerVisual();
  }

  private loadPrefs() {
    try {
      const data = localStorage.getItem('neon-sprint-prefs');
      if (data) {
        const p = JSON.parse(data);
        if (typeof p.screenShake === 'boolean') this.screenShakeEnabled = p.screenShake;
        if (typeof p.speedLines === 'boolean') this.speedLinesEnabled = p.speedLines;
      }
    } catch { /* ignore */ }
  }

  savePrefs() {
    try {
      localStorage.setItem('neon-sprint-prefs', JSON.stringify({
        screenShake: this.screenShakeEnabled,
        speedLines: this.speedLinesEnabled,
      }));
    } catch { /* ignore */ }
  }

  resetHighScores() {
    this.highScores = {};
    this.saveHighScores();
  }

  resetAllData() {
    this.highScores = {};
    this.saveHighScores();
    for (const a of this.achievements) {
      a.unlocked = false;
      a.progress = 0;
    }
    this.saveAchievements();
    if (this.stats) this.stats.reset();
    try { localStorage.removeItem('neon-sprint-prefs'); } catch { /* ignore */ }
    this.screenShakeEnabled = true;
    this.speedLinesEnabled = true;
  }

  private initAchievements() {
    const defs: [string, string, string, number][] = [
      ['first-run', 'First Steps', 'Complete your first run', 1],
      ['distance-100', 'Warming Up', 'Travel 100 meters', 100],
      ['distance-500', 'Getting There', 'Travel 500 meters', 500],
      ['distance-1000', 'Kilometer Club', 'Travel 1,000 meters', 1000],
      ['distance-2500', 'Long Hauler', 'Travel 2,500 meters', 2500],
      ['distance-5000', 'Marathon Runner', 'Travel 5,000 meters', 5000],
      ['distance-10000', 'Ultra Runner', 'Travel 10,000 meters', 10000],
      ['score-1000', 'Score Seeker', 'Score 1,000 points', 1000],
      ['score-5000', 'Point Master', 'Score 5,000 points', 5000],
      ['score-10000', 'Score Legend', 'Score 10,000 points', 10000],
      ['score-50000', 'High Roller', 'Score 50,000 points', 50000],
      ['score-100000', 'Score King', 'Score 100,000 points', 100000],
      ['orbs-10', 'Collector', 'Collect 10 orbs in one run', 10],
      ['orbs-50', 'Hoarder', 'Collect 50 orbs in one run', 50],
      ['orbs-100', 'Orb Master', 'Collect 100 orbs in one run', 100],
      ['orbs-250', 'Orb Legend', 'Collect 250 orbs in one run', 250],
      ['multiplier-3', 'Combo Starter', 'Reach 3x multiplier', 3],
      ['multiplier-5', 'Combo Expert', 'Reach 5x multiplier', 5],
      ['multiplier-8', 'Combo Master', 'Reach 8x multiplier', 8],
      ['multiplier-10', 'Combo King', 'Reach max multiplier', 10],
      ['speed-20', 'Picking Up Pace', 'Reach 20 m/s', 20],
      ['speed-30', 'Speed Demon', 'Reach 30 m/s', 30],
      ['speed-40', 'Light Speed', 'Reach 40 m/s', 40],
      ['mode-classic', 'Classic Runner', 'Complete a Classic run', 1],
      ['mode-sprint', 'Sprint Champion', 'Complete Sprint mode', 1],
      ['mode-time', 'Time Keeper', 'Complete Time Attack', 1],
      ['mode-zen', 'Inner Peace', 'Play Zen mode', 1],
      ['mode-endless', 'No Limits', 'Play Endless mode', 1],
      ['mode-challenge', 'Challenger', 'Play Challenge mode', 1],
      ['combo-10', 'Hot Streak', 'Get a 10-orb combo', 10],
      ['combo-25', 'On Fire', 'Get a 25-orb combo', 25],
      ['combo-50', 'Unstoppable', 'Get a 50-orb combo', 50],
      ['survivor-60', 'Minute Man', 'Survive for 60 seconds', 60],
      ['survivor-180', 'Three Minutes', 'Survive for 3 minutes', 180],
      ['survivor-300', 'Five Alive', 'Survive for 5 minutes', 300],
      ['close-call', 'Close Call', 'Switch lanes to dodge at last moment', 1],
      ['perfect-sprint', 'Perfect Sprint', 'Sprint with no hits', 1],
      ['no-orbs', 'Minimalist', 'Travel 500m without collecting orbs', 500],
      ['all-lanes', 'Lane Hopper', 'Use all 3 lanes in 5 seconds', 1],
      ['speed-king', 'Speed King', 'Reach max speed in any mode', 1],
      // Round 4 achievements
      ['powerup-5', 'Power Hungry', 'Collect 5 power-ups in one run', 5],
      ['powerup-10', 'Power Addict', 'Collect 10 power-ups in one run', 10],
      ['double-pts', 'Double Trouble', 'Score 5000 points during Double Points', 5000],
      ['phase-dodge', 'Ghost Runner', 'Phase through 3 obstacles in one activation', 3],
      ['all-powerups', 'Full Arsenal', 'Collect all 5 power-up types in one run', 5],
      ['combo-100', 'Century Streak', 'Get a 100-orb combo', 100],
      ['distance-20000', 'Ultramarathon', 'Travel 20,000 meters', 20000],
      ['survivor-600', 'Iron Will', 'Survive for 10 minutes', 600],
      // Round 5 achievements
      ['near-miss-5', 'Daredevil', 'Get 5 near-misses in one run', 5],
      ['near-miss-15', 'Adrenaline Junkie', 'Get 15 near-misses in one run', 15],
      ['near-miss-30', 'Death Wish', 'Get 30 near-misses in one run', 30],
      ['milestone-5k', 'Five K', 'Reach the 5km milestone', 1],
      ['milestone-10k', 'Ten K', 'Reach the 10km milestone', 1],
      ['perfect-run-500', 'Untouchable', 'Travel 500m without taking damage', 500],
      // Round 6 achievements
      ['flawless-classic', 'Flawless', 'Complete Classic with all 3 lives', 1],
      ['speed-start', 'Quick Start', 'Reach 25 m/s in under 45 seconds', 1],
      ['endurance-1k', 'Endurance', 'Travel 1000m in Endless mode', 1000],
      ['rating-s', 'S-Rank', 'Earn an S rating on any mode', 1],
      // Round 7 achievements
      ['combo-200', 'Double Century', 'Get a 200-orb combo', 200],
      ['speed-max-classic', 'Terminal Velocity', 'Reach max speed in Classic mode', 1],
      ['all-modes', 'Versatile', 'Play all 6 game modes', 6],
      ['near-miss-50', 'Razor Edge', 'Get 50 near-misses in one run', 50],
      ['powerup-20', 'Power Junkie', 'Collect 20 power-ups in one run', 20],
    ];

    this.achievements = defs.map(([id, name, description, target]) => ({
      id, name, description, unlocked: false, progress: 0, target,
    }));

    this.loadAchievements();
  }

  private loadHighScores() {
    try {
      const data = localStorage.getItem('neon-sprint-scores');
      if (data) this.highScores = JSON.parse(data);
    } catch { /* ignore */ }
  }

  private saveHighScores() {
    try {
      localStorage.setItem('neon-sprint-scores', JSON.stringify(this.highScores));
    } catch { /* ignore */ }
  }

  private loadAchievements() {
    try {
      const data = localStorage.getItem('neon-sprint-achievements');
      if (data) {
        const saved = JSON.parse(data) as Record<string, boolean>;
        for (const a of this.achievements) {
          if (saved[a.id]) a.unlocked = true;
        }
      }
    } catch { /* ignore */ }
  }

  private saveAchievements() {
    try {
      const map: Record<string, boolean> = {};
      for (const a of this.achievements) {
        if (a.unlocked) map[a.id] = true;
      }
      localStorage.setItem('neon-sprint-achievements', JSON.stringify(map));
    } catch { /* ignore */ }
  }

  private unlockAchievement(id: string) {
    const a = this.achievements.find(x => x.id === id);
    if (a && !a.unlocked) {
      a.unlocked = true;
      this.saveAchievements();
      this.uiSystem?.showAchievementToast(a.name);
      this.audio?.playAchievement();
    }
  }

  private checkAchievements() {
    // Distance achievements
    const distChecks: [string, number][] = [
      ['distance-100', 100], ['distance-500', 500], ['distance-1000', 1000],
      ['distance-2500', 2500], ['distance-5000', 5000], ['distance-10000', 10000],
    ];
    for (const [id, target] of distChecks) {
      if (this.distance >= target) this.unlockAchievement(id);
    }

    // Score achievements
    const scoreChecks: [string, number][] = [
      ['score-1000', 1000], ['score-5000', 5000], ['score-10000', 10000],
      ['score-50000', 50000], ['score-100000', 100000],
    ];
    for (const [id, target] of scoreChecks) {
      if (this.score >= target) this.unlockAchievement(id);
    }

    // Orb achievements
    const orbChecks: [string, number][] = [
      ['orbs-10', 10], ['orbs-50', 50], ['orbs-100', 100], ['orbs-250', 250],
    ];
    for (const [id, target] of orbChecks) {
      if (this.totalOrbsThisRun >= target) this.unlockAchievement(id);
    }

    // Multiplier achievements
    const multChecks: [string, number][] = [
      ['multiplier-3', 3], ['multiplier-5', 5], ['multiplier-8', 8], ['multiplier-10', 10],
    ];
    for (const [id, target] of multChecks) {
      if (this.multiplier >= target) this.unlockAchievement(id);
    }

    // Speed achievements
    const speedChecks: [string, number][] = [
      ['speed-20', 20], ['speed-30', 30], ['speed-40', 40],
    ];
    for (const [id, target] of speedChecks) {
      if (this.speed >= target) this.unlockAchievement(id);
    }
    if (this.speed >= MAX_SPEED) this.unlockAchievement('speed-king');

    // Combo achievements
    const comboChecks: [string, number][] = [
      ['combo-10', 10], ['combo-25', 25], ['combo-50', 50],
    ];
    for (const [id, target] of comboChecks) {
      if (this.currentCombo >= target) this.unlockAchievement(id);
    }

    // Survival achievements
    const survChecks: [string, number][] = [
      ['survivor-60', 60], ['survivor-180', 180], ['survivor-300', 300], ['survivor-600', 600],
    ];
    for (const [id, target] of survChecks) {
      if (this.elapsedTime >= target) this.unlockAchievement(id);
    }

    // Round 4: Power-up count achievements
    if (this.powerUpsCollected >= 5) this.unlockAchievement('powerup-5');
    if (this.powerUpsCollected >= 10) this.unlockAchievement('powerup-10');

    // Round 4: Combo 100
    if (this.currentCombo >= 100) this.unlockAchievement('combo-100');

    // Round 4: Distance 20k
    if (this.distance >= 20000) this.unlockAchievement('distance-20000');

    // Round 5: No-orbs achievement
    if (this.distanceSinceLastOrb >= 500) this.unlockAchievement('no-orbs');

    // Round 5: Near-miss achievements
    if (this.nearMissCount >= 5) this.unlockAchievement('near-miss-5');
    if (this.nearMissCount >= 15) this.unlockAchievement('near-miss-15');
    if (this.nearMissCount >= 30) this.unlockAchievement('near-miss-30');

    // Round 5: Milestone achievements
    if (this.distance >= 5000) this.unlockAchievement('milestone-5k');
    if (this.distance >= 10000) this.unlockAchievement('milestone-10k');

    // Round 5: Untouchable (500m without taking damage)
    if (this.invincibilityTimer <= 0 && this.distanceSinceLastHit >= 500) {
      this.unlockAchievement('perfect-run-500');
    }

    // Round 4: Double Points score tracking
    if (this.activePowerUp === PowerUpType.DOUBLE_POINTS) {
      const scored = this.score - this.doublePointsScoreStart;
      if (scored >= 5000) this.unlockAchievement('double-pts');
    }

    // Round 6: Quick Start (reach 25 m/s in under 45s)
    if (this.speed >= 25 && this.speed25Time < 0) {
      this.speed25Time = this.elapsedTime;
      if (this.speed25Time < 45) this.unlockAchievement('speed-start');
    }

    // Round 6: Endurance (1000m in Endless)
    if (this.mode === GameMode.ENDLESS && this.distance >= 1000) {
      this.unlockAchievement('endurance-1k');
    }

    // Round 7: Combo 200
    if (this.currentCombo >= 200) this.unlockAchievement('combo-200');

    // Round 7: Terminal Velocity (max speed in Classic)
    if (this.mode === GameMode.CLASSIC && this.speed >= MAX_SPEED) {
      this.unlockAchievement('speed-max-classic');
    }

    // Round 7: Near-miss 50
    if (this.nearMissCount >= 50) this.unlockAchievement('near-miss-50');

    // Round 7: Power Junkie (20 power-ups)
    if (this.powerUpsCollected >= 20) this.unlockAchievement('powerup-20');
  }

  private createPlayerVisual() {
    const mat = new MeshStandardMaterial({
      color: 0x003366,
      emissive: new Color(0x00ffff),
      emissiveIntensity: 2,
      transparent: true,
      opacity: 0.7,
    });
    const geo = new IcosahedronGeometry(0.25, 1);
    this.playerMesh = new Mesh(geo, mat);
    this.playerMesh.position.set(0, 0.5, -1.5);
    this.scene.add(this.playerMesh);

    const glowMat = new MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
    });
    this.playerGlow = new Mesh(new SphereGeometry(0.4, 16, 16), glowMat);
    this.playerGlow.position.copy(this.playerMesh.position);
    this.scene.add(this.playerGlow);
  }

  private hidePlayerVisual() {
    this.playerMesh.visible = false;
    this.playerGlow.visible = false;
  }

  private showPlayerVisual() {
    this.playerMesh.visible = true;
    this.playerGlow.visible = true;
  }

  private createSpeedLines() {
    const mat = new MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
    });
    for (let i = 0; i < 20; i++) {
      const geo = new BoxGeometry(0.02, 0.02, 2 + Math.random() * 3);
      const line = new Mesh(geo, mat.clone());
      line.position.set(
        (Math.random() - 0.5) * 6,
        Math.random() * 3 + 0.5,
        (Math.random() - 0.5) * 40 - 20,
      );
      line.visible = false;
      this.scene.add(line);
      this.speedLines.push(line);
    }
  }

  private updateSpeedLines(delta: number) {
    const speedFraction = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    const opacity = Math.max(0, speedFraction - 0.3) * 0.5;
    const show = opacity > 0.01 && this.speedLinesEnabled;

    for (const line of this.speedLines) {
      line.visible = show;
      if (show) {
        (line.material as MeshBasicMaterial).opacity = opacity;
        line.position.z += this.speed * delta;
        if (line.position.z > DESPAWN_Z) {
          line.position.z = SPAWN_Z + Math.random() * 20;
          line.position.x = (Math.random() - 0.5) * 6;
          line.position.y = Math.random() * 3 + 0.5;
        }
      }
    }
  }

  private createObstaclePool() {
    for (let i = 0; i < 30; i++) {
      const colorIdx = i % OBSTACLE_COLORS.length;
      const factoryIdx = i % OBSTACLE_FACTORIES.length;
      const group = OBSTACLE_FACTORIES[factoryIdx](OBSTACLE_COLORS[colorIdx]);
      group.visible = false;
      this.scene.add(group);
      this.obstacles.push({ group, lane: 1, active: false, width: 1.6 });
    }
  }

  private createCollectiblePool() {
    for (let i = 0; i < 40; i++) {
      const colorIdx = i % COLLECTIBLE_COLORS.length;
      const mat = createCollectibleMaterial(COLLECTIBLE_COLORS[colorIdx]);
      const mesh = new Mesh(new SphereGeometry(0.2, 12, 12), mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.collectibles.push({
        mesh, lane: 1, active: false, pulsePhase: Math.random() * Math.PI * 2,
        value: ORB_BASE_SCORE,
      });
    }
  }

  private spawnObstacle() {
    if (!this.modeConfig.hasObstacles) return;

    const free = this.obstacles.find(o => !o.active);
    if (!free) return;

    // Pick a lane (or two)
    const lane = Math.floor(Math.random() * 3);
    free.lane = lane;
    free.active = true;
    free.group.visible = true;
    free.group.position.set(LANE_POSITIONS[lane], 0, SPAWN_Z);
    free.group.rotation.y = Math.random() * Math.PI * 2;

    // Sometimes spawn a second obstacle in adjacent lane for harder difficulty
    if (this.speed > 20 && Math.random() < 0.3) {
      const free2 = this.obstacles.find(o => !o.active);
      if (free2) {
        const otherLanes = [0, 1, 2].filter(l => l !== lane);
        const lane2 = otherLanes[Math.floor(Math.random() * otherLanes.length)];
        free2.lane = lane2;
        free2.active = true;
        free2.group.visible = true;
        free2.group.position.set(LANE_POSITIONS[lane2], 0, SPAWN_Z);
        free2.group.rotation.y = Math.random() * Math.PI * 2;
      }
    }
  }

  private spawnCollectible() {
    const free = this.collectibles.find(c => !c.active);
    if (!free) return;

    const lane = Math.floor(Math.random() * 3);
    free.lane = lane;
    free.active = true;
    free.mesh.visible = true;
    free.mesh.position.set(LANE_POSITIONS[lane], 1, SPAWN_Z);
    free.value = ORB_BASE_SCORE * (1 + Math.floor(this.distance / 500));
  }

  private deactivateObstacle(o: ObstacleObj) {
    o.active = false;
    o.group.visible = false;
    o.group.position.z = SPAWN_Z - 100;
  }

  private deactivateCollectible(c: CollectibleObj) {
    c.active = false;
    c.mesh.visible = false;
    c.mesh.position.z = SPAWN_Z - 100;
  }

  // ── Floor Pulse Waves ─────────────────────────────────

  private createFloorPulses() {
    for (let i = 0; i < FLOOR_PULSE_COUNT; i++) {
      const geo = new PlaneGeometry(8, 0.4);
      const mat = new MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
      });
      const pulse = new Mesh(geo, mat);
      pulse.rotation.x = -Math.PI / 2;
      pulse.position.set(0, 0.02, -i * 20);
      pulse.visible = false;
      this.scene.add(pulse);
      this.floorPulses.push(pulse);
    }
  }

  private updateFloorPulses(dt: number, time: number) {
    const speedFrac = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    const show = speedFrac > 0.1;
    const pulseSpeed = FLOOR_PULSE_SPEED + this.speed * 0.5;

    for (let i = 0; i < this.floorPulses.length; i++) {
      const p = this.floorPulses[i];
      p.visible = show;
      if (!show) continue;

      p.position.z += pulseSpeed * dt;

      // Reset when past camera
      if (p.position.z > DESPAWN_Z) {
        p.position.z = SPAWN_Z + Math.random() * 10;
      }

      // Opacity fades based on distance from player
      const dz = Math.abs(p.position.z - this.playerMesh.position.z);
      const proximity = Math.max(0, 1 - dz / 40);
      const baseOp = speedFrac * 0.25 * proximity;
      const pulse = 1 + Math.sin(time * 3 + i * 1.5) * 0.3;
      (p.material as MeshBasicMaterial).opacity = baseOp * pulse;

      // Color follows environment
      (p.material as MeshBasicMaterial).color.copy(this._tmpPrimary);
    }
  }

  // ── Phase Glow Effect ───────────────────────────────────

  private createPhaseGlow() {
    const mat = new MeshBasicMaterial({
      color: 0xff44ff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
    });
    this.phaseGlow = new Mesh(new SphereGeometry(0.6, 12, 12), mat);
    this.phaseGlow.visible = false;
    this.scene.add(this.phaseGlow);
  }

  private updatePhaseGlow(time: number) {
    if (!this.phaseGlow) return;
    const isPhase = this.activePowerUp === PowerUpType.PHASE;
    this.phaseGlow.visible = isPhase;
    if (isPhase) {
      this.phaseGlow.position.copy(this.playerMesh.position);
      const pulse = 0.8 + Math.sin(time * 8) * 0.3;
      this.phaseGlow.scale.setScalar(pulse);
      (this.phaseGlow.material as MeshBasicMaterial).opacity = 0.15 + Math.sin(time * 6) * 0.08;

      // Flash player mesh with phase color
      const playerMat = this.playerMesh.material as MeshStandardMaterial;
      const flash = Math.sin(time * 10) * 0.5 + 0.5;
      playerMat.emissive.setRGB(flash, flash * 0.3, flash);
    } else if (this.state === GameState.PLAYING) {
      // Restore player color
      const playerMat = this.playerMesh.material as MeshStandardMaterial;
      playerMat.emissive.setHex(0x00ffff);
    }
  }

  // ── Star Field Background ──────────────────────────────

  private createStarField() {
    const starGeo = new SphereGeometry(0.04, 4, 4);
    for (let i = 0; i < GameSystem.STAR_COUNT; i++) {
      const brightness = 0.3 + Math.random() * 0.7;
      const color = new Color().setHSL(0.55 + Math.random() * 0.15, 0.4, brightness * 0.5);
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: brightness * 0.6,
        blending: AdditiveBlending,
      });
      const star = new Mesh(starGeo, mat);
      star.position.set(
        (Math.random() - 0.5) * 7,
        3.5 + Math.random() * 1,
        (Math.random() - 0.5) * 80 - 20,
      );
      star.scale.setScalar(0.5 + Math.random() * 1.5);
      this.scene.add(star);
      this.starField.push(star);
    }
  }

  private updateStarField(dt: number, time: number) {
    for (let i = 0; i < this.starField.length; i++) {
      const star = this.starField[i];
      // Scroll with game speed (slower than obstacles for parallax)
      star.position.z += this.speed * dt * 0.3;

      // Twinkle
      const twinkle = Math.sin(time * (2 + i * 0.3) + i * 1.7) * 0.3 + 0.7;
      (star.material as MeshBasicMaterial).opacity = twinkle * 0.4;

      // Reset when past camera
      if (star.position.z > DESPAWN_Z) {
        star.position.z = SPAWN_Z - Math.random() * 30;
        star.position.x = (Math.random() - 0.5) * 7;
      }
    }
  }

  // ── Player Trail ────────────────────────────────────────

  private createPlayerTrail() {
    for (let i = 0; i < GameSystem.TRAIL_LENGTH; i++) {
      const geo = new BoxGeometry(0.15 - i * 0.008, 0.15 - i * 0.008, 0.25);
      const mat = new MeshBasicMaterial({
        color: new Color(0x00ffff),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
      });
      const seg = new Mesh(geo, mat);
      seg.visible = false;
      this.scene.add(seg);
      this.trailSegments.push(seg);
    }
  }

  private updatePlayerTrail(dt: number) {
    if (this.state !== GameState.PLAYING) {
      for (const s of this.trailSegments) s.visible = false;
      this.trailPositions.length = 0;
      return;
    }

    // Record current position
    this.trailPositions.unshift({ x: this.playerX, z: this.playerMesh.position.z });
    if (this.trailPositions.length > GameSystem.TRAIL_LENGTH) {
      this.trailPositions.length = GameSystem.TRAIL_LENGTH;
    }

    const speedFrac = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    const showTrail = speedFrac > 0.15;

    for (let i = 0; i < this.trailSegments.length; i++) {
      const seg = this.trailSegments[i];
      if (i >= this.trailPositions.length || !showTrail) {
        seg.visible = false;
        continue;
      }
      seg.visible = true;
      const pos = this.trailPositions[i];
      seg.position.set(pos.x, 0.3, pos.z + 0.5 + i * 0.4);

      const fade = 1 - (i / GameSystem.TRAIL_LENGTH);
      (seg.material as MeshBasicMaterial).opacity = fade * speedFrac * 0.35;

      // Color follows environment
      (seg.material as MeshBasicMaterial).color.copy(this._tmpPrimary);
    }
  }

  // ── Wall Holograms (Round 6) ─────────────────────────────

  private createWallHolograms() {
    const shapes = [
      new TorusGeometry(0.3, 0.05, 8, 16),
      new OctahedronGeometry(0.25, 0),
      new IcosahedronGeometry(0.2, 0),
      new TorusGeometry(0.2, 0.03, 6, 12),
      new CylinderGeometry(0.15, 0.15, 0.4, 6),
    ];

    for (let i = 0; i < GameSystem.HOLO_COUNT; i++) {
      const geo = shapes[i % shapes.length];
      const mat = new MeshBasicMaterial({
        color: new Color(0x00ffff),
        transparent: true,
        opacity: 0.12,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      const side = i % 2 === 0 ? -3.5 : 3.5;
      mesh.position.set(side, 1.5 + Math.random() * 1.5, -i * 12 - 5);
      this.scene.add(mesh);
      this.wallHolograms.push(mesh);
    }
  }

  private updateWallHolograms(dt: number, time: number) {
    for (let i = 0; i < this.wallHolograms.length; i++) {
      const h = this.wallHolograms[i];
      h.rotation.x += dt * 0.5;
      h.rotation.y += dt * 0.8;

      if (this.state === GameState.PLAYING) {
        h.position.z += this.speed * dt * 0.4;
        if (h.position.z > DESPAWN_Z) {
          h.position.z = SPAWN_Z - Math.random() * 20;
          h.position.x = i % 2 === 0 ? -3.5 : 3.5;
          h.position.y = 1.5 + Math.random() * 1.5;
        }
      }

      const pulse = Math.sin(time * 2 + i * 0.8) * 0.05 + 0.1;
      (h.material as MeshBasicMaterial).opacity = pulse;
      (h.material as MeshBasicMaterial).color.copy(this._tmpPrimary);
    }
  }

  // ── Warning Markers (Round 6) ───────────────────────────

  private createWarningMarkers() {
    for (let i = 0; i < GameSystem.WARNING_COUNT; i++) {
      const geo = new PlaneGeometry(1.4, 0.12);
      const mat = new MeshBasicMaterial({
        color: 0xff4444,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
      });
      const marker = new Mesh(geo, mat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = 0.015;
      marker.visible = false;
      this.scene.add(marker);
      this.warningMarkers.push(marker);
    }
  }

  private updateWarningMarkers(_dt: number, time: number) {
    let idx = 0;
    for (const o of this.obstacles) {
      if (!o.active || idx >= this.warningMarkers.length) continue;
      if (o.group.position.z > -8 || o.group.position.z < -55) continue;

      const marker = this.warningMarkers[idx];
      marker.visible = true;
      marker.position.x = o.group.position.x;
      marker.position.z = o.group.position.z + 2;

      const dist = Math.abs(o.group.position.z - this.playerMesh.position.z);
      const urgency = Math.max(0, 1 - dist / 45);
      const pulse = Math.sin(time * 12) * 0.3 + 0.7;
      (marker.material as MeshBasicMaterial).opacity = urgency * pulse * 0.35;
      idx++;
    }
    for (let i = idx; i < this.warningMarkers.length; i++) {
      this.warningMarkers[i].visible = false;
    }
  }

  // ── Performance Rating (Round 6) ────────────────────────

  // ── FOV Speed Effect (Round 7) ──────────────────────────

  private updateFovEffect() {
    const speedFrac = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    // FOV grows from 75 to 90 at max speed
    const targetFov = this.baseFov + speedFrac * 15;
    const cam = this.camera as unknown as { fov: number; updateProjectionMatrix: () => void };
    if (typeof cam.fov === 'number') {
      cam.fov += (targetFov - cam.fov) * 0.05;
      cam.updateProjectionMatrix();
    }
  }

  private resetFov() {
    const cam = this.camera as unknown as { fov: number; updateProjectionMatrix: () => void };
    if (typeof cam.fov === 'number') {
      cam.fov = this.baseFov;
      cam.updateProjectionMatrix();
    }
  }

  getRating(): string {
    const s = this.score;
    const d = this.distance;
    if (s >= 50000 || d >= 5000) return 'S';
    if (s >= 20000 || d >= 3000) return 'A';
    if (s >= 10000 || d >= 1500) return 'B';
    if (s >= 5000 || d >= 800) return 'C';
    if (s >= 1000 || d >= 300) return 'D';
    return 'F';
  }

  // ── Near-Miss Detection ─────────────────────────────────

  private checkNearMiss(o: ObstacleObj) {
    if (this.nearMissedObstacles.has(o)) return;
    const dx = Math.abs(o.group.position.x - this.playerX);
    const dz = Math.abs(o.group.position.z - this.playerMesh.position.z);
    // Near miss: obstacle in same Z range but different lane (close but not hit)
    if (dz < 1.0 && dx > 0.8 && dx < 2.5) {
      this.nearMissedObstacles.add(o);
      this.nearMissCount++;
      this.nearMissTimer = 1.5; // show for 1.5s
      this.audio?.playNearMiss();

      // Check close-call achievement (near miss when switching lanes)
      if (this.laneSwitchCooldown > LANE_SWITCH_COOLDOWN - 0.3) {
        this.unlockAchievement('close-call');
      }
    }
  }

  // ── Distance Milestones ─────────────────────────────────

  private checkMilestones() {
    for (const m of this.MILESTONE_DISTANCES) {
      if (this.distance >= m && this.lastMilestone < m) {
        this.lastMilestone = m;
        const formatted = m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}km` : `${m}m`;
        this.milestoneText = `${formatted} REACHED!`;
        this.milestoneTimer = 2.5;
        this.audio?.playMilestone();
        // Emit celebration particles
        this.emitParticles(this.playerX, 1.5, this.playerMesh.position.z,
          new Color(0x00ff88), 15, 5, 0.8);
        break;
      }
    }
  }

  // ── Difficulty Zones ────────────────────────────────────

  private updateDifficultyZone() {
    const zones: Array<{ min: number; name: string }> = [
      { min: 0, name: '' },
      { min: 15, name: 'FAST' },
      { min: 25, name: 'HYPER' },
      { min: 35, name: 'INSANE' },
      { min: 42, name: 'MAX' },
    ];

    let newZone = '';
    for (let i = zones.length - 1; i >= 0; i--) {
      if (this.speed >= zones[i].min) {
        newZone = zones[i].name;
        break;
      }
    }

    if (newZone !== this.currentZoneName && newZone !== '') {
      this.currentZoneName = newZone;
      this.zoneChangeTimer = 2.0;
    } else if (newZone === '') {
      this.currentZoneName = '';
    }
  }

  // ── Particle System ──────────────────────────────────────

  private createParticlePool() {
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const geo = new SphereGeometry(0.05, 4, 4);
      const mat = new MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 1,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 });
    }
  }

  emitParticles(x: number, y: number, z: number, color: Color, count: number, spread: number, lifetime: number) {
    let emitted = 0;
    for (const p of this.particles) {
      if (p.active || emitted >= count) continue;
      p.active = true;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      (p.mesh.material as MeshBasicMaterial).color.copy(color);
      (p.mesh.material as MeshBasicMaterial).opacity = 1;
      p.vx = (Math.random() - 0.5) * spread;
      p.vy = Math.random() * spread * 0.7 + 1;
      p.vz = (Math.random() - 0.5) * spread;
      p.life = lifetime;
      p.maxLife = lifetime;
      emitted++;
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 3 * dt; // gravity
      p.life -= dt;
      const frac = Math.max(0, p.life / p.maxLife);
      (p.mesh.material as MeshBasicMaterial).opacity = frac;
      p.mesh.scale.setScalar(0.5 + frac * 0.5);
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  private deactivateAllParticles() {
    for (const p of this.particles) {
      p.active = false;
      p.mesh.visible = false;
    }
  }

  // ── Power-Up System ─────────────────────────────────────

  private createPowerUpPool() {
    const types: Array<{ type: PowerUpType; color: Color; geoFn: () => SphereGeometry | TorusGeometry | OctahedronGeometry | ConeGeometry | IcosahedronGeometry | BoxGeometry }> = [
      { type: PowerUpType.SHIELD, color: new Color(0x4488ff),
        geoFn: () => new TorusGeometry(0.25, 0.08, 8, 16) },
      { type: PowerUpType.MAGNET, color: new Color(0xffcc00),
        geoFn: () => new OctahedronGeometry(0.22, 0) },
      { type: PowerUpType.SLOW_MO, color: new Color(0xaa44ff),
        geoFn: () => new ConeGeometry(0.2, 0.4, 6) },
      { type: PowerUpType.DOUBLE_POINTS, color: new Color(0x00ff44),
        geoFn: () => new IcosahedronGeometry(0.22, 0) },
      { type: PowerUpType.PHASE, color: new Color(0xff44ff),
        geoFn: () => new BoxGeometry(0.3, 0.3, 0.3) },
    ];

    for (const def of types) {
      for (let i = 0; i < POWERUP_POOL_PER_TYPE; i++) {
        const group = new Group();
        const mat = new MeshStandardMaterial({
          color: def.color.clone().multiplyScalar(0.3),
          emissive: def.color,
          emissiveIntensity: 3,
          transparent: true,
          opacity: 0.9,
        });
        const main = new Mesh(def.geoFn(), mat);
        main.position.y = 1;
        group.add(main);

        const glowMat = new MeshBasicMaterial({
          color: def.color,
          transparent: true,
          opacity: 0.25,
          blending: AdditiveBlending,
        });
        const glow = new Mesh(new SphereGeometry(0.35, 8, 8), glowMat);
        glow.position.y = 1;
        group.add(glow);

        group.visible = false;
        this.scene.add(group);
        this.powerUps.push({ group, type: def.type, lane: 1, active: false });
      }
    }
  }

  private spawnPowerUp() {
    const types = [PowerUpType.SHIELD, PowerUpType.MAGNET, PowerUpType.SLOW_MO, PowerUpType.DOUBLE_POINTS, PowerUpType.PHASE];
    const type = types[Math.floor(Math.random() * types.length)];

    const free = this.powerUps.find(p => !p.active && p.type === type);
    if (!free) return;

    const lane = Math.floor(Math.random() * 3);
    free.lane = lane;
    free.active = true;
    free.group.visible = true;
    free.group.position.set(LANE_POSITIONS[lane], 0, SPAWN_Z);
  }

  private updatePowerUps(dt: number, time: number) {
    for (const p of this.powerUps) {
      if (!p.active) continue;

      p.group.position.z += this.speed * dt;
      p.group.rotation.y += dt * 4;

      // Pulse glow
      const child = p.group.children[1];
      if (child) {
        const s = 1 + Math.sin(time * 6) * 0.2;
        child.scale.setScalar(s);
      }

      if (p.group.position.z > DESPAWN_Z) {
        p.active = false;
        p.group.visible = false;
        continue;
      }

      // Collection check
      const dx = Math.abs(p.group.position.x - this.playerX);
      const dz = Math.abs(p.group.position.z - this.playerMesh.position.z);
      if (dx < 1.2 && dz < 1) {
        this.collectPowerUp(p);
      }
    }
  }

  private collectPowerUp(p: PowerUpObj) {
    p.active = false;
    p.group.visible = false;
    this.powerUpsCollected++;

    // Get color for particles
    const colorMap: Record<string, Color> = {
      [PowerUpType.SHIELD]: new Color(0x4488ff),
      [PowerUpType.MAGNET]: new Color(0xffcc00),
      [PowerUpType.SLOW_MO]: new Color(0xaa44ff),
      [PowerUpType.DOUBLE_POINTS]: new Color(0x00ff44),
      [PowerUpType.PHASE]: new Color(0xff44ff),
    };
    this.emitParticles(
      p.group.position.x, 1, p.group.position.z,
      colorMap[p.type] || new Color(0xffffff), 10, 3, 0.6,
    );

    // Audio
    this.audio?.playPowerUp(p.type);

    this.activePowerUp = p.type;
    this.powerUpTypesCollected.add(p.type);
    if (this.powerUpTypesCollected.size >= 5) this.unlockAchievement('all-powerups');

    if (p.type === PowerUpType.SHIELD) {
      this.hasShield = true;
      this.powerUpTimer = 999; // shield lasts until used
      this.powerUpMaxTime = 999;
    } else if (p.type === PowerUpType.MAGNET) {
      this.powerUpTimer = POWERUP_MAGNET_DURATION;
      this.powerUpMaxTime = POWERUP_MAGNET_DURATION;
    } else if (p.type === PowerUpType.SLOW_MO) {
      this.powerUpTimer = POWERUP_SLOWMO_DURATION;
      this.powerUpMaxTime = POWERUP_SLOWMO_DURATION;
    } else if (p.type === PowerUpType.DOUBLE_POINTS) {
      this.powerUpTimer = POWERUP_DOUBLE_POINTS_DURATION;
      this.powerUpMaxTime = POWERUP_DOUBLE_POINTS_DURATION;
      this.doublePointsScoreStart = this.score;
    } else if (p.type === PowerUpType.PHASE) {
      this.powerUpTimer = POWERUP_PHASE_DURATION;
      this.powerUpMaxTime = POWERUP_PHASE_DURATION;
      this.phaseDodgesThisActivation = 0;
    }
  }

  private updateActivePowerUp(dt: number) {
    if (this.activePowerUp === null) return;
    if (this.activePowerUp === PowerUpType.SHIELD) return; // shield stays until used

    this.powerUpTimer -= dt;
    if (this.powerUpTimer <= 0) {
      this.activePowerUp = null;
      this.powerUpTimer = 0;
    }
  }

  private deactivateAllPowerUps() {
    for (const p of this.powerUps) {
      p.active = false;
      p.group.visible = false;
    }
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    this.hasShield = false;
  }

  // ── Challenge Wave System ───────────────────────────────

  private updateChallengeWaves(dt: number) {
    if (this.inWaveRest) {
      this.challengeRestTimer -= dt;
      if (this.challengeRestTimer <= 0) {
        this.inWaveRest = false;
        this.challengeWave = (this.challengeWave + 1) % CHALLENGE_WAVES.length;
        this.challengeWaveNum = this.challengeWave + 1;
        this.challengeWaveTimer = CHALLENGE_WAVES[this.challengeWave].duration;
        this.waveSpawnTimer = 0;
        this.wavePatternIdx = 0;
      }
      return;
    }

    const wave = CHALLENGE_WAVES[this.challengeWave];
    this.challengeWaveTimer -= dt;
    this.waveSpawnTimer += dt;

    if (this.waveSpawnTimer >= wave.spawnInterval) {
      this.waveSpawnTimer = 0;
      this.spawnChallengeObstacles(wave.patterns[this.wavePatternIdx]);
      this.wavePatternIdx = (this.wavePatternIdx + 1) % wave.patterns.length;
    }

    if (this.challengeWaveTimer <= 0) {
      this.inWaveRest = true;
      this.challengeRestTimer = WAVE_REST_DURATION;
    }
  }

  private spawnChallengeObstacles(lanesToBlock: number[]) {
    for (const lane of lanesToBlock) {
      const free = this.obstacles.find(o => !o.active);
      if (!free) return;
      free.lane = lane;
      free.active = true;
      free.group.visible = true;
      free.group.position.set(LANE_POSITIONS[lane], 0, SPAWN_Z);
      free.group.rotation.y = Math.random() * Math.PI * 2;
    }
  }

  // ── Environment Color Progression ───────────────────────

  private updateEnvironmentColors() {
    if (!this.corridorRefs) return;
    const d = this.distance;

    // Find current zone pair
    let idx = 0;
    while (idx < ENV_COLOR_ZONES.length - 1 && d >= ENV_COLOR_ZONES[idx + 1].dist) idx++;

    if (idx >= ENV_COLOR_ZONES.length - 1) {
      const z = ENV_COLOR_ZONES[ENV_COLOR_ZONES.length - 1];
      this._tmpPrimary.copy(z.primary);
      this._tmpWall.copy(z.wallEmissive);
      this._tmpFloor.copy(z.floorEmissive);
      this._tmpBg.copy(z.bg);
    } else {
      const a = ENV_COLOR_ZONES[idx];
      const b = ENV_COLOR_ZONES[idx + 1];
      const t = Math.min(1, (d - a.dist) / (b.dist - a.dist));
      this._tmpPrimary.lerpColors(a.primary, b.primary, t);
      this._tmpWall.lerpColors(a.wallEmissive, b.wallEmissive, t);
      this._tmpFloor.lerpColors(a.floorEmissive, b.floorEmissive, t);
      this._tmpBg.lerpColors(a.bg, b.bg, t);
    }

    const cr = this.corridorRefs;
    cr.gridMat.color.copy(this._tmpPrimary);
    cr.laneMat.color.copy(this._tmpPrimary);
    cr.trimMat.color.copy(this._tmpPrimary);
    cr.beamMat.emissive.copy(this._tmpPrimary);
    cr.beamMat.emissiveIntensity = 0.4;
    cr.wallMat.emissive.copy(this._tmpWall);
    cr.floorMat.emissive.copy(this._tmpFloor);
    for (const light of cr.pointLights) light.color.copy(this._tmpPrimary);

    // Update scene bg and fog
    const bg = this.scene.background;
    if (bg && 'isColor' in bg) (bg as Color).copy(this._tmpBg);
    const fog = this.scene.fog;
    if (fog && 'color' in fog) (fog as unknown as { color: Color }).color.copy(this._tmpBg);
  }

  // ── Screen Shake ────────────────────────────────────────

  private updateScreenShake(dt: number) {
    if (this.shakeIntensity > 0) {
      this.shakeIntensity *= Math.exp(-SHAKE_DECAY * dt);
      if (this.shakeIntensity < 0.001) {
        this.shakeIntensity = 0;
        this.camera.position.x = 0;
        this.camera.position.y = 1.6;
      } else {
        this.camera.position.x = (Math.random() - 0.5) * this.shakeIntensity;
        this.camera.position.y = 1.6 + (Math.random() - 0.5) * this.shakeIntensity * 0.5;
      }
    }
  }

  // ── Public API for UI System ──────────────────────────────

  startGame(mode: GameMode = GameMode.CLASSIC) {
    this.mode = mode;
    this.modeConfig = GAME_MODES[mode];
    this.state = GameState.COUNTDOWN;
    this.countdownValue = 3;
    this.countdownTimer = 0;

    // Reset game state
    this.score = 0;
    this.distance = 0;
    this.speed = BASE_SPEED * this.modeConfig.speedMultiplier;
    this.lives = this.modeConfig.lives;
    this.multiplier = 1;
    this.multiplierTimer = 0;
    this.orbsCollected = 0;
    this.totalOrbsThisRun = 0;
    this.invincibilityTimer = 0;
    this.elapsedTime = 0;
    this.maxSpeed = this.speed;
    this.playerLane = 1;
    this.playerX = 0;
    this.targetX = 0;
    this.laneSwitchCooldown = 0;
    this.obstacleSpawnTimer = 0;
    this.collectibleSpawnTimer = 0;
    this.isNewRecord = false;
    this.longestCombo = 0;
    this.currentCombo = 0;
    this.challengeWave = 0;
    this.challengeTimer = 0;

    // Reset Round 2 state
    this.deactivateAllParticles();
    this.deactivateAllPowerUps();
    this.powerUpSpawnTimer = 0;
    this.powerUpsCollected = 0;
    this.phaseDodgesThisActivation = 0;
    this.doublePointsScoreStart = 0;
    this.powerUpTypesCollected.clear();
    this.challengeWaveTimer = 0;
    this.challengeRestTimer = 0;
    this.inWaveRest = false;
    this.waveSpawnTimer = 0;
    this.wavePatternIdx = 0;
    this.challengeWaveNum = 0;
    this.shakeIntensity = 0;

    // Reset Round 5 state
    this.nearMissTimer = 0;
    this.nearMissCount = 0;
    this.nearMissedObstacles.clear();
    this.milestoneTimer = 0;
    this.milestoneText = '';
    this.lastMilestone = 0;
    this.recentLanes.length = 0;
    this.distanceSinceLastOrb = 0;
    this.trailPositions.length = 0;
    this.currentZoneName = '';
    this.zoneChangeTimer = 0;
    this.distanceSinceLastHit = 0;

    // Round 6 resets
    this.flawlessRun = true;
    this.speed25Time = -1;
    this.rating = '';

    // Round 7 resets
    this.deathExplosionTimer = 0;
    this.comboFlashTimer = 0;

    if (mode === GameMode.CHALLENGE) {
      this.challengeWaveNum = 1;
      this.challengeWaveTimer = CHALLENGE_WAVES[0].duration;
    }

    // Clear all active objects
    for (const o of this.obstacles) this.deactivateObstacle(o);
    for (const c of this.collectibles) this.deactivateCollectible(c);

    // Show player
    this.showPlayerVisual();
    this.playerMesh.position.x = 0;
    this.playerGlow.position.x = 0;

    // Mode-specific achievements
    const modeAchMap: Record<string, string> = {
      classic: 'mode-classic', sprint: 'mode-sprint', time_attack: 'mode-time',
      zen: 'mode-zen', endless: 'mode-endless', challenge: 'mode-challenge',
    };
    if (modeAchMap[mode]) this.unlockAchievement(modeAchMap[mode]);

    // Start ambient music
    this.audio?.startMusic();
  }

  pauseGame() {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
    }
  }

  resumeGame() {
    if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING;
    }
  }

  quitToMenu() {
    this.state = GameState.MENU;
    this.resetFov();
    this.hidePlayerVisual();
    for (const o of this.obstacles) this.deactivateObstacle(o);
    for (const c of this.collectibles) this.deactivateCollectible(c);
    for (const line of this.speedLines) line.visible = false;
    this.deactivateAllParticles();
    this.deactivateAllPowerUps();
    this.shakeIntensity = 0;
    this.camera.position.set(0, 1.6, 0);
    for (const p of this.floorPulses) p.visible = false;
    if (this.phaseGlow) this.phaseGlow.visible = false;
    for (const s of this.trailSegments) s.visible = false;
    this.trailPositions.length = 0;
    this.nearMissedObstacles.clear();
    for (const w of this.warningMarkers) w.visible = false;
    this.audio?.stopMusic();
  }

  showModeSelect() { this.state = GameState.MODE_SELECT; }
  showSettings() { this.state = GameState.SETTINGS; }
  showAchievements() { this.state = GameState.ACHIEVEMENTS; }
  showTutorial() { this.state = GameState.TUTORIAL; }
  showStats() { this.state = GameState.STATS; }
  showMenu() { this.state = GameState.MENU; }
  showLeaderboard() { this.state = GameState.LEADERBOARD; }

  getAchievementCount(): number {
    return this.achievements.filter(a => a.unlocked).length;
  }

  // ── Main Update Loop ─────────────────────────────────────

  update(delta: number, time: number) {
    // Clamp large deltas
    const dt = Math.min(delta, 0.1);

    switch (this.state) {
      case GameState.COUNTDOWN:
        this.updateCountdown(dt);
        break;
      case GameState.PLAYING:
        this.updatePlaying(dt, time);
        break;
      case GameState.PAUSED:
        // Just animate player glow
        this.animatePlayerGlow(time);
        break;
      case GameState.GAME_OVER:
        // Continue animating particles (death explosion) and holograms
        this.updateParticles(dt);
        this.updateWallHolograms(dt, time);
        this.updateStarField(dt, time);
        if (this.deathExplosionTimer > 0) this.deathExplosionTimer -= dt;
        break;
      default:
        break;
    }
  }

  private updateCountdown(dt: number) {
    this.countdownTimer += dt;
    if (this.countdownTimer >= 1) {
      this.countdownTimer -= 1;
      this.countdownValue--;
      this.audio?.playCountdown(this.countdownValue);
      if (this.countdownValue <= 0) {
        this.state = GameState.PLAYING;
      }
    }
  }

  private updatePlaying(dt: number, time: number) {
    this.elapsedTime += dt;

    // Speed increase
    this.speed = Math.min(
      MAX_SPEED,
      (BASE_SPEED * this.modeConfig.speedMultiplier) + this.elapsedTime * SPEED_INCREASE_RATE,
    );
    // Slow-Mo power-up
    if (this.activePowerUp === PowerUpType.SLOW_MO) {
      this.speed *= POWERUP_SLOWMO_FACTOR;
    }
    this.maxSpeed = Math.max(this.maxSpeed, this.speed);

    // Distance
    this.distance += this.speed * dt;
    this.distanceSinceLastOrb += this.speed * dt; // Track distance without orbs
    this.distanceSinceLastHit += this.speed * dt; // Track distance without hits
    const pointsMultiplier = this.activePowerUp === PowerUpType.DOUBLE_POINTS ? 2 : 1;
    this.score += this.speed * dt * DISTANCE_SCORE_RATE * 0.1 * pointsMultiplier;

    // Multiplier decay
    this.multiplierTimer += dt;
    if (this.multiplierTimer > MULTIPLIER_DECAY_TIME && this.multiplier > 1) {
      this.multiplier = Math.max(1, this.multiplier - 1);
      this.multiplierTimer = 0;
      this.currentCombo = 0;
    }

    // Invincibility
    if (this.invincibilityTimer > 0) {
      this.invincibilityTimer -= dt;
      // Flash player
      this.playerMesh.visible = Math.sin(time * 20) > 0;
    }

    // Cooldowns
    if (this.laneSwitchCooldown > 0) this.laneSwitchCooldown -= dt;

    // Input
    this.handleInput();

    // Player position lerp
    this.targetX = LANE_POSITIONS[this.playerLane];
    this.playerX += (this.targetX - this.playerX) * LANE_SWITCH_SPEED * dt;
    this.playerMesh.position.x = this.playerX;
    this.playerGlow.position.x = this.playerX;

    // Player rotation (lean into turns)
    const leanAngle = (this.targetX - this.playerX) * 0.3;
    this.playerMesh.rotation.z = leanAngle;
    this.playerMesh.rotation.y += dt * 2;

    // Animate player glow
    this.animatePlayerGlow(time);

    // Move and spawn objects
    this.updateObstacles(dt);
    this.updateCollectibles(dt, time);

    // Obstacle spawning: challenge mode uses wave system, others use random
    if (this.mode === GameMode.CHALLENGE) {
      this.updateChallengeWaves(dt);
    } else {
      const speedFraction = this.speed / MAX_SPEED;
      const obstacleInterval = OBSTACLE_BASE_INTERVAL - speedFraction * (OBSTACLE_BASE_INTERVAL - OBSTACLE_MIN_INTERVAL);
      this.obstacleSpawnTimer += dt;
      if (this.obstacleSpawnTimer >= obstacleInterval) {
        this.obstacleSpawnTimer = 0;
        this.spawnObstacle();
      }
    }

    this.collectibleSpawnTimer += dt;
    if (this.collectibleSpawnTimer >= COLLECTIBLE_INTERVAL) {
      this.collectibleSpawnTimer = 0;
      this.spawnCollectible();
    }

    // Round 2 updates
    this.updateParticles(dt);
    this.updatePowerUps(dt, time);
    this.updateActivePowerUp(dt);
    this.updateEnvironmentColors();
    this.updateScreenShake(dt);

    // Round 4 updates
    this.updateFloorPulses(dt, time);
    this.updatePhaseGlow(time);

    // Round 5 updates
    this.updateStarField(dt, time);
    this.updatePlayerTrail(dt);
    this.checkMilestones();
    this.updateDifficultyZone();

    // Round 6 updates
    this.updateWallHolograms(dt, time);
    this.updateWarningMarkers(dt, time);

    // Round 7: FOV speed effect — camera widens at high speed
    this.updateFovEffect();

    // Round 7: Combo flash decay
    if (this.comboFlashTimer > 0) this.comboFlashTimer -= dt;

    // Near-miss timer decay
    if (this.nearMissTimer > 0) this.nearMissTimer -= dt;
    if (this.milestoneTimer > 0) this.milestoneTimer -= dt;
    if (this.zoneChangeTimer > 0) this.zoneChangeTimer -= dt;

    // Update ambient music intensity
    const speedFraction = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    this.audio?.updateMusicIntensity(Math.max(0, Math.min(1, speedFraction)));

    // Power-up spawning
    this.powerUpSpawnTimer += dt;
    if (this.powerUpSpawnTimer >= POWERUP_SPAWN_INTERVAL) {
      this.powerUpSpawnTimer = 0;
      this.spawnPowerUp();
    }

    // Speed trail particles at high speed
    if (this.speed > 25 && Math.random() < 0.3) {
      const trailColor = new Color(0x0088ff);
      this.emitParticles(
        this.playerX + (Math.random() - 0.5) * 0.3,
        0.5 + Math.random() * 0.2,
        this.playerMesh.position.z + 0.3,
        trailColor, 1, 0.5, 0.3,
      );
    }

    // Speed lines
    this.updateSpeedLines(dt);

    // Check achievements
    this.checkAchievements();

    // Time limit check
    if (this.modeConfig.timeLimit > 0 && this.elapsedTime >= this.modeConfig.timeLimit) {
      this.endGame();
      return;
    }

    // Sprint target check
    if (this.modeConfig.targetDistance > 0 && this.distance >= this.modeConfig.targetDistance) {
      this.unlockAchievement('perfect-sprint');
      this.endGame();
      return;
    }

    // First run achievement
    this.unlockAchievement('first-run');
  }

  private animatePlayerGlow(time: number) {
    const scale = 1 + Math.sin(time * 3) * 0.15;
    this.playerGlow.scale.setScalar(scale);
    const glowMat = this.playerGlow.material as MeshBasicMaterial;
    glowMat.opacity = 0.15 + Math.sin(time * 4) * 0.08;
  }

  private handleInput() {
    if (this.laneSwitchCooldown > 0) return;

    let moveLeft = false;
    let moveRight = false;

    // Keyboard
    if (this._kb().getKeyDown('KeyA') || this._kb().getKeyDown('ArrowLeft')) {
      moveLeft = true;
    }
    if (this._kb().getKeyDown('KeyD') || this._kb().getKeyDown('ArrowRight')) {
      moveRight = true;
    }

    // Pause
    if (this._kb().getKeyDown('Escape') || this._kb().getKeyDown('KeyP')) {
      this.pauseGame();
      return;
    }

    // XR controller
    const left = this.input.gamepads.left;
    const right = this.input.gamepads.right;

    if (left) {
      const stick = left.getAxesValues(InputComponent.Thumbstick);
      if (stick && Math.abs(stick.x) > 0.5) {
        if (stick.x < -0.5) moveLeft = true;
        if (stick.x > 0.5) moveRight = true;
      }
    }
    if (right) {
      const stick = right.getAxesValues(InputComponent.Thumbstick);
      if (stick && Math.abs(stick.x) > 0.5) {
        if (stick.x < -0.5) moveLeft = true;
        if (stick.x > 0.5) moveRight = true;
      }
      // Pause with B button
      if (right.getButtonDown(InputComponent.B_Button)) {
        this.pauseGame();
        return;
      }
    }

    if (moveLeft && this.playerLane > 0) {
      this.playerLane--;
      this.laneSwitchCooldown = LANE_SWITCH_COOLDOWN;
      this.audio?.playLaneSwitch();
      this.trackLaneUsage();
    }
    if (moveRight && this.playerLane < 2) {
      this.playerLane++;
      this.laneSwitchCooldown = LANE_SWITCH_COOLDOWN;
      this.audio?.playLaneSwitch();
      this.trackLaneUsage();
    }
  }

  private trackLaneUsage() {
    const now = this.elapsedTime;
    this.recentLanes.push({ lane: this.playerLane, time: now });
    // Keep only recent 5 seconds of history
    this.recentLanes = this.recentLanes.filter(l => now - l.time <= 5);
    // Check if all 3 lanes were used within 5 seconds
    const lanesUsed = new Set(this.recentLanes.map(l => l.lane));
    if (lanesUsed.size >= 3) {
      this.unlockAchievement('all-lanes');
    }
  }

  private updateObstacles(dt: number) {
    const speedFrac = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    const rotSpeed = 0.5 + speedFrac * 2.5; // Obstacles spin faster at high speed

    for (const o of this.obstacles) {
      if (!o.active) continue;

      o.group.position.z += this.speed * dt;
      o.group.rotation.y += dt * rotSpeed;

      // Despawn
      if (o.group.position.z > DESPAWN_Z) {
        this.deactivateObstacle(o);
        this.nearMissedObstacles.delete(o);
        continue;
      }

      // Near-miss detection (Round 5)
      if (this.invincibilityTimer <= 0) {
        this.checkNearMiss(o);
      }

      // Collision check
      if (this.invincibilityTimer <= 0) {
        const dx = Math.abs(o.group.position.x - this.playerX);
        const dz = Math.abs(o.group.position.z - this.playerMesh.position.z);
        if (dx < 0.8 && dz < 0.6) {
          this.onHit();
        }
      }
    }
  }

  private updateCollectibles(dt: number, time: number) {
    for (const c of this.collectibles) {
      if (!c.active) continue;

      c.mesh.position.z += this.speed * dt;
      c.mesh.rotation.y += dt * 3;
      c.mesh.position.y = 1 + Math.sin(time * 4 + c.pulsePhase) * 0.15;

      // Pulse scale
      const pulse = 1 + Math.sin(time * 5 + c.pulsePhase) * 0.1;
      c.mesh.scale.setScalar(pulse);

      // Despawn
      if (c.mesh.position.z > DESPAWN_Z) {
        this.deactivateCollectible(c);
        this.currentCombo = 0;
        continue;
      }

      // Collection check (expanded range with Magnet power-up)
      const dx = Math.abs(c.mesh.position.x - this.playerX);
      const dz = Math.abs(c.mesh.position.z - this.playerMesh.position.z);
      const collectRange = (this.activePowerUp === PowerUpType.MAGNET) ? 2.5 : 1;
      if (dx < collectRange && dz < 1) {
        this.collectOrb(c);
      }
    }
  }

  private collectOrb(c: CollectibleObj) {
    // Emit collection particles
    const orbColor = COLLECTIBLE_COLORS[Math.floor(Math.random() * COLLECTIBLE_COLORS.length)];
    this.emitParticles(c.mesh.position.x, c.mesh.position.y, c.mesh.position.z, orbColor, 8, 3, 0.5);

    const pointsMultiplier = this.activePowerUp === PowerUpType.DOUBLE_POINTS ? 2 : 1;
    this.score += c.value * this.multiplier * pointsMultiplier;
    this.orbsCollected++;
    this.totalOrbsThisRun++;
    this.currentCombo++;
    this.longestCombo = Math.max(this.longestCombo, this.currentCombo);
    this.multiplierTimer = 0;
    this.distanceSinceLastOrb = 0; // Reset no-orbs tracker

    // Audio
    this.audio?.playOrbCollect(this.multiplier);

    // Round 7: Combo flash at high multiplier (>= 5x)
    if (this.multiplier >= 5) {
      this.comboFlashTimer = 0.15;
      // Extra burst at milestones
      if (this.currentCombo % 10 === 0) {
        this.emitParticles(this.playerX, 1.5, this.playerMesh.position.z,
          new Color(0xffff00), 12, 6, 0.7);
      }
    }

    // Increase multiplier every 3 orbs
    if (this.currentCombo % 3 === 0 && this.multiplier < MAX_MULTIPLIER) {
      this.multiplier++;
      this.audio?.playMultiplierUp(this.multiplier);
    }

    this.deactivateCollectible(c);
  }

  private onHit() {
    // Phase power-up — pass through obstacles
    if (this.activePowerUp === PowerUpType.PHASE) {
      this.phaseDodgesThisActivation++;
      if (this.phaseDodgesThisActivation >= 3) this.unlockAchievement('phase-dodge');
      this.emitParticles(this.playerX, 0.8, this.playerMesh.position.z,
        new Color(0xff44ff), 5, 2, 0.3);
      return;
    }

    // Shield power-up absorbs the hit
    if (this.hasShield) {
      this.hasShield = false;
      this.activePowerUp = null;
      this.powerUpTimer = 0;
      this.emitParticles(this.playerX, 0.8, this.playerMesh.position.z,
        new Color(0x4488ff), 15, 5, 0.8);
      if (this.screenShakeEnabled) this.shakeIntensity = 0.08;
      this.audio?.playShieldBreak();
      return;
    }

    // Hit particles
    const hitColor = OBSTACLE_COLORS[Math.floor(Math.random() * OBSTACLE_COLORS.length)];
    this.emitParticles(this.playerX, 0.6, this.playerMesh.position.z, hitColor, 12, 4, 0.6);

    // Screen shake
    if (this.screenShakeEnabled) this.shakeIntensity = 0.15;

    // Audio
    this.audio?.playHit();

    this.lives--;
    this.flawlessRun = false;
    this.multiplier = 1;
    this.currentCombo = 0;
    this.invincibilityTimer = INVINCIBILITY_TIME;
    this.distanceSinceLastHit = 0;

    if (this.lives <= 0) {
      this.endGame();
    }
  }

  private endGame() {
    this.state = GameState.GAME_OVER;

    // Round 7: Death explosion - massive particle burst
    if (this.lives <= 0) {
      this.deathExplosionTimer = 0.5;
      // Burst 1: player position — big colorful explosion
      this.emitParticles(this.playerX, 0.8, this.playerMesh.position.z,
        new Color(0xff4444), 20, 8, 1.2);
      this.emitParticles(this.playerX, 1.0, this.playerMesh.position.z,
        new Color(0xff8800), 15, 6, 1.0);
      this.emitParticles(this.playerX, 0.6, this.playerMesh.position.z,
        this._tmpPrimary.clone(), 10, 5, 0.8);
    }

    // Round 7: Reset FOV
    this.resetFov();

    // Round 6: Compute performance rating
    this.rating = this.getRating();
    if (this.rating === 'S') this.unlockAchievement('rating-s');

    // Round 6: Flawless Classic
    if (this.mode === GameMode.CLASSIC && this.flawlessRun && this.distance > 50) {
      this.unlockAchievement('flawless-classic');
    }

    // Record lifetime stats
    if (this.stats) {
      this.stats.recordRun({
        mode: this.mode,
        distance: this.distance,
        orbs: this.totalOrbsThisRun,
        score: this.score,
        time: this.elapsedTime,
        powerUps: this.powerUpsCollected,
        maxSpeed: this.maxSpeed,
        longestCombo: this.longestCombo,
        bestMultiplier: this.multiplier,
      });
    }

    // Check/save high score
    const key = this.mode;
    const prev = this.highScores[key] || 0;
    if (this.score > prev) {
      this.highScores[key] = Math.floor(this.score);
      this.isNewRecord = true;
      this.saveHighScores();
      this.audio?.playNewRecord();
    } else {
      this.audio?.playGameOver();
    }

    // Round 7: All-modes achievement — check if all 6 modes have been played via stats
    if (this.stats) {
      const modesPlayed = Object.keys(this.stats.get().gamesPerMode).length;
      if (modesPlayed >= 6) this.unlockAchievement('all-modes');
    }

    this.hidePlayerVisual();
    for (const line of this.speedLines) line.visible = false;
    this.deactivateAllPowerUps();
    this.shakeIntensity = 0;
    this.camera.position.set(0, 1.6, 0);
    for (const p of this.floorPulses) p.visible = false;
    if (this.phaseGlow) this.phaseGlow.visible = false;
    for (const s of this.trailSegments) s.visible = false;
    this.trailPositions.length = 0;
    this.nearMissedObstacles.clear();
    for (const w of this.warningMarkers) w.visible = false;
    this.audio?.stopMusic();
  }
}
