# Neon Sprint VR

A high-speed 3-lane endless runner built with IWSDK. Dodge obstacles, collect orbs, chain combos, and chase high scores across 6 game modes in VR or desktop.

**[Play Now](https://ellyz2426.github.io/neon-sprint/)**

## Controls

| Platform | Input | Action |
|----------|-------|--------|
| Keyboard | A / Left Arrow | Move left |
| Keyboard | D / Right Arrow | Move right |
| Keyboard | P / Escape | Pause |
| VR | Left/Right Thumbstick | Switch lanes |
| VR | B Button | Pause |
| VR | Laser Pointer | Menu interaction |

## Game Modes

| Mode | Description |
|------|-------------|
| **Classic** | 3 lives — survive as far as you can |
| **Sprint** | Race to 2,000m (1 life) |
| **Time Attack** | 90 seconds — maximize your distance |
| **Zen** | No obstacles — just run and collect |
| **Endless** | One life — how far can you go? |
| **Challenge** | Preset wave patterns — 5 lives |

## Features

- **5 obstacle types** — barriers, columns, double barriers, pyramids, diamonds
- **Collectible orbs** with multiplier chain (up to 10x)
- **5 power-ups** — Shield, Magnet, Slow-Mo, Double Points, Phase
- **65 achievements** across 10+ categories
- **Performance rating** (S/A/B/C/D/F) on every run
- **Challenge mode waves** — 5 patterns with increasing difficulty
- **Near-miss detection** with audio and HUD feedback
- **Distance milestones** (100m to 20km) with celebrations
- **Lifetime stats** and **leaderboard** with per-mode high scores
- **Neon corridor** with grid floor, walls, lane dividers, ceiling beams
- **Environment color progression** — 4 zones (cyan to green to purple to red)
- **80-particle pool** for orb bursts, hits, power-ups, milestones, death explosions
- **Star field**, **player trail**, **floor pulses**, **wall holograms**, **warning markers**
- **FOV speed effect** — camera widens at high speeds
- **Screen shake**, **speed lines**, **combo flash** feedback
- **Procedural audio** — 11+ synthesized sound types via Web Audio API
- **Ambient music engine** — synthwave drone that scales with game speed
- **12 PanelUI panels** — all VR-native spatial UI, zero HTML DOM overlays
- **XR + keyboard input** with head-tracked HUD

## Tech Stack

- [IWSDK](https://iwsdk.dev) 0.4.x (Immersive Web SDK)
- TypeScript + Vite
- PanelUI (uikitml) spatial UI
- ECS architecture (EliCS)
- Procedural audio via Web Audio API
- Zero external assets — all visuals are procedural geometry

## Architecture

```
src/
  index.ts           # World setup, corridor, panel registration
  game-system.ts     # Core game logic, obstacles, power-ups, particles, effects
  ui-system.ts       # PanelUI bindings and HUD updates
  audio-system.ts    # Procedural audio synthesis + ambient music
  stats-tracker.ts   # Lifetime stats persistence
ui/
  *.uikitml          # 12 spatial UI panel templates
```

All game logic runs in ECS Systems (`GameSystem`, `UISystem`) registered via `world.registerSystem()`. No raw `requestAnimationFrame` or DOM UI.
