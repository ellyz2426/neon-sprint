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
import type { AudioManager } from './audio-system.js';
import type { StatsTracker } from './stats-tracker.js';
import { StatsTracker as StatsTrackerClass } from './stats-tracker.js';

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
  stats: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/stats.json')],
  },
  leaderboard: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/leaderboard.json')],
  },
}) {
  private gameSystem!: GameSystem;
  private audio!: AudioManager;
  private statsTracker!: StatsTracker;
  private prevState: GameState | null = null;
  private achievementToast = '';
  private achievementToastTimer = 0;
  private lastHudUpdate = 0;
  private achPage = 0;
  private readonly ACH_PER_PAGE = 16;

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
  private statsEntity: Entity | null = null;
  private leaderboardEntity: Entity | null = null;

  setRefs(refs: { gameSystem: GameSystem; audioManager?: AudioManager; statsTracker?: StatsTracker }) {
    this.gameSystem = refs.gameSystem;
    if (refs.audioManager) this.audio = refs.audioManager;
    if (refs.statsTracker) this.statsTracker = refs.statsTracker;
  }

  init() {
    // Main menu
    this.queries.menu.subscribe('qualify', (entity) => {
      this.menuEntity = entity;
      this.syncVisibility(entity, this.gameSystem.state === GameState.MENU);
      const doc = getDoc(entity);
      if (!doc) return;

      const playBtn = doc.getElementById('btn-play') as UIKit.Text | undefined;
      playBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.startGame(GameMode.CLASSIC);
      });

      const modesBtn = doc.getElementById('btn-modes') as UIKit.Text | undefined;
      modesBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showModeSelect();
      });

      const settingsBtn = doc.getElementById('btn-settings') as UIKit.Text | undefined;
      settingsBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showSettings();
      });

      const achievementsBtn = doc.getElementById('btn-achievements') as UIKit.Text | undefined;
      achievementsBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showAchievements();
      });

      const tutorialBtn = doc.getElementById('btn-tutorial') as UIKit.Text | undefined;
      tutorialBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showTutorial();
      });

      const leaderboardBtn = doc.getElementById('btn-leaderboard') as UIKit.Text | undefined;
      leaderboardBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showLeaderboard();
      });

      const statsBtn = doc.getElementById('btn-stats') as UIKit.Text | undefined;
      statsBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showStats();
      });
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
      retryBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.startGame(this.gameSystem.mode);
      });

      const menuBtn = doc.getElementById('btn-menu') as UIKit.Text | undefined;
      menuBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.quitToMenu();
      });
    });

    // Pause Menu
    this.queries.pause.subscribe('qualify', (entity) => {
      this.pauseEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const resumeBtn = doc.getElementById('btn-resume') as UIKit.Text | undefined;
      resumeBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.resumeGame();
      });

      const quitBtn = doc.getElementById('btn-quit') as UIKit.Text | undefined;
      quitBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.quitToMenu();
      });
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
        btn?.addEventListener('click', () => {
          this.audio?.playClick();
          this.gameSystem.startGame(mode);
        });
      }

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showMenu();
      });
    });

    // Settings
    this.queries.settings.subscribe('qualify', (entity) => {
      this.settingsEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showMenu();
      });

      // Sound toggle
      const soundBtn = doc.getElementById('btn-toggle-sound') as UIKit.Text | undefined;
      soundBtn?.addEventListener('click', () => {
        if (this.audio) {
          this.audio.muted = !this.audio.muted;
          setText(doc, 'btn-toggle-sound', this.audio.muted ? 'OFF' : 'ON');
        }
        this.audio?.playClick();
      });

      // Volume controls
      const volDown = doc.getElementById('btn-vol-down') as UIKit.Text | undefined;
      volDown?.addEventListener('click', () => {
        if (this.audio) {
          this.audio.volume = Math.max(0, this.audio.volume - 0.1);
          setText(doc, 'volume-display', `${Math.round(this.audio.volume * 100)}%`);
        }
        this.audio?.playClick();
      });

      const volUp = doc.getElementById('btn-vol-up') as UIKit.Text | undefined;
      volUp?.addEventListener('click', () => {
        if (this.audio) {
          this.audio.volume = Math.min(1, this.audio.volume + 0.1);
          setText(doc, 'volume-display', `${Math.round(this.audio.volume * 100)}%`);
        }
        this.audio?.playClick();
      });

      // Screen shake toggle
      const shakeBtn = doc.getElementById('btn-toggle-shake') as UIKit.Text | undefined;
      shakeBtn?.addEventListener('click', () => {
        this.gameSystem.screenShakeEnabled = !this.gameSystem.screenShakeEnabled;
        setText(doc, 'btn-toggle-shake', this.gameSystem.screenShakeEnabled ? 'ON' : 'OFF');
        this.gameSystem.savePrefs();
        this.audio?.playClick();
      });

      // Speed lines toggle
      const linesBtn = doc.getElementById('btn-toggle-lines') as UIKit.Text | undefined;
      linesBtn?.addEventListener('click', () => {
        this.gameSystem.speedLinesEnabled = !this.gameSystem.speedLinesEnabled;
        setText(doc, 'btn-toggle-lines', this.gameSystem.speedLinesEnabled ? 'ON' : 'OFF');
        this.gameSystem.savePrefs();
        this.audio?.playClick();
      });

      // Reset buttons
      const resetScoresBtn = doc.getElementById('btn-reset-scores') as UIKit.Text | undefined;
      resetScoresBtn?.addEventListener('click', () => {
        this.gameSystem.resetHighScores();
        this.audio?.playClick();
      });

      const resetAllBtn = doc.getElementById('btn-reset-all') as UIKit.Text | undefined;
      resetAllBtn?.addEventListener('click', () => {
        this.gameSystem.resetAllData();
        this.audio?.playClick();
      });
    });

    // Achievements
    this.queries.achievements.subscribe('qualify', (entity) => {
      this.achievementsEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showMenu();
      });

      const prevBtn = doc.getElementById('btn-prev-ach') as UIKit.Text | undefined;
      prevBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        if (this.achPage > 0) {
          this.achPage--;
          this.updateAchievementsPanel();
        }
      });

      const nextBtn = doc.getElementById('btn-next-ach') as UIKit.Text | undefined;
      nextBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        const totalPages = Math.ceil(this.gameSystem.achievements.length / this.ACH_PER_PAGE);
        if (this.achPage < totalPages - 1) {
          this.achPage++;
          this.updateAchievementsPanel();
        }
      });
    });

    // Tutorial
    this.queries.tutorial.subscribe('qualify', (entity) => {
      this.tutorialEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showMenu();
      });

      const playBtn = doc.getElementById('btn-play') as UIKit.Text | undefined;
      playBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.startGame(GameMode.CLASSIC);
      });
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

    // Stats
    this.queries.stats.subscribe('qualify', (entity) => {
      this.statsEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showMenu();
      });
    });

    // Leaderboard
    this.queries.leaderboard.subscribe('qualify', (entity) => {
      this.leaderboardEntity = entity;
      this.syncVisibility(entity, false);
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio?.playClick();
        this.gameSystem.showMenu();
      });
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
      if (state === GameState.STATS) this.updateStatsPanel();
      if (state === GameState.MENU) this.updateMainMenuPanel();
      if (state === GameState.SETTINGS) this.updateSettingsPanel();
      if (state === GameState.LEADERBOARD) this.updateLeaderboardPanel();
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
    show(this.statsEntity, state === GameState.STATS);
    show(this.leaderboardEntity, state === GameState.LEADERBOARD);
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
        [PowerUpType.DOUBLE_POINTS]: '2X PTS',
        [PowerUpType.PHASE]: 'PHASE',
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

    // Near-miss indicator (Round 5)
    setVisible(doc, 'near-miss', gs.nearMissTimer > 0);
    if (gs.nearMissTimer > 0) {
      setText(doc, 'near-miss', gs.nearMissCount > 1 ? `NEAR MISS! x${gs.nearMissCount}` : 'NEAR MISS!');
    }

    // Combo meter (Round 5) — shows when combo >= 5
    const combo = gs.longestCombo;
    if (gs.multiplier >= 3) {
      setText(doc, 'combo-meter', `COMBO x${gs.multiplier}`);
      setVisible(doc, 'combo-meter', true);
    } else {
      setVisible(doc, 'combo-meter', false);
    }

    // Milestone indicator (Round 5)
    setVisible(doc, 'milestone', gs.milestoneTimer > 0);
    if (gs.milestoneTimer > 0) {
      setText(doc, 'milestone', gs.milestoneText);
    }

    // Zone indicator (Round 5)
    if (gs.zoneChangeTimer > 0) {
      setText(doc, 'zone-indicator', `${gs.currentZoneName} ZONE`);
      setVisible(doc, 'zone-indicator', true);
    } else {
      setVisible(doc, 'zone-indicator', false);
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

    // Round 6: Performance rating
    setText(doc, 'rating', gs.rating || '');

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

    const totalPages = Math.ceil(total / this.ACH_PER_PAGE);
    setText(doc, 'ach-page', `Page ${this.achPage + 1}/${totalPages}`);

    // Update achievement list (paginated, 16 per page)
    const start = this.achPage * this.ACH_PER_PAGE;
    for (let i = 0; i < this.ACH_PER_PAGE; i++) {
      const idx = start + i;
      const a = gs.achievements[idx];
      if (a) {
        setText(doc, `ach-name-${i}`, a.name);
        setText(doc, `ach-desc-${i}`, a.description);
        setText(doc, `ach-status-${i}`, a.unlocked ? '[DONE]' : '[ ]');
        setVisible(doc, `ach-name-${i}`, true);
        setVisible(doc, `ach-desc-${i}`, true);
        setVisible(doc, `ach-status-${i}`, true);
      } else {
        setText(doc, `ach-name-${i}`, '');
        setText(doc, `ach-desc-${i}`, '');
        setText(doc, `ach-status-${i}`, '');
      }
    }
  }

  private updateStatsPanel() {
    if (!this.statsEntity || !this.statsTracker) return;
    const doc = getDoc(this.statsEntity);
    if (!doc) return;

    const s = this.statsTracker.get();
    setText(doc, 'stat-games', `${s.totalGames}`);
    setText(doc, 'stat-distance', StatsTrackerClass.formatDistance(s.totalDistance));
    setText(doc, 'stat-orbs', `${s.totalOrbs.toLocaleString()}`);
    setText(doc, 'stat-score', `${Math.floor(s.totalScore).toLocaleString()}`);
    setText(doc, 'stat-time', StatsTrackerClass.formatTime(s.totalTimePlayed));
    setText(doc, 'stat-longest', StatsTrackerClass.formatDistance(s.longestRun));
    setText(doc, 'stat-speed', `${s.highestSpeed.toFixed(1)} m/s`);
    setText(doc, 'stat-combo', `${s.longestCombo}`);
    setText(doc, 'stat-powerups', `${s.totalPowerUps}`);
  }

  private updateMainMenuPanel() {
    if (!this.menuEntity) return;
    const doc = getDoc(this.menuEntity);
    if (!doc) return;

    // Show best classic score
    const bestScore = this.gameSystem.highScores['classic'] || 0;
    if (bestScore > 0) {
      setText(doc, 'best-score', `Best: ${bestScore.toLocaleString()}`);
    } else {
      setText(doc, 'best-score', '');
    }
  }

  private updateSettingsPanel() {
    if (!this.settingsEntity) return;
    const doc = getDoc(this.settingsEntity);
    if (!doc) return;

    // Sync current values
    if (this.audio) {
      setText(doc, 'btn-toggle-sound', this.audio.muted ? 'OFF' : 'ON');
      setText(doc, 'volume-display', `${Math.round(this.audio.volume * 100)}%`);
    }
    setText(doc, 'btn-toggle-shake', this.gameSystem.screenShakeEnabled ? 'ON' : 'OFF');
    setText(doc, 'btn-toggle-lines', this.gameSystem.speedLinesEnabled ? 'ON' : 'OFF');
  }

  private updateLeaderboardPanel() {
    if (!this.leaderboardEntity) return;
    const doc = getDoc(this.leaderboardEntity);
    if (!doc) return;

    const hs = this.gameSystem.highScores;
    const modes = ['classic', 'sprint', 'time_attack', 'zen', 'endless', 'challenge'];
    for (const mode of modes) {
      const score = hs[mode];
      setText(doc, `score-${mode}`, score ? score.toLocaleString() : '---');
    }

    // Total games from stats
    if (this.statsTracker) {
      const s = this.statsTracker.get();
      setText(doc, 'total-games', `${s.totalGames}`);
    }
  }
}
