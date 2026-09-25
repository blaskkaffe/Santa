import { Height } from './constants';
import type { RowObstacle, WorldRow } from './types';

const HEIGHT_WEIGHTS: [Height, number][] = [
  [Height.LOW, 0.34],
  [Height.MID, 0.33],
  [Height.HIGH, 0.33],
];

function weightedHeight(rand: () => number): Height {
  const r = rand();
  let acc = 0;
  for (const [h, w] of HEIGHT_WEIGHTS) {
    acc += w;
    if (r <= acc) return h;
  }
  return Height.MID;
}

function kindForHeight(h: Height): RowObstacle['kind'] {
  if (h === Height.LOW) return 'building'; // ground-level clutter, rendered via buildingish prop
  if (h === Height.MID) return Math.random() < 0.5 ? 'tree' : 'smoke';
  return 'building';
}

/**
 * Generates the obstacle/chimney layout for a single row given its global
 * index and a 0..1 difficulty ramp. Pure data — no THREE objects here.
 */
export function generateRow(laneCount: number, globalRowIndex: number, difficulty: number): WorldRow {
  const row: WorldRow = { z: 0, obstacles: [], chimney: null };

  // Safe tutorial buffer at the very start of a run.
  if (globalRowIndex < 3) {
    if (globalRowIndex === 1) {
      row.chimney = { lane: Math.floor(laneCount / 2) };
    }
    return row;
  }

  const rand = Math.random;
  const obstacleChance = 0.42 + difficulty * 0.28;
  const maxObstacles = Math.min(laneCount - 1, difficulty > 0.6 ? 2 : 1);

  const usedLanes = new Set<number>();
  if (rand() < obstacleChance) {
    const obstacleCount = 1 + (rand() < difficulty * 0.5 ? 1 : 0);
    for (let i = 0; i < Math.min(obstacleCount, maxObstacles); i++) {
      let lane = Math.floor(rand() * laneCount);
      let guard = 0;
      while (usedLanes.has(lane) && guard++ < 6) lane = Math.floor(rand() * laneCount);
      usedLanes.add(lane);
      const height = weightedHeight(rand);
      const kind = kindForHeight(height);
      row.obstacles.push({ lane, height, kind });
    }
  }

  // Chimney/gift placement: favor lanes+MID that are not already obstructed.
  const chimneyChance = 0.5 - difficulty * 0.12;
  if (rand() < chimneyChance) {
    const freeLanes: number[] = [];
    for (let lane = 0; lane < laneCount; lane++) {
      const blocked = row.obstacles.some((o) => o.lane === lane && o.height === Height.MID);
      if (!blocked) freeLanes.push(lane);
    }
    if (freeLanes.length > 0) {
      row.chimney = { lane: freeLanes[Math.floor(rand() * freeLanes.length)] };
    }
  }

  return row;
}
