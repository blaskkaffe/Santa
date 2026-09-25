import type * as THREE from 'three';

export interface ThemePalette {
  sky: [number, number, number]; // top -> bottom gradient stops (hex numbers as RGB triplet colors)
  fog: number;
  moonlight: number;
  ambient: number;
  ground: number;
  road: number;
  roofColors: number[];
  wallColors: number[];
  trim: number;
  windowLit: number;
  treeColor: number;
  treeColorDark: number;
  snow: number;
}

export type LandmarkKind = 'stave-tower' | 'clock-tower' | 'castle-spire' | 'windmill';

export interface Theme {
  id: string;
  name: string;
  subtitle: string;
  laneCount: number;
  palette: ThemePalette;
  landmark: LandmarkKind;
  houseStyle: 'cottage' | 'terrace' | 'fachwerk' | 'canal';
  cardAccent: string; // CSS color for level select card
}

export interface RowObstacle {
  lane: number;
  height: number; // Height enum value
  kind: 'building' | 'smoke' | 'tree';
}

export interface RowChimney {
  lane: number;
}

export interface WorldRow {
  z: number; // local z within chunk (negative, far side)
  obstacles: RowObstacle[];
  chimney: RowChimney | null;
}

export interface Collidable {
  kind: 'building' | 'smoke' | 'tree' | 'chimney';
  lane: number;
  height: number;
  z: number; // fixed world Z (world does not move; the player moves toward -Z)
  radius: number;
  hit: boolean; // obstacle already resolved (hit or delivered) this pass
  object: THREE.Object3D;
  giftMarker?: THREE.Object3D;
}
