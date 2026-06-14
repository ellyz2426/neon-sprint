# Neon Sprint VR

A 3-lane endless runner built with IWSDK (Immersive Web SDK). Sprint through a neon corridor, dodge obstacles, collect orbs, and chase high scores — in browser or VR.

## Play

**Live:** [https://ellyz2426.github.io/neon-sprint/](https://ellyz2426.github.io/neon-sprint/)

## Controls

### Keyboard (Browser)
| Key | Action |
|-----|--------|
| A / Left Arrow | Move left |
| D / Right Arrow | Move right |
| P / Escape | Pause |

### VR (Meta Quest)
| Input | Action |
|-------|--------|
| Left/Right Thumbstick | Move left/right |
| B Button | Pause |
| Laser Pointer | Menu interaction |

## Game Modes

| Mode | Description |
|------|-------------|
| **Classic** | 3 lives — survive as far as you can |
| **Sprint** | Race to 2,000m as fast as possible (1 life) |
| **Time Attack** | 90 seconds — maximize your distance |
| **Zen** | No obstacles — just run and collect |
| **Endless** | One life — how far can you go? |
| **Challenge** | Preset wave patterns — 5 lives |

## Features

- **5 obstacle types** — barriers, columns, double barriers, pyramids, diamonds
- **Collectible orbs** with multiplier chain (up to 10x)
- **3 power-ups** — Shield (absorbs a hit), Magnet (auto-collects orbs), Slow-Mo (reduces speed)
- **42 achievements** across distance, score, orb, combo, speed, and mode categories
- **Challenge mode waves** — 5 preset wave patterns with increasing difficulty
- **Environment color progression** — corridor shifts from cyan to green to purple to red as distance increases
- **Particle effects** — orb collection bursts, obstacle hit explosions, speed trails
- **Screen shake** on obstacle hits
- **Speed progression** from 10 to 45 m/s
- **High score tracking** with localStorage persistence
- **10 PanelUI spatial panels** — all UI is VR-native, no HTML overlays
- **XR + keyboard input** with head-tracked HUD

## Tech Stack

- [IWSDK](https://iwsdk.dev) 0.3.1 (Immersive Web SDK)
- TypeScript + Vite
- PanelUI (uikitml) spatial UI system
- ECS architecture (EliCS)

## Development

```bash
npm install
npm run dev        # Start dev server
npm run build      # Production build
```

## Architecture

```
src/
  index.ts          # World setup, corridor, panel registration
  game-system.ts    # Core game logic, physics, particles, power-ups
  ui-system.ts      # PanelUI bindings and HUD updates
ui/
  *.uikitml         # 10 spatial UI panel templates
```

All game logic runs in ECS Systems (`GameSystem`, `UISystem`) registered via `world.registerSystem()`. No raw `requestAnimationFrame` or DOM UI.
