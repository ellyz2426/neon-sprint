/**
 * Lifetime Stats Tracker for Neon Sprint
 * Persists across sessions via localStorage.
 */

export interface LifetimeStats {
  totalGames: number;
  totalDistance: number;
  totalOrbs: number;
  totalScore: number;
  totalTimePlayed: number;
  totalPowerUps: number;
  longestRun: number;
  highestSpeed: number;
  longestCombo: number;
  bestMultiplier: number;
  gamesPerMode: Record<string, number>;
}

const STORAGE_KEY = 'neon-sprint-lifetime-stats';

const DEFAULT_STATS: LifetimeStats = {
  totalGames: 0,
  totalDistance: 0,
  totalOrbs: 0,
  totalScore: 0,
  totalTimePlayed: 0,
  totalPowerUps: 0,
  longestRun: 0,
  highestSpeed: 0,
  longestCombo: 0,
  bestMultiplier: 0,
  gamesPerMode: {},
};

export class StatsTracker {
  private stats: LifetimeStats;

  constructor() {
    this.stats = this.load();
  }

  private load(): LifetimeStats {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return { ...DEFAULT_STATS, ...parsed };
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_STATS };
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stats));
    } catch { /* ignore */ }
  }

  /** Record a completed run */
  recordRun(data: {
    mode: string;
    distance: number;
    orbs: number;
    score: number;
    time: number;
    powerUps: number;
    maxSpeed: number;
    longestCombo: number;
    bestMultiplier: number;
  }) {
    this.stats.totalGames++;
    this.stats.totalDistance += data.distance;
    this.stats.totalOrbs += data.orbs;
    this.stats.totalScore += data.score;
    this.stats.totalTimePlayed += data.time;
    this.stats.totalPowerUps += data.powerUps;
    this.stats.longestRun = Math.max(this.stats.longestRun, data.distance);
    this.stats.highestSpeed = Math.max(this.stats.highestSpeed, data.maxSpeed);
    this.stats.longestCombo = Math.max(this.stats.longestCombo, data.longestCombo);
    this.stats.bestMultiplier = Math.max(this.stats.bestMultiplier, data.bestMultiplier);

    if (!this.stats.gamesPerMode[data.mode]) {
      this.stats.gamesPerMode[data.mode] = 0;
    }
    this.stats.gamesPerMode[data.mode]++;

    this.save();
  }

  get(): LifetimeStats {
    return { ...this.stats };
  }

  reset() {
    this.stats = { ...DEFAULT_STATS };
    this.save();
  }

  /** Format distance for display */
  static formatDistance(d: number): string {
    if (d >= 1000) return `${(d / 1000).toFixed(1)}km`;
    return `${Math.floor(d)}m`;
  }

  /** Format time for display */
  static formatTime(seconds: number): string {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    }
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  }
}

export const statsTracker = new StatsTracker();
