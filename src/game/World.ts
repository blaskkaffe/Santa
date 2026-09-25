import * as THREE from 'three';
import type { Theme, Collidable } from './types';
import { Height } from './constants';
import {
  ROW_LENGTH,
  ROWS_PER_CHUNK,
  CHUNK_LENGTH,
  CHUNKS_AHEAD,
  DESPAWN_MARGIN,
  HEIGHT_Y,
  CHIMNEY_DELIVERY_RADIUS,
  LANE_WIDTH,
  laneX,
} from './constants';
import { generateRow } from './Segment';
import {
  createHouse,
  createChimney,
  createSmokePuff,
  createTree,
  type TreeKind,
  createLampPost,
  createSnowman,
  createCar,
  createFence,
  createGift,
  createTallBuilding,
  createLandmark,
} from './props';

interface Animator {
  obj: THREE.Object3D;
  kind: 'bob' | 'spin';
  seed: number;
}

interface Chunk {
  group: THREE.Group;
  startDistance: number;
  endDistance: number;
  collidables: Collidable[];
  animators: Animator[];
}

const GROUND_LENGTH = 20000;
/** Distance each flanking house is offset from its lane's centerline, keeping the flight corridor clear. */
const HOUSE_OFFSET = 2.05;

export class World {
  readonly scene: THREE.Scene;
  private theme: Theme;
  private laneCount = 3;
  private chunks: Chunk[] = [];
  private generatedDistance = 0;
  private globalRowIndex = 0;
  private difficulty = 0;
  private ground?: THREE.Mesh;
  private roadStripes: THREE.Mesh[] = [];
  collidables: Collidable[] = [];

  constructor(scene: THREE.Scene, theme: Theme) {
    this.scene = scene;
    this.theme = theme;
    this.laneCount = theme.laneCount;
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    this.laneCount = theme.laneCount;
    this.reset();
  }

  reset() {
    for (const c of this.chunks) this.disposeChunk(c);
    this.chunks = [];
    this.collidables = [];
    this.generatedDistance = 0;
    this.globalRowIndex = 0;
    this.difficulty = 0;
    this.buildGround();
    this.ensureChunks(0);
  }

  /** World-space X of the boundary between lane k-1 and lane k (k = 0..laneCount spans the outer edges too). */
  private boundaryX(k: number): number {
    return (k - this.laneCount / 2) * LANE_WIDTH;
  }

  private buildSnowTexture(): THREE.Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const base = new THREE.Color(this.theme.palette.ground);
    ctx.fillStyle = base.getStyle();
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const shade = Math.random() < 0.5 ? 1.08 : 0.92;
      const c = base.clone().multiplyScalar(shade);
      ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0.5)`;
      const r = Math.random() * 1.6 + 0.3;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, (GROUND_LENGTH / 8) | 0);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildRoadTexture(roadWidth: number): THREE.Texture {
    const pxPerUnit = 24;
    const w = Math.max(8, Math.round(roadWidth * pxPerUnit));
    const tileLen = ROW_LENGTH; // world units per texture tile (repeats along Z)
    const h = Math.round(tileLen * pxPerUnit);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const base = new THREE.Color(this.theme.palette.road);
    ctx.fillStyle = base.getStyle();
    ctx.fillRect(0, 0, w, h);

    // subtle asphalt speckle
    for (let i = 0; i < 260; i++) {
      const shade = Math.random() < 0.5 ? 1.12 : 0.88;
      const c = base.clone().multiplyScalar(shade);
      ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0.4)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }

    // Dashed lane-divider lines at each internal lane boundary. Each tile draws
    // one centered dash; tiling repeat.set(1, N) stacks them into a continuous
    // dashed line down the road.
    ctx.fillStyle = 'rgba(255, 230, 160, 0.9)';
    const dashLen = h * 0.42;
    for (let k = 1; k < this.laneCount; k++) {
      const boundaryOffset = this.boundaryX(k) + roadWidth / 2;
      const px = (boundaryOffset / roadWidth) * w;
      ctx.fillRect(px - w * 0.008, h * 0.5 - dashLen / 2, Math.max(1, w * 0.016), dashLen);
    }
    // solid edge lines
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(w * 0.02, 0, Math.max(1, w * 0.012), h);
    ctx.fillRect(w * 0.98 - w * 0.012, 0, Math.max(1, w * 0.012), h);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, GROUND_LENGTH / tileLen);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildGround() {
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
    }
    for (const s of this.roadStripes) {
      this.scene.remove(s);
      s.geometry.dispose();
    }
    this.roadStripes = [];

    const width = this.laneCount * LANE_WIDTH + 44;
    const geo = new THREE.PlaneGeometry(width, GROUND_LENGTH);
    const mat = new THREE.MeshStandardMaterial({ map: this.buildSnowTexture(), roughness: 1, flatShading: true });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -GROUND_LENGTH / 2 + 100);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    const roadWidth = this.laneCount * LANE_WIDTH - 1.2;
    const roadMat = new THREE.MeshStandardMaterial({ map: this.buildRoadTexture(roadWidth), roughness: 0.95, flatShading: true });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, GROUND_LENGTH), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, -GROUND_LENGTH / 2 + 100);
    road.receiveShadow = true;
    this.scene.add(road);
    this.roadStripes.push(road);

    // Raised sidewalk curbs running along every lane boundary, including the outer edges.
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xd8dbe2, roughness: 1, flatShading: true });
    for (let k = 0; k <= this.laneCount; k++) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, GROUND_LENGTH), curbMat);
      curb.position.set(this.boundaryX(k), 0.08, -GROUND_LENGTH / 2 + 100);
      curb.receiveShadow = true;
      curb.castShadow = false;
      this.scene.add(curb);
      this.roadStripes.push(curb);
    }
  }

  private disposeChunk(chunk: Chunk) {
    this.scene.remove(chunk.group);
    chunk.group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }

  update(dt: number, traveledDistance: number) {
    this.difficulty = Math.min(1, traveledDistance / 1400);
    this.ensureChunks(traveledDistance);
    this.despawnBehind(traveledDistance);

    for (const chunk of this.chunks) {
      for (const a of chunk.animators) {
        if (a.kind === 'bob') {
          a.seed += dt;
          a.obj.position.y += Math.sin(a.seed * 3) * 0.002;
          a.obj.rotation.y += dt * 0.6;
        } else if (a.kind === 'spin') {
          a.obj.rotation.z -= dt * 1.4;
        }
      }
    }
  }

  private ensureChunks(traveledDistance: number) {
    const target = traveledDistance + CHUNKS_AHEAD * CHUNK_LENGTH;
    while (this.generatedDistance < target) {
      this.buildChunk();
    }
  }

  private despawnBehind(traveledDistance: number) {
    while (this.chunks.length && this.chunks[0].endDistance < traveledDistance - DESPAWN_MARGIN) {
      const chunk = this.chunks.shift()!;
      this.disposeChunk(chunk);
      this.collidables = this.collidables.filter((c) => !chunk.collidables.includes(c));
    }
  }

  private buildChunk() {
    const group = new THREE.Group();
    const startDistance = this.generatedDistance;
    const chunk: Chunk = { group, startDistance, endDistance: startDistance + CHUNK_LENGTH, collidables: [], animators: [] };

    for (let r = 0; r < ROWS_PER_CHUNK; r++) {
      const rowIndex = this.globalRowIndex++;
      const rowDistance = this.generatedDistance + r * ROW_LENGTH;
      const z = -rowDistance;
      const row = generateRow(this.laneCount, rowIndex, this.difficulty);
      this.buildRow(group, chunk, row, z, rowIndex);
    }

    this.generatedDistance += CHUNK_LENGTH;
    this.scene.add(group);
    this.chunks.push(chunk);
    this.collidables.push(...chunk.collidables);
  }

  /** Decorative (non-colliding) trees and lamp posts along the sidewalk boundaries. */
  private buildStreetscape(group: THREE.Group, z: number, rowIndex: number) {
    const boundaryCount = this.laneCount + 1;
    const boundary = rowIndex % boundaryCount;
    const pass = Math.floor(rowIndex / boundaryCount);
    const noise = Math.abs(Math.sin(rowIndex * 12.9898)) % 1;
    if (noise < 0.12) return; // occasional gap so the streetscape doesn't feel too rigid

    const x = this.boundaryX(boundary);
    const useLamp = pass % 3 === 1;
    if (useLamp) {
      const lamp = createLampPost();
      lamp.scale.setScalar(0.85);
      lamp.position.set(x, 0, z);
      group.add(lamp);
    } else {
      const kind: TreeKind = ['pine', 'oak', 'elm'][rowIndex % 3] as TreeKind;
      const tree = createTree(kind, this.theme, rowIndex);
      tree.scale.setScalar(0.6 + (noise % 0.3));
      tree.position.set(x, 0, z + (noise - 0.5) * 3);
      group.add(tree);
    }
  }

  private buildRow(group: THREE.Group, chunk: Chunk, row: ReturnType<typeof generateRow>, z: number, rowIndex: number) {
    const highBuildingLanes = new Set(
      row.obstacles.filter((o) => o.height === Height.HIGH).map((o) => o.lane),
    );

    this.buildStreetscape(group, z, rowIndex);

    // Decorative houses flank each lane like real street frontage — offset to
    // either side so the flight corridor down the lane centerline stays clear
    // at every height. Skipped where a tall hazard building already stands.
    for (let lane = 0; lane < this.laneCount; lane++) {
      const laneCenter = laneX(lane, this.laneCount);
      if (highBuildingLanes.has(lane)) continue;

      let chimneyHouse: THREE.Group | null = null;
      let chimneyHouseX = laneCenter;
      let chimneyHouseZ = z;

      for (const side of [-1, 1] as const) {
        const x = laneCenter + side * HOUSE_OFFSET;
        const seed = Math.abs(Math.sin(lane * 91.7 + side * 33.3 + z * 3.1)) * 1000;
        const house = createHouse({
          theme: this.theme,
          seed,
          width: 1.6 + (seed % 3) * 0.22,
          style: this.theme.houseStyle,
        });
        const houseZ = z + (seed % 4) - 2;
        house.position.set(x, 0, houseZ);
        group.add(house);

        if (row.chimney && row.chimney.lane === lane && side === -1) {
          chimneyHouse = house;
          chimneyHouseX = x;
          chimneyHouseZ = houseZ;
        }
      }

      if (row.chimney && row.chimney.lane === lane) {
        const roofTopY = (chimneyHouse?.userData.roofTopY as number) ?? 3.2;
        const chimney = createChimney(this.theme);
        chimney.position.set(chimneyHouseX + HOUSE_OFFSET * 0.3, roofTopY, chimneyHouseZ + 0.4);
        group.add(chimney);

        const smoke = createSmokePuff();
        smoke.position.set(chimneyHouseX + HOUSE_OFFSET * 0.3, roofTopY + 0.9, chimneyHouseZ + 0.4);
        smoke.scale.setScalar(0.6);
        group.add(smoke);
        chunk.animators.push({ obj: smoke, kind: 'bob', seed: Math.random() * 10 });

        const gift = createGift();
        gift.position.set(laneCenter, HEIGHT_Y[Height.MID], z);
        gift.scale.setScalar(0.9);
        group.add(gift);
        chunk.animators.push({ obj: gift, kind: 'bob', seed: Math.random() * 10 });

        chunk.collidables.push({
          kind: 'chimney',
          lane,
          height: Height.MID,
          z,
          radius: CHIMNEY_DELIVERY_RADIUS,
          hit: false,
          object: gift,
          giftMarker: gift,
        });
      }
    }

    // Hazards
    for (const obstacle of row.obstacles) {
      const x = laneX(obstacle.lane, this.laneCount);

      if (obstacle.height === Height.HIGH) {
        const useLandmark = Math.random() < 0.16;
        const tall = useLandmark ? createLandmark(this.theme.landmark, this.theme) : createTallBuilding(this.theme, Math.random() * 100);
        tall.position.set(x, 0, z);
        group.add(tall);
        if (useLandmark) {
          const hub = tall.userData.hub as THREE.Group | undefined;
          if (hub) chunk.animators.push({ obj: hub, kind: 'spin', seed: 0 });
        }
        chunk.collidables.push({
          kind: 'building',
          lane: obstacle.lane,
          height: Height.HIGH,
          z,
          radius: 2.1,
          hit: false,
          object: tall,
          // A tall building/landmark is a full ground-to-sky structure — it
          // blocks the whole lane, not just the HIGH band, so avoiding it
          // means changing lanes rather than ducking under it.
          blocksAllHeights: true,
        });
      } else if (obstacle.height === Height.MID) {
        if (obstacle.kind === 'smoke') {
          const puff = createSmokePuff(0xcfd6e3);
          puff.position.set(x, HEIGHT_Y[Height.MID], z);
          puff.scale.setScalar(1.3);
          group.add(puff);
          chunk.animators.push({ obj: puff, kind: 'bob', seed: Math.random() * 10 });
          chunk.collidables.push({ kind: 'smoke', lane: obstacle.lane, height: Height.MID, z, radius: 1.6, hit: false, object: puff });
        } else {
          const tree = createTree('pine', this.theme, Math.random() * 10);
          tree.position.set(x, 0, z);
          tree.scale.setScalar(1.25);
          group.add(tree);
          chunk.collidables.push({ kind: 'tree', lane: obstacle.lane, height: Height.MID, z, radius: 1.5, hit: false, object: tree });
        }
      } else {
        // LOW: street-level clutter, pick a random flavor.
        const roll = Math.random();
        let prop: THREE.Group;
        if (roll < 0.35) prop = createCar(Math.random() < 0.5 ? 0xb52a2a : 0x2a4bb5);
        else if (roll < 0.6) prop = createLampPost();
        else if (roll < 0.8) prop = createSnowman();
        else prop = createFence(3.4);
        prop.position.set(x, 0, z);
        group.add(prop);
        chunk.collidables.push({ kind: 'building', lane: obstacle.lane, height: Height.LOW, z, radius: 1.3, hit: false, object: prop });
      }
    }
  }
}
