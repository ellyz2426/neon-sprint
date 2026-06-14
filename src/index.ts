import {
  World,
  Mesh,
  Group,
  BoxGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Color,
  AmbientLight,
  PointLight,
  DirectionalLight,
  Fog,
  DoubleSide,
  LineSegments,
  LineBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  PanelUI,
  Follower,
} from '@iwsdk/core';

import { GameSystem } from './game-system.js';
import { UISystem } from './ui-system.js';
import type { CorridorRefs } from './game-system.js';
import { audioManager } from './audio-system.js';
import { statsTracker } from './stats-tracker.js';

async function main() {
  const container = document.getElementById('app') as HTMLDivElement;

  const world = await World.create(container, {
    xr: { offer: 'once' as const },
    render: {
      fov: 75,
      near: 0.1,
      far: 200,
      defaultLighting: false,
    },
    features: {
      locomotion: false,
      grabbing: false,
      physics: false,
    },
  });

  // Set initial camera position
  world.camera.position.set(0, 1.6, 0);
  world.camera.lookAt(0, 1.5, -10);

  // Scene atmosphere
  world.scene.background = new Color(0x000811);
  world.scene.fog = new Fog(0x000811, 30, 100);

  // Lighting
  const ambient = new AmbientLight(0x112244, 0.3);
  world.scene.add(ambient);

  const dirLight = new DirectionalLight(0x4488ff, 0.4);
  dirLight.position.set(0, 10, -5);
  world.scene.add(dirLight);

  const pointLightRefs: Array<{ color: Color }> = [];
  for (let i = 0; i < 6; i++) {
    const pl = new PointLight(0x00ffff, 1.5, 30);
    pl.position.set(i % 2 === 0 ? -4 : 4, 3, -i * 15);
    world.scene.add(pl);
    pointLightRefs.push(pl);
  }

  const corridorRefs = buildCorridor(world, pointLightRefs);

  world.registerSystem(GameSystem);
  world.registerSystem(UISystem);

  const gameSystem = world.getSystem(GameSystem)!;
  const uiSystem = world.getSystem(UISystem)!;

  const cam = world.camera;

  const panelConfigs: Array<{ config: string; offset: [number, number, number]; spd: number }> = [
    { config: './ui/main-menu.json', offset: [0, 0, -2.5], spd: 6 },
    { config: './ui/hud.json', offset: [0, -0.7, -2], spd: 8 },
    { config: './ui/game-over.json', offset: [0, 0, -2.5], spd: 6 },
    { config: './ui/pause-menu.json', offset: [0, 0.1, -2.2], spd: 6 },
    { config: './ui/mode-select.json', offset: [0, 0, -2.5], spd: 6 },
    { config: './ui/settings.json', offset: [0, 0, -2.5], spd: 6 },
    { config: './ui/achievements.json', offset: [0, 0.1, -2.5], spd: 6 },
    { config: './ui/tutorial.json', offset: [0, 0, -2.5], spd: 6 },
    { config: './ui/countdown.json', offset: [0, 0.2, -2], spd: 10 },
    { config: './ui/new-record.json', offset: [0, 0.4, -2], spd: 8 },
    { config: './ui/stats.json', offset: [0, 0, -2.5], spd: 6 },
    { config: './ui/leaderboard.json', offset: [0, 0, -2.5], spd: 6 },
  ];

  for (const pc of panelConfigs) {
    const entity = world.createTransformEntity();
    entity.addComponent(PanelUI, { config: pc.config });
    entity.addComponent(Follower, {
      target: cam,
      offsetPosition: pc.offset,
      speed: pc.spd,
    });
  }

  gameSystem.setRefs({ world, uiSystem, corridorRefs, audioManager, statsTracker });
  uiSystem.setRefs({ gameSystem, audioManager, statsTracker });
}

function buildCorridor(world: World, pointLights: Array<{ color: Color }>): CorridorRefs {
  const cw = 8, wh = 4, cl = 120;

  const floorGeo = new PlaneGeometry(cw, cl);
  const floorMat = new MeshStandardMaterial({ color: 0x001122, emissive: 0x001133, emissiveIntensity: 0.2 });
  const floor = new Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -cl / 2 + 10);
  world.scene.add(floor);

  const gridGroup = new Group();
  const gridMat = new LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.25 });
  for (let x = -cw / 2; x <= cw / 2; x += 1) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([x, 0.005, 10, x, 0.005, -cl + 10], 3));
    gridGroup.add(new LineSegments(g, gridMat));
  }
  for (let z = 10; z >= -cl + 10; z -= 2) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-cw / 2, 0.005, z, cw / 2, 0.005, z], 3));
    gridGroup.add(new LineSegments(g, gridMat));
  }
  world.scene.add(gridGroup);

  const laneMat = new LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
  for (const xp of [-2, 2]) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([xp, 0.01, 10, xp, 0.01, -cl + 10], 3));
    world.scene.add(new LineSegments(g, laneMat));
  }

  const wallMat = new MeshStandardMaterial({ color: 0x001133, emissive: 0x0044aa, emissiveIntensity: 0.3, transparent: true, opacity: 0.12, side: DoubleSide });
  const trimMat = new LineBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.8 });
  for (const s of [-1, 1]) {
    const wg = new PlaneGeometry(cl, wh);
    const w = new Mesh(wg, wallMat);
    w.position.set(s * cw / 2, wh / 2, -cl / 2 + 10);
    w.rotation.y = s * Math.PI / 2;
    world.scene.add(w);
    for (const y of [0.01, wh]) {
      const tg = new BufferGeometry();
      tg.setAttribute('position', new Float32BufferAttribute([s * cw / 2, y, 10, s * cw / 2, y, -cl + 10], 3));
      world.scene.add(new LineSegments(tg, trimMat));
    }
  }

  const beamMat = new MeshStandardMaterial({ color: 0x002244, emissive: 0x0066cc, emissiveIntensity: 0.4, transparent: true, opacity: 0.3 });
  for (let z = 5; z >= -cl + 10; z -= 10) {
    const bg = new BoxGeometry(cw, 0.1, 0.1);
    const b = new Mesh(bg, beamMat);
    b.position.set(0, wh, z);
    world.scene.add(b);
  }

  return { floorMat, wallMat, gridMat, laneMat, trimMat, beamMat, pointLights };
}

main().catch(console.error);
