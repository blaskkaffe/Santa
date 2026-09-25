// Grid + world tuning constants shared across the game.

export const LANE_WIDTH = 6.4;

/** The three flight bands Santa can occupy. */
export const Height = {
  LOW: 0,
  MID: 1,
  HIGH: 2,
} as const;
export type Height = (typeof Height)[keyof typeof Height];

export const HEIGHT_Y: Record<Height, number> = {
  [Height.LOW]: 1.6,
  [Height.MID]: 5.2,
  [Height.HIGH]: 9.2,
};

export const HEIGHT_ORDER = [Height.LOW, Height.MID, Height.HIGH];

/** Length (in world Z units) of a single obstacle/prop row. */
export const ROW_LENGTH = 12;
/** Rows generated per chunk. */
export const ROWS_PER_CHUNK = 10;
export const CHUNK_LENGTH = ROW_LENGTH * ROWS_PER_CHUNK;
/** How many chunks ahead of the player must exist at all times. */
export const CHUNKS_AHEAD = 4;
/** How far behind the player a chunk may fall before being recycled. */
export const DESPAWN_MARGIN = ROW_LENGTH * 3;

/** Every Nth row is left open as a cross street / plaza instead of built up. */
export const CROSS_STREET_EVERY = 4;
export const CROSS_STREET_DEPTH = 7;
/** Chance an otherwise-buildable lane is left as an open lot for breathing room. */
export const EMPTY_LOT_CHANCE = 0.14;

export const BASE_SPEED = 13; // units / second
export const MAX_SPEED = 30;
export const SPEED_RAMP_PER_METER = 0.012; // speed gained per meter traveled

export const LANE_MOVE_LERP = 10; // higher = snappier lane change
export const HEIGHT_MOVE_LERP = 8;

export const MAX_HEALTH = 100;
export const DAMAGE_BUILDING = 40;
export const DAMAGE_SMOKE = 15;
export const DAMAGE_TREE = 25;
export const HIT_INVULN_SECONDS = 1.0;

export const GIFT_SCORE = 150;
export const DISTANCE_SCORE_PER_METER = 1;

export const PLAYER_COLLISION_RADIUS = 1.1;
export const CHIMNEY_DELIVERY_RADIUS = 2.2;

export function laneX(lane: number, laneCount: number): number {
  return (lane - (laneCount - 1) / 2) * LANE_WIDTH;
}
