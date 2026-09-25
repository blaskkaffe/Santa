import * as THREE from 'three';
import { createSleigh } from './props';
import {
  HEIGHT_Y,
  HEIGHT_ORDER,
  Height,
  LANE_MOVE_LERP,
  HEIGHT_MOVE_LERP,
  PLAYER_COLLISION_RADIUS,
  laneX,
} from './constants';

export class Player {
  readonly group: THREE.Group;
  private readonly sleighTilt: THREE.Group;
  lane: number;
  heightIndex: number; // index into HEIGHT_ORDER
  private targetX: number;
  private targetY: number;
  private laneCount: number;
  private bobT = Math.random() * 10;
  invulnTimer = 0;

  constructor(laneCount: number) {
    this.laneCount = laneCount;
    this.lane = Math.floor(laneCount / 2);
    this.heightIndex = 1; // MID
    const { group, hub } = createSleigh();
    this.group = group;
    this.sleighTilt = hub;
    this.targetX = laneX(this.lane, this.laneCount);
    this.targetY = HEIGHT_Y[HEIGHT_ORDER[this.heightIndex]];
    this.group.position.set(this.targetX, this.targetY, 0);
  }

  setLaneCount(n: number) {
    this.laneCount = n;
    this.lane = Math.min(this.lane, n - 1);
    this.targetX = laneX(this.lane, this.laneCount);
  }

  get currentHeight(): Height {
    return HEIGHT_ORDER[this.heightIndex];
  }

  moveLane(delta: number) {
    this.lane = THREE.MathUtils.clamp(this.lane + delta, 0, this.laneCount - 1);
    this.targetX = laneX(this.lane, this.laneCount);
  }

  moveHeight(delta: number) {
    this.heightIndex = THREE.MathUtils.clamp(this.heightIndex + delta, 0, HEIGHT_ORDER.length - 1);
    this.targetY = HEIGHT_Y[HEIGHT_ORDER[this.heightIndex]];
  }

  update(dt: number) {
    const p = this.group.position;
    const prevX = p.x;
    p.x += (this.targetX - p.x) * Math.min(1, LANE_MOVE_LERP * dt);
    p.y += (this.targetY - p.y) * Math.min(1, HEIGHT_MOVE_LERP * dt);

    this.bobT += dt;
    p.y += Math.sin(this.bobT * 2.2) * 0.06;

    // Bank into turns and pitch with height changes for a lively feel.
    const lateralVel = (p.x - prevX) / Math.max(dt, 0.0001);
    const targetRoll = THREE.MathUtils.clamp(-lateralVel * 0.05, -0.6, 0.6);
    const targetPitch = THREE.MathUtils.clamp((this.targetY - p.y) * 0.12, -0.35, 0.35);
    this.sleighTilt.rotation.z += (targetRoll - this.sleighTilt.rotation.z) * Math.min(1, 6 * dt);
    this.sleighTilt.rotation.x += (targetPitch - this.sleighTilt.rotation.x) * Math.min(1, 6 * dt);

    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      const flicker = Math.sin(this.invulnTimer * 40) > 0;
      this.group.visible = flicker;
    } else {
      this.group.visible = true;
    }
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get collisionRadius(): number {
    return PLAYER_COLLISION_RADIUS;
  }

  reset(laneCount: number) {
    this.laneCount = laneCount;
    this.lane = Math.floor(laneCount / 2);
    this.heightIndex = 1;
    this.targetX = laneX(this.lane, this.laneCount);
    this.targetY = HEIGHT_Y[HEIGHT_ORDER[this.heightIndex]];
    this.group.position.set(this.targetX, this.targetY, 0);
    this.sleighTilt.rotation.set(0, 0, 0);
    this.invulnTimer = 0;
    this.group.visible = true;
  }
}
