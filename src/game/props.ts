import * as THREE from 'three';
import type { Theme, LandmarkKind } from './types';

// ---------------------------------------------------------------------------
// Shared low-poly / flat-shaded cartoon prop factory.
// Every builder returns a THREE.Group so callers can position/rotate freely.
// Materials are cached by color to keep draw calls & memory reasonable.
// ---------------------------------------------------------------------------

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `${color}-${JSON.stringify(opts)}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.02,
      ...opts,
    });
    materialCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, color: number, opts?: Partial<THREE.MeshStandardMaterialParameters>): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(Math.abs(seed) * 9973) % arr.length];
}

/** Deterministic xorshift32 PRNG so a house's shape, colors, and details are
 * drawn independently rather than all derived from one correlated seed. */
function makeRng(seed: number): () => number {
  let s = (Math.floor(Math.abs(seed) * 100000) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function pickWith<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// --- Houses ------------------------------------------------------------

export interface HouseOptions {
  theme: Theme;
  seed: number;
  /** Caps how wide the rolled house may be (paired streetside houses need room to breathe). */
  maxWidth?: number;
  style?: 'cottage' | 'terrace' | 'fachwerk' | 'canal';
}

type RoofArchetype = 'pyramid' | 'gable' | 'flatParapet' | 'onionTurret' | 'stepped';

const ROOF_POOLS: Record<NonNullable<HouseOptions['style']>, RoofArchetype[]> = {
  cottage: ['pyramid', 'pyramid', 'gable', 'gable', 'flatParapet'],
  terrace: ['gable', 'gable', 'flatParapet', 'flatParapet', 'pyramid'],
  fachwerk: ['gable', 'gable', 'gable', 'pyramid'],
  canal: ['stepped', 'stepped', 'flatParapet', 'gable'],
};

function addRoofSnow(g: THREE.Group, w: number, d: number, h: number, roofH: number, theme: Theme) {
  if (!theme.palette.snow) return;
  const roofBaseR = Math.hypot(w, d) * 0.62;
  const snowFrac = 0.4;
  const snowH = roofH * snowFrac;
  const snowR = roofBaseR * snowFrac * 1.08;
  const snowCap = mesh(new THREE.ConeGeometry(snowR, snowH, 4), theme.palette.snow, { roughness: 1 });
  snowCap.rotation.y = Math.PI / 4;
  snowCap.position.y = h + roofH - snowH / 2; // apex flush with the main roof's apex
  g.add(snowCap);
}

function buildPyramidRoof(g: THREE.Group, w: number, d: number, h: number, roofColor: number, theme: Theme, rng: () => number): number {
  const roofH = 1.3 + rng() * 0.9;
  const roof = mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, roofH, 4), roofColor);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + roofH / 2;
  g.add(roof);
  addRoofSnow(g, w, d, h, roofH, theme);
  return h + roofH;
}

function buildGableRoof(g: THREE.Group, w: number, d: number, h: number, wallColor: number, roofColor: number, theme: Theme, rng: () => number): number {
  const rise = 1.1 + rng() * 0.8;
  const halfW = (w / 2) * 1.06;
  const slantLen = Math.hypot(halfW, rise);
  const angle = Math.atan2(rise, halfW);
  const depth = d * 1.1;
  const panelGeo = new THREE.BoxGeometry(slantLen, 0.14, depth);

  const panelL = mesh(panelGeo, roofColor);
  panelL.rotation.z = angle;
  panelL.position.set(-halfW / 2, h + rise / 2, 0);
  g.add(panelL);

  const panelR = mesh(panelGeo, roofColor);
  panelR.rotation.z = -angle;
  panelR.position.set(halfW / 2, h + rise / 2, 0);
  g.add(panelR);

  // Triangular gable-end fascia, filled so the front/back don't show a gap
  // between the wall top and the two sloped panels.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-halfW, 0);
  gableShape.lineTo(halfW, 0);
  gableShape.lineTo(0, rise);
  gableShape.closePath();
  const gableGeo = new THREE.ShapeGeometry(gableShape);
  for (const zSide of [1, -1]) {
    const gableFace = mesh(gableGeo, wallColor);
    gableFace.position.set(0, h, zSide * (depth / 2 - 0.02));
    if (zSide < 0) gableFace.rotation.y = Math.PI;
    g.add(gableFace);
  }

  if (theme.palette.snow) {
    const ridgeSnow = mesh(new THREE.BoxGeometry(0.4, 0.16, depth * 1.02), theme.palette.snow, { roughness: 1 });
    ridgeSnow.position.set(0, h + rise, 0);
    g.add(ridgeSnow);
  }
  return h + rise;
}

function buildFlatParapetRoof(g: THREE.Group, w: number, d: number, h: number, roofColor: number, theme: Theme): number {
  const roofH = 0.22;
  const flat = mesh(new THREE.BoxGeometry(w, roofH, d), roofColor);
  flat.position.y = h + roofH / 2;
  g.add(flat);

  const pH = 0.42;
  const pT = 0.14;
  const front = mesh(new THREE.BoxGeometry(w, pH, pT), roofColor);
  front.position.set(0, h + roofH + pH / 2, d / 2 - pT / 2);
  const back = mesh(new THREE.BoxGeometry(w, pH, pT), roofColor);
  back.position.set(0, h + roofH + pH / 2, -(d / 2 - pT / 2));
  const left = mesh(new THREE.BoxGeometry(pT, pH, d), roofColor);
  left.position.set(-w / 2 + pT / 2, h + roofH + pH / 2, 0);
  const right = mesh(new THREE.BoxGeometry(pT, pH, d), roofColor);
  right.position.set(w / 2 - pT / 2, h + roofH + pH / 2, 0);
  g.add(front, back, left, right);

  if (theme.palette.snow) {
    const snowFlat = mesh(new THREE.BoxGeometry(w * 0.92, 0.08, d * 0.92), theme.palette.snow, { roughness: 1 });
    snowFlat.position.y = h + roofH + 0.04;
    g.add(snowFlat);
  }
  return h + roofH + pH;
}

/** Rare fairy-tale flourish: a drum-and-dome turret roof. */
function buildOnionTurretRoof(g: THREE.Group, w: number, h: number, roofColor: number, theme: Theme): number {
  const drumH = 0.5;
  const drumR = Math.min(w, 3) * 0.4;
  const drum = mesh(new THREE.CylinderGeometry(drumR, drumR * 1.08, drumH, 8), roofColor);
  drum.position.y = h + drumH / 2;
  g.add(drum);

  const domeR = drumR * 1.15;
  const dome = mesh(new THREE.SphereGeometry(domeR, 8, 8), roofColor);
  dome.scale.set(1, 1.3, 1);
  dome.position.y = h + drumH + domeR * 0.3;
  g.add(dome);

  const spikeY = h + drumH + domeR * 0.3 + domeR * 1.3;
  const spike = mesh(new THREE.ConeGeometry(0.06, 0.55, 6), theme.palette.trim);
  spike.position.y = spikeY + 0.27;
  g.add(spike);

  if (theme.palette.snow) {
    const snowDome = mesh(new THREE.SphereGeometry(domeR * 0.62, 8, 8), theme.palette.snow, { roughness: 1 });
    snowDome.scale.set(1, 0.8, 1);
    snowDome.position.y = h + drumH + domeR * 0.55;
    g.add(snowDome);
  }
  return spikeY + 0.55;
}

function buildSteppedRoof(g: THREE.Group, w: number, d: number, h: number, roofColor: number): number {
  const roofH = 0.6;
  const roof = mesh(new THREE.BoxGeometry(w * 1.05, roofH, d * 1.05), roofColor);
  roof.position.y = h + roofH / 2;
  g.add(roof);
  const cap = mesh(new THREE.ConeGeometry(w * 0.42, 0.9, 4), roofColor);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = h + roofH + 0.45;
  g.add(cap);
  return h + roofH + 0.9;
}

const STRING_LIGHT_COLORS = [0xff4d4d, 0x4dff88, 0xffe14d, 0x4db4ff];

function addStringLights(g: THREE.Group, w: number, h: number, d: number, rng: () => number) {
  const count = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x = -w / 2 + 0.3 + t * (w - 0.6);
    const color = pickWith(rng, STRING_LIGHT_COLORS);
    const bulb = mesh(new THREE.SphereGeometry(0.055, 6, 6), color, { emissive: color, emissiveIntensity: 1.4 });
    bulb.position.set(x, h + 0.05, d / 2 + 0.06);
    g.add(bulb);
  }
}

export function createHouse(opts: HouseOptions): THREE.Group {
  const { theme, style = 'cottage' } = opts;
  const rng = makeRng(opts.seed);
  const g = new THREE.Group();

  const maxWidth = opts.maxWidth ?? 3.4;
  const w = THREE.MathUtils.clamp(2.0 + rng() * 1.7, 1.5, maxWidth);
  const d = 2.5 + rng() * 1.2;
  const h = 2.1 + rng() * 1.8;
  const wallColor = pickWith(rng, theme.palette.wallColors);
  const roofColor = pickWith(rng, theme.palette.roofColors);

  const body = mesh(new THREE.BoxGeometry(w, h, d), wallColor);
  body.position.y = h / 2;
  g.add(body);

  if (style === 'fachwerk') {
    // Timber trim strips on the facade.
    const beamMat = theme.palette.trim;
    for (let i = 0; i < 3; i++) {
      const beam = mesh(new THREE.BoxGeometry(0.12, h * 0.92, 0.06), beamMat);
      beam.position.set(-w / 2 + (i / 2) * w, h / 2, d / 2 + 0.03);
      g.add(beam);
    }
    const beamH = mesh(new THREE.BoxGeometry(w * 0.92, 0.12, 0.06), beamMat);
    beamH.position.set(0, h * 0.65, d / 2 + 0.03);
    g.add(beamH);
  }

  // A rare fairy-tale turret regardless of region; otherwise roll from the
  // region's normal roof pool so silhouettes vary house to house.
  const archetype: RoofArchetype = rng() < 0.07 ? 'onionTurret' : pickWith(rng, ROOF_POOLS[style]);
  let roofTopY: number;
  switch (archetype) {
    case 'gable':
      roofTopY = buildGableRoof(g, w, d, h, wallColor, roofColor, theme, rng);
      break;
    case 'flatParapet':
      roofTopY = buildFlatParapetRoof(g, w, d, h, roofColor, theme);
      break;
    case 'onionTurret':
      roofTopY = buildOnionTurretRoof(g, w, h, roofColor, theme);
      break;
    case 'stepped':
      roofTopY = buildSteppedRoof(g, w, d, h, roofColor);
      break;
    default:
      roofTopY = buildPyramidRoof(g, w, d, h, roofColor, theme, rng);
  }

  // Door
  const door = mesh(new THREE.BoxGeometry(0.7, 1.3, 0.1), theme.palette.trim, { roughness: 0.6 });
  door.position.set(0, 0.65, d / 2 + 0.06);
  g.add(door);

  // Windows (lit at night = emissive); count and shape vary per house.
  const winMat = mat(theme.palette.windowLit, { emissive: theme.palette.windowLit, emissiveIntensity: 0.9, roughness: 0.4 });
  const windowCount = style === 'terrace' ? 2 : 1 + Math.floor(rng() * 3);
  const winPositions: [number, number][] =
    windowCount === 1
      ? [[0, h * 0.62]]
      : windowCount === 2
        ? [[-w / 2 + 0.55, h * 0.62], [w / 2 - 0.55, h * 0.62]]
        : [[-w / 2 + 0.5, h * 0.62], [0, h * 0.62], [w / 2 - 0.5, h * 0.62]];
  for (const [wx, wy] of winPositions) {
    const round = rng() < 0.18;
    const win = round
      ? new THREE.Mesh(new THREE.CircleGeometry(0.28, 10), winMat)
      : new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.65), winMat);
    win.position.set(wx, wy, d / 2 + 0.06);
    g.add(win);
  }

  if (rng() < 0.3) addStringLights(g, w, h, d, rng);

  g.userData.roofTopY = roofTopY;
  g.userData.width = w;
  g.userData.depth = d;
  return g;
}

// --- Chimney + smoke -----------------------------------------------------

export function createChimney(theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const stack = mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), pick(theme.palette.wallColors, 3), { roughness: 0.9 });
  stack.position.y = 0.45;
  g.add(stack);
  const cap = mesh(new THREE.BoxGeometry(0.62, 0.12, 0.62), theme.palette.trim);
  cap.position.y = 0.92;
  g.add(cap);
  return g;
}

export function createSmokePuff(color = 0xe8ecf3): THREE.Group {
  const g = new THREE.Group();
  const material = mat(color, { transparent: true, opacity: 0.85, roughness: 1 });
  const sizes = [0.55, 0.42, 0.5, 0.34];
  sizes.forEach((s, i) => {
    const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), material);
    sphere.position.set((i - 1.5) * 0.28, i * 0.35, (Math.random() - 0.5) * 0.2);
    g.add(sphere);
  });
  g.userData.bob = Math.random() * Math.PI * 2;
  return g;
}

// --- Trees -----------------------------------------------------------------

/** Snow-capped conifer — used both as the mid-height hazard and as decor. */
export function createPineTree(theme: Theme, seed = Math.random()): THREE.Group {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.1, 6), 0x6b4226);
  trunk.position.y = 0.55;
  g.add(trunk);
  const tiers = 3;
  const baseR = 1.0 + (seed % 3) * 0.15;
  for (let i = 0; i < tiers; i++) {
    const r = baseR * (1 - i * 0.28);
    const h = 1.3 - i * 0.15;
    const cone = mesh(new THREE.ConeGeometry(r, h, 7), theme.palette.treeColor);
    cone.position.y = 1.1 + i * 0.85;
    g.add(cone);
    if (theme.palette.snow) {
      const snow = mesh(new THREE.ConeGeometry(r * 0.7, h * 0.3, 7), theme.palette.snow, { roughness: 1 });
      snow.position.y = 1.1 + i * 0.85 + h * 0.32;
      g.add(snow);
    }
  }
  return g;
}

function snowClump(size: number, snowColor: number): THREE.Mesh {
  const clump = mesh(new THREE.IcosahedronGeometry(size, 0), snowColor, { roughness: 1 });
  clump.scale.set(1, 0.7, 1);
  return clump;
}

/** Bare deciduous tree with snow resting on its branches — oak silhouette: wide, gnarled spread. */
export function createOakTree(theme: Theme, seed = Math.random()): THREE.Group {
  const g = new THREE.Group();
  const trunkH = 1.3;
  const trunk = mesh(new THREE.CylinderGeometry(0.22, 0.3, trunkH, 6), 0x4a3626);
  trunk.position.y = trunkH / 2;
  g.add(trunk);

  const snowColor = theme.palette.snow || 0xf4f8ff;
  const branchCount = 7;
  for (let i = 0; i < branchCount; i++) {
    const angle = (i / branchCount) * Math.PI * 2 + seed;
    const tilt = 0.55 + ((seed + i) % 3) * 0.12;
    const len = 0.9 + ((seed * (i + 1)) % 3) * 0.18;

    const pivot = new THREE.Group();
    pivot.position.y = trunkH * (0.55 + (i % 3) * 0.15);
    pivot.rotation.y = angle;
    pivot.rotation.x = tilt;
    g.add(pivot);

    const branch = mesh(new THREE.CylinderGeometry(0.05, 0.09, len, 5), 0x4a3626);
    branch.position.y = len / 2;
    pivot.add(branch);

    const snow = snowClump(0.22 + (i % 2) * 0.06, snowColor);
    snow.position.y = len;
    pivot.add(snow);
  }
  const crownSnow = snowClump(0.34, snowColor);
  crownSnow.position.y = trunkH + 0.1;
  g.add(crownSnow);
  return g;
}

/** Bare deciduous tree with snow resting on its branches — elm silhouette: tall, upward-arching. */
export function createElmTree(theme: Theme, seed = Math.random()): THREE.Group {
  const g = new THREE.Group();
  const trunkH = 1.9;
  const trunk = mesh(new THREE.CylinderGeometry(0.16, 0.26, trunkH, 6), 0x50392a);
  trunk.position.y = trunkH / 2;
  g.add(trunk);

  const snowColor = theme.palette.snow || 0xf4f8ff;
  const branchCount = 6;
  for (let i = 0; i < branchCount; i++) {
    const angle = (i / branchCount) * Math.PI * 2 + seed * 1.3;
    const tilt = 0.28 + ((seed + i) % 3) * 0.08; // narrower, more upright spread than the oak
    const len = 1.1 + ((seed * (i + 2)) % 3) * 0.2;

    const pivot = new THREE.Group();
    pivot.position.y = trunkH * (0.62 + (i % 3) * 0.11);
    pivot.rotation.y = angle;
    pivot.rotation.x = tilt;
    g.add(pivot);

    const branch = mesh(new THREE.CylinderGeometry(0.04, 0.07, len, 5), 0x50392a);
    branch.position.y = len / 2;
    pivot.add(branch);

    const snow = snowClump(0.18 + (i % 2) * 0.05, snowColor);
    snow.position.y = len;
    pivot.add(snow);
  }
  const crownSnow = snowClump(0.26, snowColor);
  crownSnow.position.y = trunkH + 0.15;
  g.add(crownSnow);
  return g;
}

export type TreeKind = 'pine' | 'oak' | 'elm';

export function createTree(kind: TreeKind, theme: Theme, seed = Math.random()): THREE.Group {
  if (kind === 'oak') return createOakTree(theme, seed);
  if (kind === 'elm') return createElmTree(theme, seed);
  return createPineTree(theme, seed);
}

// --- Ground-level obstacles --------------------------------------------

export function createLampPost(): THREE.Group {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), 0x2e2e33);
  pole.position.y = 1.2;
  g.add(pole);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), mat(0xffe9a8, { emissive: 0xffcf6b, emissiveIntensity: 1.1 }));
  lamp.position.y = 2.5;
  g.add(lamp);
  return g;
}

export function createSnowman(): THREE.Group {
  const g = new THREE.Group();
  const bottom = mesh(new THREE.SphereGeometry(0.55, 10, 10), 0xffffff, { roughness: 1 });
  bottom.position.y = 0.55;
  const mid = mesh(new THREE.SphereGeometry(0.4, 10, 10), 0xffffff, { roughness: 1 });
  mid.position.y = 1.25;
  const head = mesh(new THREE.SphereGeometry(0.28, 10, 10), 0xffffff, { roughness: 1 });
  head.position.y = 1.75;
  const nose = mesh(new THREE.ConeGeometry(0.06, 0.3, 6), 0xff8c3a);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.75, 0.3);
  g.add(bottom, mid, head, nose);
  return g;
}

export function createCar(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(1.1, 0.5, 2.2), color);
  body.position.y = 0.45;
  const cabin = mesh(new THREE.BoxGeometry(0.95, 0.42, 1.2), color);
  cabin.position.set(0, 0.86, -0.1);
  g.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 10);
  const wheelPositions: [number, number][] = [[-0.55, 0.8], [0.55, 0.8], [-0.55, -0.8], [0.55, -0.8]];
  for (const [wx, wz] of wheelPositions) {
    const wheel = mesh(wheelGeo, 0x1c1c1f, { roughness: 1 });
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.24, wz);
    g.add(wheel);
  }
  return g;
}

export function createFence(length: number): THREE.Group {
  const g = new THREE.Group();
  const postMat = 0xffffff;
  const count = Math.max(2, Math.round(length / 0.6));
  for (let i = 0; i < count; i++) {
    const post = mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), postMat, { roughness: 1 });
    post.position.set(-length / 2 + (i / (count - 1)) * length, 0.3, 0);
    g.add(post);
  }
  const rail = mesh(new THREE.BoxGeometry(length, 0.06, 0.06), postMat, { roughness: 1 });
  rail.position.y = 0.45;
  g.add(rail);
  return g;
}

/** Giant striped peppermint on a stick — an arcade-fantasy alternative to street clutter. */
export function createPeppermint(): THREE.Group {
  const g = new THREE.Group();
  const r = 0.55;
  const discY = 1.5;
  const disc = mesh(new THREE.CylinderGeometry(r, r, 0.12, 16), 0xfaf7ee, { roughness: 0.35 });
  disc.rotation.x = Math.PI / 2;
  disc.position.y = discY;
  g.add(disc);
  for (let i = 0; i < 4; i++) {
    const stripe = mesh(new THREE.BoxGeometry(r * 1.8, 0.14, 0.13), 0xd6403a, { roughness: 0.35 });
    stripe.position.y = discY;
    stripe.rotation.z = (i / 4) * Math.PI;
    g.add(stripe);
  }
  const stick = mesh(new THREE.CylinderGeometry(0.07, 0.07, discY - 0.1, 8), 0xffffff, { roughness: 0.4 });
  stick.position.y = (discY - 0.1) / 2;
  g.add(stick);
  return g;
}

// --- Gift ----------------------------------------------------------------

export function createGift(color = 0xe4372b, ribbon = 0xffd24a): THREE.Group {
  const g = new THREE.Group();
  const box = mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), color, { roughness: 0.5 });
  g.add(box);
  const ribbonV = mesh(new THREE.BoxGeometry(0.14, 0.62, 0.62), ribbon, { roughness: 0.4 });
  const ribbonH = mesh(new THREE.BoxGeometry(0.62, 0.62, 0.14), ribbon, { roughness: 0.4 });
  g.add(ribbonV, ribbonH);
  const bowGeo = new THREE.TorusGeometry(0.14, 0.05, 6, 10);
  const bowL = mesh(bowGeo, ribbon);
  bowL.position.set(-0.1, 0.36, 0);
  bowL.rotation.x = Math.PI / 2;
  const bowR = bowL.clone();
  bowR.position.x = 0.1;
  g.add(bowL, bowR);
  return g;
}

// --- Tall obstacles (buildings + landmarks) -------------------------------

export function createTallBuilding(theme: Theme, seed = Math.random()): THREE.Group {
  const g = new THREE.Group();
  const w = 3.4;
  const h = 9 + (seed % 3) * 1.6;
  const body = mesh(new THREE.BoxGeometry(w, h, w), pick(theme.palette.wallColors, seed));
  body.position.y = h / 2;
  g.add(body);
  const roof = mesh(new THREE.ConeGeometry(w * 0.75, 1.4, 4), pick(theme.palette.roofColors, seed));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 0.7;
  g.add(roof);
  // window grid, lit at night
  const winMat = mat(theme.palette.windowLit, { emissive: theme.palette.windowLit, emissiveIntensity: 0.8 });
  for (let row = 0; row < 4; row++) {
    for (let side = -1; side <= 1; side += 2) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), winMat);
      win.position.set(side * 0.6, 1.5 + row * 1.7, w / 2 + 0.02);
      g.add(win);
    }
  }
  g.userData.topY = h + 1.4;
  return g;
}

/** A giant striped candy-cane pole looming up through the flight path — arcade-fantasy variety. */
export function createCandyCanePole(height = 9): THREE.Group {
  const g = new THREE.Group();
  const segCount = 9;
  const segH = height / segCount;
  const poleR = 0.42;
  for (let i = 0; i < segCount; i++) {
    const color = i % 2 === 0 ? 0xd6403a : 0xf5f2ea;
    const seg = mesh(new THREE.CylinderGeometry(poleR, poleR, segH * 1.02, 10), color, { roughness: 0.35 });
    seg.position.y = segH / 2 + i * segH;
    g.add(seg);
  }
  const hook = mesh(new THREE.TorusGeometry(poleR + 0.15, poleR, 8, 12, Math.PI), 0xd6403a, { roughness: 0.35 });
  hook.position.set(0, height, poleR + 0.15);
  hook.rotation.x = Math.PI / 2;
  g.add(hook);
  g.userData.topY = height + poleR * 2 + 0.3;
  return g;
}

/** An oversized ornament bauble hanging in the flight path on a thin pole. */
export function createGiantOrnament(color: number): THREE.Group {
  const g = new THREE.Group();
  const ballR = 1.55;
  const ballY = ballR + 1.1;
  const pole = mesh(new THREE.CylinderGeometry(0.14, 0.18, ballY - ballR, 8), 0x8a8a8a, { roughness: 0.6 });
  pole.position.y = (ballY - ballR) / 2;
  g.add(pole);
  const ball = mesh(new THREE.SphereGeometry(ballR, 12, 10), color, { roughness: 0.25, metalness: 0.35 });
  ball.position.y = ballY;
  g.add(ball);
  for (let i = 0; i < 3; i++) {
    const band = mesh(new THREE.TorusGeometry(ballR * 0.985, 0.05, 6, 16), 0xd4af37, { metalness: 0.5, roughness: 0.3 });
    band.rotation.x = Math.PI / 2;
    band.rotation.z = (i / 3) * Math.PI;
    band.position.y = ballY;
    g.add(band);
  }
  const cap = mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.4, 8), 0xd4af37, { metalness: 0.5, roughness: 0.3 });
  cap.position.y = ballY + ballR + 0.15;
  g.add(cap);
  const loop = mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 10), 0xd4af37, { metalness: 0.5, roughness: 0.3 });
  loop.position.y = cap.position.y + 0.3;
  g.add(loop);
  g.userData.topY = loop.position.y + 0.2;
  return g;
}

function createStaveTower(theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const tiers = 4;
  let y = 0;
  for (let i = 0; i < tiers; i++) {
    const s = 1 - i * 0.16;
    const h = 2.6;
    const body = mesh(new THREE.CylinderGeometry(1.3 * s, 1.5 * s, h, 4), pick(theme.palette.wallColors, i));
    body.rotation.y = Math.PI / 4;
    body.position.y = y + h / 2;
    g.add(body);
    const roof = mesh(new THREE.ConeGeometry(1.7 * s, 1.5, 4), theme.palette.roofColors[0]);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = y + h + 0.75;
    g.add(roof);
    y += h + 1.5;
  }
  const spire = mesh(new THREE.ConeGeometry(0.18, 1.4, 6), theme.palette.trim);
  spire.position.y = y + 0.7;
  g.add(spire);
  g.userData.topY = y + 1.4;
  return g;
}

function createClockTower(theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const h = 12;
  const body = mesh(new THREE.BoxGeometry(2.2, h, 2.2), pick(theme.palette.wallColors, 1));
  body.position.y = h / 2;
  g.add(body);
  const clockMat = mat(0xf5efe0, { emissive: 0xf5efe0, emissiveIntensity: 0.5 });
  for (const rz of [0, Math.PI / 2]) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), clockMat);
    face.position.y = h - 1.4;
    face.rotation.y = rz;
    face.position.x = Math.sin(rz) * 1.11;
    face.position.z = Math.cos(rz) * 1.11;
    g.add(face);
  }
  const cap = mesh(new THREE.ConeGeometry(1.6, 2.4, 4), theme.palette.roofColors[0]);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = h + 1.2;
  g.add(cap);
  g.userData.topY = h + 2.4;
  return g;
}

function createCastleSpire(theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const h = 10.5;
  const body = mesh(new THREE.CylinderGeometry(1.1, 1.3, h, 8), pick(theme.palette.wallColors, 2));
  body.position.y = h / 2;
  g.add(body);
  // crenellations
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const merlon = mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), pick(theme.palette.wallColors, 2));
    merlon.position.set(Math.cos(a) * 1.15, h + 0.2, Math.sin(a) * 1.15);
    g.add(merlon);
  }
  const roof = mesh(new THREE.ConeGeometry(1.3, 2.6, 8), theme.palette.roofColors[0]);
  roof.position.y = h + 1.7;
  g.add(roof);
  g.userData.topY = h + 3;
  return g;
}

function createWindmill(theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const h = 8;
  const body = mesh(new THREE.CylinderGeometry(0.9, 1.4, h, 8), pick(theme.palette.wallColors, 0));
  body.position.y = h / 2;
  g.add(body);
  const roof = mesh(new THREE.ConeGeometry(1.1, 1.6, 8), theme.palette.roofColors[0]);
  roof.position.y = h + 0.8;
  g.add(roof);
  const hub = new THREE.Group();
  hub.position.set(0, h * 0.8, 1.0);
  for (let i = 0; i < 4; i++) {
    const blade = mesh(new THREE.BoxGeometry(0.25, 2.6, 0.08), 0xe9e2d0, { roughness: 1 });
    blade.position.y = 1.3;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 4) * Math.PI * 2;
    holder.add(blade);
    hub.add(holder);
  }
  hub.userData.spin = true;
  g.add(hub);
  g.userData.topY = h + 1.6;
  g.userData.hub = hub;
  return g;
}

export function createLandmark(kind: LandmarkKind, theme: Theme): THREE.Group {
  switch (kind) {
    case 'stave-tower': return createStaveTower(theme);
    case 'clock-tower': return createClockTower(theme);
    case 'castle-spire': return createCastleSpire(theme);
    case 'windmill': return createWindmill(theme);
  }
}

// --- Speed trail -----------------------------------------------------------

let trailTexture: THREE.Texture | null = null;
function getTrailTexture(): THREE.Texture {
  if (trailTexture) return trailTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 64);
  trailTexture = new THREE.CanvasTexture(canvas);
  return trailTexture;
}

/** A tapered speed-line triangle lying flat, wide near the sled and fading to a point behind it. */
function createStreakGeometry(length: number, width: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const hw = width / 2;
  const positions = new Float32Array([-hw, 0, 0, hw, 0, 0, 0, 0, length]);
  const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  return geo;
}

/** Arcade-style speed lines that stream behind the sleigh, growing with velocity. */
export function createSpeedTrail(): THREE.Group {
  const g = new THREE.Group();
  const streakMat = new THREE.MeshBasicMaterial({
    map: getTrailTexture(),
    color: 0xfff2c0,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const x of [-0.72, 0, 0.72]) {
    const streak = new THREE.Mesh(createStreakGeometry(1, 0.16), streakMat);
    streak.position.set(x, x === 0 ? 0.35 : 0.12, 0.85);
    g.add(streak);
  }
  return g;
}

// --- Santa's sleigh (player) ----------------------------------------------

export function createSleigh(): { group: THREE.Group; hub: THREE.Group } {
  const g = new THREE.Group();

  // Sleigh body
  const base = mesh(new THREE.BoxGeometry(1.6, 0.4, 2.4), 0x7a1f1f, { roughness: 0.5 });
  base.position.y = 0.2;
  g.add(base);
  const trim = mesh(new THREE.BoxGeometry(1.7, 0.1, 2.5), 0xd4af37, { roughness: 0.3, metalness: 0.4 });
  trim.position.y = 0.42;
  g.add(trim);

  // Curled front runners
  const runnerMat = 0xd4af37;
  for (const side of [-0.7, 0.7]) {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 12, Math.PI * 0.6), mat(runnerMat, { metalness: 0.5, roughness: 0.3 }));
    curl.position.set(side, 0.1, -1.15);
    curl.rotation.z = Math.PI / 2;
    curl.rotation.y = Math.PI;
    g.add(curl);
    const rail = mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), runnerMat, { metalness: 0.5, roughness: 0.3 });
    rail.position.set(side, -0.02, 0.1);
    g.add(rail);
  }

  // Gift sack behind Santa
  const sack = mesh(new THREE.SphereGeometry(0.55, 8, 8), 0x8a5a2b, { roughness: 1 });
  sack.scale.set(1, 0.85, 1.1);
  sack.position.set(0, 0.75, 0.75);
  g.add(sack);
  for (let i = 0; i < 3; i++) {
    const giftTip = createGift([0xe4372b, 0x2a6b3f, 0x2f5fa8][i], 0xffd24a);
    giftTip.scale.setScalar(0.32);
    giftTip.position.set((i - 1) * 0.28, 1.18, 0.7 + (i % 2) * 0.15);
    giftTip.rotation.y = i;
    g.add(giftTip);
  }

  // Santa figure
  const santa = new THREE.Group();
  santa.position.set(0, 0.42, -0.1);

  const body = mesh(new THREE.CapsuleGeometry(0.38, 0.5, 4, 8), 0xc41e1e, { roughness: 0.7 });
  body.position.y = 0.55;
  santa.add(body);

  const belt = mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 12), 0x1c1c1c);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.35;
  santa.add(belt);

  const head = mesh(new THREE.SphereGeometry(0.26, 10, 10), 0xf1c39a, { roughness: 0.8 });
  head.position.y = 1.05;
  santa.add(head);

  const beard = mesh(new THREE.ConeGeometry(0.22, 0.38, 8), 0xffffff, { roughness: 1 });
  beard.position.set(0, 0.92, 0.12);
  beard.rotation.x = Math.PI;
  santa.add(beard);

  const hat = mesh(new THREE.ConeGeometry(0.27, 0.5, 10), 0xc41e1e, { roughness: 0.6 });
  hat.position.set(0, 1.35, -0.02);
  hat.rotation.z = 0.25;
  santa.add(hat);
  const hatBrim = mesh(new THREE.TorusGeometry(0.27, 0.07, 6, 12), 0xffffff, { roughness: 1 });
  hatBrim.rotation.x = Math.PI / 2;
  hatBrim.position.y = 1.14;
  santa.add(hatBrim);
  const hatBall = mesh(new THREE.SphereGeometry(0.09, 8, 8), 0xffffff, { roughness: 1 });
  hatBall.position.set(0.09, 1.58, -0.14);
  santa.add(hatBall);

  const armGeo = new THREE.CapsuleGeometry(0.1, 0.4, 4, 6);
  const armL = mesh(armGeo, 0xc41e1e, { roughness: 0.7 });
  armL.position.set(-0.42, 0.65, 0.1);
  armL.rotation.z = 0.5;
  const armR = armL.clone();
  armR.position.x = 0.42;
  armR.rotation.z = -0.5;
  santa.add(armL, armR);

  g.add(santa);
  g.userData.santa = santa;

  const hub = new THREE.Group();
  hub.add(g);

  return { group: hub, hub: g };
}
