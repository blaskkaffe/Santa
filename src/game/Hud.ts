import type { Theme } from './types';
import { MAX_HEALTH } from './constants';

const BEST_KEY = 'santa-run-best-score';

export class Hud {
  private root: HTMLElement;
  private hudEl: HTMLElement;
  private startEl: HTMLElement;
  private gameOverEl: HTMLElement;
  private scoreEl: HTMLElement;
  private giftEl: HTMLElement;
  private healthFill: HTMLElement;
  private toastEl: HTMLElement;
  private damageFlashEl: HTMLElement;
  private finalScoreEl: HTMLElement;
  private finalGiftsEl: HTMLElement;
  private bestScoreEl: HTMLElement;
  private selectedThemeId: string;
  private startBtn: HTMLButtonElement;
  private retryBtn: HTMLButtonElement;
  private menuBtn: HTMLButtonElement;
  private muteBtn: HTMLButtonElement;
  private pausedEl: HTMLElement;

  private startCb: ((themeId: string) => void) | null = null;
  private retryCb: (() => void) | null = null;
  private menuCb: (() => void) | null = null;
  private muteCb: ((muted: boolean) => void) | null = null;
  private muted = false;

  constructor(root: HTMLElement, themes: Theme[]) {
    this.root = root;
    this.selectedThemeId = themes[0].id;

    this.root.innerHTML = `
      <button class="mute-btn" id="mute-btn" aria-label="Toggle sound">🔊</button>
      <div class="screen paused-screen" id="paused-screen" hidden>
        <div class="screen-inner">
          <h1 class="title">⏸ Paused</h1>
          <p class="subtitle">Come back whenever you're ready.</p>
        </div>
      </div>
      <div class="hud" hidden>
        <div class="hud-top-left">
          <div class="pill gift-pill">
            <span class="pill-icon">🎁</span>
            <span id="gift-count">0</span>
          </div>
          <div class="health-bar"><div class="health-fill" id="health-fill"></div></div>
        </div>
        <div class="hud-top-right">
          <div class="pill score-pill">
            <div class="pill-label">SCORE</div>
            <div id="score-value">0</div>
          </div>
        </div>
        <div class="toast" id="toast"></div>
      </div>
      <div class="damage-flash" id="damage-flash"></div>

      <div class="screen start-screen" id="start-screen">
        <div class="screen-inner">
          <h1 class="title">🎅 Santa's Sleigh Run</h1>
          <p class="subtitle">Weave between rooftops, dodge chimney smoke &amp; towers, and drop gifts down every chimney you fly over.</p>
          <div class="level-grid" id="level-grid"></div>
          <button class="primary-btn" id="start-btn">Start Flight</button>
          <div class="controls-hint">
            <span><b>Arrows / WASD</b> — move &amp; change height</span>
            <span><b>Space</b> — deliver gift</span>
            <span class="mobile-only">Swipe or use the on-screen controls</span>
          </div>
        </div>
      </div>

      <div class="screen game-over-screen" id="game-over-screen" hidden>
        <div class="screen-inner">
          <h1 class="title">🎄 Run Complete!</h1>
          <div class="stats-row">
            <div class="stat"><div class="stat-value" id="final-score">0</div><div class="stat-label">Score</div></div>
            <div class="stat"><div class="stat-value" id="final-gifts">0</div><div class="stat-label">Gifts Delivered</div></div>
          </div>
          <p class="best-score" id="best-score"></p>
          <div class="game-over-actions">
            <button class="primary-btn" id="retry-btn">Fly Again</button>
            <button class="secondary-btn" id="menu-btn">Change Level</button>
          </div>
        </div>
      </div>
    `;

    this.hudEl = this.root.querySelector('.hud')!;
    this.startEl = this.root.querySelector('#start-screen')!;
    this.gameOverEl = this.root.querySelector('#game-over-screen')!;
    this.scoreEl = this.root.querySelector('#score-value')!;
    this.giftEl = this.root.querySelector('#gift-count')!;
    this.healthFill = this.root.querySelector('#health-fill')!;
    this.toastEl = this.root.querySelector('#toast')!;
    this.damageFlashEl = this.root.querySelector('#damage-flash')!;
    this.finalScoreEl = this.root.querySelector('#final-score')!;
    this.finalGiftsEl = this.root.querySelector('#final-gifts')!;
    this.bestScoreEl = this.root.querySelector('#best-score')!;
    this.startBtn = this.root.querySelector('#start-btn')!;
    this.retryBtn = this.root.querySelector('#retry-btn')!;
    this.menuBtn = this.root.querySelector('#menu-btn')!;
    this.muteBtn = this.root.querySelector('#mute-btn')!;
    this.pausedEl = this.root.querySelector('#paused-screen')!;

    this.buildLevelGrid(themes);

    this.startBtn.addEventListener('click', () => this.startCb?.(this.selectedThemeId));
    this.retryBtn.addEventListener('click', () => this.retryCb?.());
    this.menuBtn.addEventListener('click', () => this.menuCb?.());
    this.muteBtn.addEventListener('click', () => {
      this.muted = !this.muted;
      this.muteBtn.textContent = this.muted ? '🔇' : '🔊';
      this.muteCb?.(this.muted);
    });
  }

  private buildLevelGrid(themes: Theme[]) {
    const grid = this.root.querySelector('#level-grid')!;
    grid.innerHTML = '';
    themes.forEach((theme, i) => {
      const card = document.createElement('button');
      card.className = 'level-card' + (i === 0 ? ' selected' : '');
      card.style.setProperty('--accent', theme.cardAccent);
      card.dataset.themeId = theme.id;
      card.innerHTML = `
        <div class="level-thumb"></div>
        <div class="level-name">${theme.name}</div>
        <div class="level-subtitle">${theme.subtitle}</div>
      `;
      card.addEventListener('click', () => {
        this.selectedThemeId = theme.id;
        grid.querySelectorAll('.level-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      grid.appendChild(card);
    });
  }

  onStart(cb: (themeId: string) => void) {
    this.startCb = cb;
  }
  onRetry(cb: () => void) {
    this.retryCb = cb;
  }
  onMenu(cb: () => void) {
    this.menuCb = cb;
  }
  onMuteToggle(cb: (muted: boolean) => void) {
    this.muteCb = cb;
  }

  showPaused() {
    this.pausedEl.hidden = false;
  }
  hidePaused() {
    this.pausedEl.hidden = true;
  }

  showStart() {
    this.startEl.hidden = false;
    this.gameOverEl.hidden = true;
    this.hudEl.hidden = true;
  }

  showPlaying() {
    this.startEl.hidden = true;
    this.gameOverEl.hidden = true;
    this.hudEl.hidden = false;
  }

  showGameOver(score: number, gifts: number) {
    this.hudEl.hidden = true;
    this.gameOverEl.hidden = false;
    this.finalScoreEl.textContent = Math.floor(score).toString();
    this.finalGiftsEl.textContent = gifts.toString();

    const best = Math.max(score, Number(localStorage.getItem(BEST_KEY) ?? 0));
    localStorage.setItem(BEST_KEY, best.toString());
    this.bestScoreEl.textContent = score >= best ? '🏆 New best score!' : `Best: ${Math.floor(best)}`;
  }

  updateScore(score: number) {
    this.scoreEl.textContent = Math.floor(score).toString();
  }

  updateGifts(count: number) {
    this.giftEl.textContent = count.toString();
  }

  updateHealth(hp: number) {
    const pct = Math.max(0, Math.min(1, hp / MAX_HEALTH));
    this.healthFill.style.width = `${pct * 100}%`;
    this.healthFill.classList.toggle('low', pct < 0.3);
  }

  flashDamage() {
    this.damageFlashEl.classList.remove('active');
    // Force reflow so the animation restarts on repeated hits.
    void this.damageFlashEl.offsetWidth;
    this.damageFlashEl.classList.add('active');
  }

  toast(text: string) {
    const el = document.createElement('div');
    el.className = 'toast-item';
    el.textContent = text;
    this.toastEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
}
