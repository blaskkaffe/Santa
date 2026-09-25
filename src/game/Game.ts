import * as THREE from 'three';
import { World } from './World';
import { Player } from './Player';
import { InputController } from './Input';
import { Hud } from './Hud';
import { THEMES, getTheme } from './themes';
import type { Theme } from './types';
import {
  MAX_HEALTH,
  DAMAGE_BUILDING,
  DAMAGE_SMOKE,
  DAMAGE_TREE,
  HIT_INVULN_SECONDS,
  GIFT_SCORE,
  DISTANCE_SCORE_PER_METER,
  BASE_SPEED,
  MAX_SPEED,
  SPEED_RAMP_PER_METER,
  CHIMNEY_DELIVERY_RADIUS,
} from './constants';
import type { Collidable } from './types';

type GameState = 'menu' | 'playing' | 'gameover';

const IDLE_SPEED = 5;
const COLLISION_Z_PRECHECK = 3.5;

interface PoppingGift {
  obj: THREE.Object3D;
  t: number;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private timer = new THREE.Timer();

  private world: World;
  private player: Player;
  private hud: Hud;
  private input: InputController;

  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private skyGroup: THREE.Group;
  private moon: THREE.Mesh;
  private stars: THREE.Points;

  private state: GameState = 'menu';
  private theme: Theme;
  private traveled = 0;
  private speed = IDLE_SPEED;
  private health = MAX_HEALTH;
  private score = 0;
  private gifts = 0;
  private activeChimney: Collidable | null = null;
  private poppingGifts: PoppingGift[] = [];

  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.theme = THEMES[0];

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 400);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('game-canvas');

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
    this.scene.add(this.hemiLight);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 60;
    this.sunLight.shadow.camera.left = -20;
    this.sunLight.shadow.camera.right = 20;
    this.sunLight.shadow.camera.top = 20;
    this.sunLight.shadow.camera.bottom = -20;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);
    this.moon = this.buildMoon();
    this.skyGroup.add(this.moon);
    this.stars = this.buildStars();
    this.skyGroup.add(this.stars);

    this.world = new World(this.scene, this.theme);
    this.player = new Player(this.theme.laneCount);
    this.scene.add(this.player.group);

    const uiRoot = document.createElement('div');
    uiRoot.className = 'ui-root';
    this.container.appendChild(uiRoot);

    this.hud = new Hud(uiRoot, THEMES);
    this.hud.onStart((themeId) => this.startRun(themeId));
    this.hud.onRetry(() => this.startRun(this.theme.id));
    this.hud.onMenu(() => this.goToMenu());

    this.input = new InputController(uiRoot);
    this.input.onAction((action) => this.handleAction(action));

    this.applyTheme(this.theme);
    this.world.setTheme(this.theme);
    this.hud.showStart();

    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(this.loop);
  }

  private buildMoon(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(6, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4f1e4 });
    const moon = new THREE.Mesh(geo, mat);
    moon.position.set(40, 45, -120);
    return moon;
  }

  private buildStars(): THREE.Points {
    const count = 500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 140 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi)) * 0.6 + 10;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) - 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: true });
    return new THREE.Points(geo, mat);
  }

  private buildSkyTexture(theme: Theme): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    const [top, mid, bottom] = theme.palette.sky;
    grad.addColorStop(0, `#${top.toString(16).padStart(6, '0')}`);
    grad.addColorStop(0.55, `#${mid.toString(16).padStart(6, '0')}`);
    grad.addColorStop(1, `#${bottom.toString(16).padStart(6, '0')}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private applyTheme(theme: Theme) {
    this.theme = theme;
    this.scene.background = this.buildSkyTexture(theme);
    this.scene.fog = new THREE.Fog(theme.palette.fog, 26, 118);
    this.hemiLight.color.setHex(theme.palette.moonlight);
    this.hemiLight.groundColor.setHex(theme.palette.ground);
    this.sunLight.color.setHex(theme.palette.moonlight);
    (this.moon.material as THREE.MeshBasicMaterial).color.setHex(theme.palette.moonlight);
  }

  private goToMenu() {
    this.state = 'menu';
    this.speed = IDLE_SPEED;
    this.hud.showStart();
  }

  private startRun(themeId: string) {
    const theme = getTheme(themeId);
    this.applyTheme(theme);
    this.world.setTheme(theme);
    this.player.reset(theme.laneCount);
    this.traveled = 0;
    this.speed = BASE_SPEED;
    this.health = MAX_HEALTH;
    this.score = 0;
    this.gifts = 0;
    this.activeChimney = null;
    this.poppingGifts = [];
    this.state = 'playing';
    this.hud.showPlaying();
    this.hud.updateHealth(this.health);
    this.hud.updateScore(this.score);
    this.hud.updateGifts(this.gifts);
  }

  private gameOver() {
    this.state = 'gameover';
    this.speed = 0;
    this.hud.showGameOver(this.score, this.gifts);
  }

  private handleAction(action: string) {
    if (this.state !== 'playing') return;
    switch (action) {
      case 'left':
        this.player.moveLane(-1);
        break;
      case 'right':
        this.player.moveLane(1);
        break;
      case 'up':
        this.player.moveHeight(1);
        break;
      case 'down':
        this.player.moveHeight(-1);
        break;
      case 'deliver':
        this.tryDeliver();
        break;
    }
  }

  private tryDeliver() {
    if (!this.activeChimney || this.activeChimney.hit) return;
    const c = this.activeChimney;
    c.hit = true;
    this.gifts += 1;
    this.score += GIFT_SCORE;
    this.hud.updateGifts(this.gifts);
    this.hud.updateScore(this.score);
    this.hud.toast(`+${GIFT_SCORE} 🎁`);
    if (c.giftMarker) this.poppingGifts.push({ obj: c.giftMarker, t: 0 });
    this.activeChimney = null;
  }

  private applyDamage(kind: Collidable['kind']) {
    const dmg = kind === 'tree' ? DAMAGE_TREE : kind === 'smoke' ? DAMAGE_SMOKE : DAMAGE_BUILDING;
    this.health = Math.max(0, this.health - dmg);
    this.hud.updateHealth(this.health);
    this.hud.flashDamage();
    this.player.invulnTimer = HIT_INVULN_SECONDS;
    if (this.health <= 0) this.gameOver();
  }

  private resolveCollisions() {
    this.activeChimney = null;
    const playerZ = this.player.position.z;
    for (const c of this.world.collidables) {
      if (c.hit) continue;
      const dz = Math.abs(c.z - playerZ);
      if (dz > COLLISION_Z_PRECHECK) continue;
      if (c.lane !== this.player.lane) continue;
      if (!c.blocksAllHeights && c.height !== this.player.currentHeight) continue;

      if (c.kind === 'chimney') {
        if (dz < CHIMNEY_DELIVERY_RADIUS) this.activeChimney = c;
        continue;
      }

      if (this.player.invulnTimer > 0) continue;
      if (dz < c.radius + this.player.collisionRadius) {
        c.hit = true;
        this.applyDamage(c.kind);
      }
    }
  }

  private updateCamera() {
    const p = this.player.position;
    const targetX = p.x * 0.85;
    const targetY = p.y + 3.6;
    const targetZ = p.z + 9.5;
    this.camera.position.x += (targetX - this.camera.position.x) * 0.12;
    this.camera.position.y += (targetY - this.camera.position.y) * 0.12;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.18;
    this.camera.lookAt(p.x * 0.4, p.y - 0.6, p.z - 18);

    this.skyGroup.position.set(this.camera.position.x, 0, this.camera.position.z);
  }

  private updatePoppingGifts(dt: number) {
    for (let i = this.poppingGifts.length - 1; i >= 0; i--) {
      const pg = this.poppingGifts[i];
      pg.t += dt;
      pg.obj.position.y += dt * 5;
      pg.obj.scale.multiplyScalar(1 + dt * 4);
      if (pg.t > 0.35) {
        pg.obj.visible = false;
        this.poppingGifts.splice(i, 1);
      }
    }
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);

    if (this.state === 'playing') {
      this.speed = Math.min(MAX_SPEED, BASE_SPEED + this.traveled * SPEED_RAMP_PER_METER);
      this.traveled += this.speed * dt;
      this.score = this.traveled * DISTANCE_SCORE_PER_METER + this.gifts * GIFT_SCORE;
      this.hud.updateScore(this.score);
    } else if (this.state === 'menu') {
      this.traveled += this.speed * dt;
    }

    this.player.group.position.z = -this.traveled;
    this.player.update(dt);
    this.world.update(dt, this.traveled);
    this.updatePoppingGifts(dt);

    // Directional light follows the player so shadows stay correct.
    this.sunLight.position.set(this.player.position.x + 20, this.player.position.y + 30, this.player.position.z + 15);
    this.sunLight.target.position.copy(this.player.position);

    if (this.state === 'playing') {
      this.resolveCollisions();
    }

    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
