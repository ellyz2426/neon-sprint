import {
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  eq,
  Entity,
} from '@iwsdk/core';

import { GameSystem, GameState, GameMode, GAME_MODES, PowerUpType } from './game-system.js';

// ── Helper ────────────────────────────────────────────────────

const getDoc = (e: Entity) =>
  e.getValue(PanelDocument, 'document') as UIKitDocument | undefined;

const setText = (doc: UIKitDocument | undefined, id: string, text: string) =>
  (doc?.getElementById(id) as UIKit.Text | undefined)?.setProperties({ text });

const setVisible = (doc: UIKitDocument | undefined, id: string, visible: boolean) =>
  (doc?.getElementById(id) as UIKit.Text | undefined)?.setProperties({
    display: visible ? ('flex' as any) : ('none' as any),
  });

// ── UISystem ─────────────────────────────────────────────────

export class UISystem extends createSystem({
  menu: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/main-menu.json')],
  },
  hud: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/hud.json')],
  },
  gameOver: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/game-over.json')],
  },
  pause: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/pause-menu.json')],
  },
  modeSelect: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/mode-select.json')],
  },
  settings: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/settings.json')],
  },
  achievements: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/achievements.json')],
  },
  tutorial: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/tutorial.json')],
  },
  countdown: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/countdown.json')],
  },
  newRecord: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/new-record.json')],
  },
}) {
  private gameSystem!: GameSystem;
  private prevState: GameState | null = null;
  private achievementToast = '';
  private achievementToastTimer = 0;
  private lastHudUpdate = 0;

  /** Hide/show an entity based on current game state */
  private syncVisibility(entity: Entity, shouldShow: boolean) {
    if (entity?.object3D) entity.object3D.visible = shouldShow;
  }

  // Panel entities (set on qualify)
  private menuEntity: Entity | null = null;
  private hudEntity: Entity | null = null;
  private gameOverEntity: Entity | null = null;
  private pauseEntity: Entity | null = null;
  private modeSelectEntity: Entity | null = null;
  private settingsEntity: Entity | null = null;
  private achievementsEntity: Entity | null = null;
  private tutorialEntity: Entity | null = null;
  private countdownEntity: Entity | null = null;
  private newRecordEntity: Entity | null = null;

  setRefs(refs: { gameSystem: GameSystem }) {
    this.gameSystem = refs.gameSystem;
  }

  init() {
    // Main menu
    this.queries.menu.subscribe('qualify', (entity) => {
      this.menuEntity = entity;
      this.syncVisibility(entity, this.gameSystem.state === GameState.MENU);
      const doc = getDoc(entity);
      if (!doc) return;

      const playBtn = doc.getElementById('btn-play') as UIKit.Text | undefined;
      playBtn?.addEventListener('click', () => this.gameSystem.startGame(GameMode.CLASSIC));

      const modesBtn = doc.getElementById('btn-modes') as UIKit.Text | undefined;
      modesBtn?.addEventListener('click', () => this.gameSystem.showModeSelect());

      const settingsBtn = doc.getElementById('btn-settings') as UIKit.Text | undefined;
      settingsBtn?.addEventListener('click', () => this.gameSystem.showSettings());

      const achievementsBtn = doc.getElementById('btn-achievements') as UIKit.Text | undefined;
      achievementsBtn?.addEventListener('click', () => this.gameSystem.showAchievements());

      const tutorialBtn = doc.getElementById('btn-tutorial') as UIKit.Text | undefined;
      tutorialBtn?.addEventListener('click', () => this.gameSystem.showTutorial());
    });

    // HUD
    this.queries.hud.subscribe('qualify', (entity) => {
      this.hudEntity = entity;
      this.syncVisibility(entity, false);
    });

    // Game Over
    this.queries.gameOver.subscribe('qualify', (entity) => {
      this.gameOverEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const retryBtn = doc.getElementById('btn-retry') as UIKit.Text | undefined;
      retryBtn?.addEventListener('click', () => this.gameSystem.startGame(this.gameSystem.mode));

      const menuBtn = doc.getElementById('btn-menu') as UIKit.Text | undefined;
      menuBtn?.addEventListener('click', () => this.gameSystem.quitToMenu());
    });

    // Pause Menu
    this.queries.pause.subscribe('qualify', (entity) => {
      this.pauseEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const resumeBtn = doc.getElementById('btn-resume') as UIKit.Text | undefined;
      resumeBtn?.addEventListener('click', () => this.gameSystem.resumeGame());

      const quitBtn = doc.getElementById('btn-quit') as UIKit.Text | undefined;
      quitBtn?.addEventListener('click', () => this.gameSystem.quitToMenu());
    });

    // Mode Select
    this.queries.modeSelect.subscribe('qualify', (entity) => {
      this.modeSelectEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const modes = [GameMode.CLASSIC, GameMode.SPRINT, GameMode.TIME_ATTACK, GameMode.ZEN, GameMode.ENDLESS, GameMode.CHALLENGE];
      for (const mode of modes) {
        const btn = doc.getElementById(`btn-${mode}`) as UIKit.Text | undefined;
        btn?.addEventListener('click', () => this.gameSystem.startGame(mode));
      }

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => this.gameSystem.showMenu());
    });

    // Settings
    this.queries.settings.subscribe('qualify', (entity) => {
      this.settingsEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => this.gameSystem.showMenu());
    });

    // Achievements
    this.queries.achievements.subscribe('qualify', (entity) => {
      this.achievementsEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => this.gameSystem.showMenu());
    });

    // Tutorial
    this.queries.tutorial.subscribe('qualify', (entity) => {
      this.tutorialEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => this.gameSystem.showMenu());

      const playBtn = doc.getElementById('btn-play') as UIKit.Text | undefined;
      playBtn?.addEventListener('click', () => this.gameSystem.startGame(GameMode.CLASSIC));
    });

    // Countdown
    this.queries.countdown.subscribe('qualify', (entity) => {
      this.countdownEntity = entity;
      this.syncVisibility(entity, false);
    });

    // New Record
    this.queries.newRecord.subscribe('qualify', (entity) => {
      this.newRecordEntity = entity;
      this.syncVisibility(entity, false);
    });
  }

  showAchievementToast(name: string) {
    this.achievementToast = name;
    this.achievementToastTimer = 3;
  }

  update(delta: number, _time: number) {
    const dt = Math.min(delta, 0.1);
    const state = this.gameSystem.state;

    // State changed - update visibility
    if (state !== this.prevState) {
      this.updatePanelVisibility(state);
      this.prevState = state;

      // Update content on state enter
      if (state === GameState.GAME_OVER) this.updateGameOverPanel();
      if (state === GameState.ACHIEVEMENTS) this.updateAchievementsPanel();
    }

    // Continuous updates
    if (state === GameState.PLAYING) {
      this.lastHudUpdate += dt;
      if (this.lastHudUpdate > 0.1) {
        this.updateHUD();
        this.lastHudUpdate = 0;
      }
    }

    if (state === GameState.COUNTDOWN) {
      this.updateCountdownPanel();
    }

    // Achievement toast
    if (this.achievementToastTimer > 0) {
      this.achievementToastTimer -= dt;
      if (this.hudEntity) {
        const doc = getDoc(this.hudEntity);
        setText(doc, 'achievement-toast', `Unlocked: ${this.achievementToast}`);
        setVisible(doc, 'achievement-toast', true);
      }
    } else if (this.hudEntity) {
      const doc = getDoc(this.hudEntity);
      setVisible(doc, 'achievement-toast', false);
    }
  }

  private updatePanelVisibility(state: GameState) {
    const show = (entity: Entity | null, visible: boolean) => {
      if (entity?.object3D) entity.object3D.visible = visible;
    };

    show(this.menuEntity, state === GameState.MENU);
    show(this.hudEntity, state === GameState.PLAYING || state === GameState.COUNTDOWN);
    show(this.gameOverEntity, state === GameState.GAME_OVER);
    show(this.pauseEntity, state === GameState.PAUSED);
    show(this.modeSelectEntity, state === GameState.MODE_SELECT);
    show(this.settingsEntity, state === GameState.SETTINGS);
    show(this.achievementsEntity, state === GameState.ACHIEVEMENTS);
    show(this.tutorialEntity, state === GameState.TUTORIAL);
    show(this.countdownEntity, state === GameState.COUNTDOWN);
    show(this.newRecordEntity, state === GameState.GAME_OVER && this.gameSystem.isNewRecord);
  }

  private updateHUD() {
    if (!this.hudEntity) return;
    const doc = getDoc(this.hudEntity);
    if (!doc) return;

    const gs = this.gameSystem;
    setText(doc, 'score', `Score: ${Math.floor(gs.score).toLocaleString()}`);
    setText(doc, 'distance', `${Math.floor(gs.distance)}m`);
    setText(doc, 'speed', `${gs.speed.toFixed(1)} m/s`);
    setText(doc, 'multiplier', gs.multiplier > 1 ? `x${gs.multiplier}` : '');
    setText(doc, 'orbs', `Orbs: ${gs.orbsCollected}`);

    // Lives display
    const livesText = gs.lives > 5 ? `${gs.lives}` : '*'.repeat(gs.lives);
    setText(doc, 'lives', livesText);

    // Timer (for timed modes)
    const cfg = gs.modeConfig;
    if (cfg.timeLimit > 0) {
      const remaining = Math.max(0, cfg.timeLimit - gs.elapsedTime);
      const mins = Math.floor(remaining / 60);
      const secs = Math.floor(remaining % 60);
      setText(doc, 'timer', `${mins}:${secs.toString().padStart(2, '0')}`);
      setVisible(doc, 'timer', true);
    } else {
      setVisible(doc, 'timer', false);
    }

    // Sprint progress
    if (cfg.targetDistance > 0) {
      const pct = Math.min(100, (gs.distance / cfg.targetDistance) * 100);
      setText(doc, 'progress', `${pct.toFixed(0)}%`);
      setVisible(doc, 'progress', true);
    } else {
      setVisible(doc, 'progress', false);
    }

    // Power-up status
    if (gs.activePowerUp !== null) {
      const puLabels: Record<string, string> = {
        [PowerUpType.SHIELD]: 'SHIELD',
        [PowerUpType.MAGNET]: 'MAGNET',
        [PowerUpType.SLOW_MO]: 'SLOW-MO',
      };
      const label = puLabels[gs.activePowerUp] || '';
      if (gs.activePowerUp === PowerUpType.SHIELD) {
        setText(doc, 'power-up-status', `${label} ACTIVE`);
      } else {
        setText(doc, 'power-up-status', `${label} ${gs.powerUpTimer.toFixed(1)}s`);
      }
      setVisible(doc, 'power-up-status', true);
    } else {
      setVisible(doc, 'power-up-status', false);
    }

    // Wave indicator (challenge mode)
    if (gs.mode === GameMode.CHALLENGE && gs.challengeWaveNum > 0) {
      setText(doc, 'wave-indicator', `Wave ${gs.challengeWaveNum}`);
      setVisible(doc, 'wave-indicator', true);
    } else {
      setVisible(doc, 'wave-indicator', false);
    }
  }

  private updateCountdownPanel() {
    if (!this.countdownEntity) return;
    const doc = getDoc(this.countdownEntity);
    if (!doc) return;

    const val = this.gameSystem.countdownValue;
    setText(doc, 'countdown-text', val > 0 ? `${val}` : 'GO!');
  }

  private updateGameOverPanel() {
    if (!this.gameOverEntity) return;
    const doc = getDoc(this.gameOverEntity);
    if (!doc) return;

    const gs = this.gameSystem;
    setText(doc, 'final-score', `${Math.floor(gs.score).toLocaleString()}`);
    setText(doc, 'final-distance', `${Math.floor(gs.distance)}m`);
    setText(doc, 'final-orbs', `${gs.orbsCollected}`);
    setText(doc, 'final-time', `${Math.floor(gs.elapsedTime)}s`);
    setText(doc, 'final-speed', `${gs.maxSpeed.toFixed(1)} m/s`);
    setText(doc, 'final-combo', `${gs.longestCombo}`);
    setText(doc, 'final-powerups', `${gs.powerUpsCollected}`);
    setText(doc, 'high-score', `Best: ${(gs.highScores[gs.mode] || 0).toLocaleString()}`);
    setText(doc, 'mode-name', GAME_MODES[gs.mode].name);

    // Show wave reached for challenge mode
    if (gs.mode === GameMode.CHALLENGE) {
      setText(doc, 'final-wave', `${gs.challengeWaveNum}`);
      setVisible(doc, 'wave-row', true);
    } else {
      setVisible(doc, 'wave-row', false);
    }

    if (gs.isNewRecord) {
      setVisible(doc, 'new-record-badge', true);
    } else {
      setVisible(doc, 'new-record-badge', false);
    }
  }

  private updateAchievementsPanel() {
    if (!this.achievementsEntity) return;
    const doc = getDoc(this.achievementsEntity);
    if (!doc) return;

    const gs = this.gameSystem;
    const unlocked = gs.getAchievementCount();
    const total = gs.achievements.length;
    setText(doc, 'ach-count', `${unlocked} / ${total}`);

    // Update achievement list (first 12 shown)
    for (let i = 0; i < 12; i++) {
      const a = gs.achievements[i];
      if (a) {
        setText(doc, `ach-name-${i}`, a.name);
        setText(doc, `ach-desc-${i}`, a.description);
        setText(doc, `ach-status-${i}`, a.unlocked ? '[DONE]' : '[ ]');
      }
    }
  }
}
