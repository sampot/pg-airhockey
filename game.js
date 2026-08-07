/**
 * Air hockey — table physics, paddle vs AI, first to N.
 * Genre homage; not a commercial clone.
 */

export const W = 320;
export const H = 520;
export const GOAL = 96;
export const WIN = 7;

/**
 * @typedef {{ x: number, y: number, vx: number, vy: number, r: number }} Body
 */

export class AirHockeyGame {
  constructor() {
    /** @type {'ready'|'playing'|'scored'|'over'} */
    this.status = "ready";
    this.message = "開局後拖曳球拍";
    this.you = 0;
    this.ai = 0;
    this.best = 0;
    this.serve = /** @type {'you'|'ai'} */ ("you");
    /** @type {Body} */
    this.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 12 };
    /** @type {Body} */
    this.paddle = { x: W / 2, y: H - 70, vx: 0, vy: 0, r: 28 };
    /** @type {Body} */
    this.enemy = { x: W / 2, y: 70, vx: 0, vy: 0, r: 28 };
    this.scoreFlash = 0;
    this.lastScorer = /** @type {'you'|'ai'|null} */ (null);
    this._px = this.paddle.x;
    this._py = this.paddle.y;
  }

  /** @param {number} [best] */
  start(best = 0) {
    this.status = "playing";
    this.you = 0;
    this.ai = 0;
    this.best = best;
    this.serve = "you";
    this.scoreFlash = 0;
    this.lastScorer = null;
    this.resetPuck();
    this.paddle.x = W / 2;
    this.paddle.y = H - 70;
    this.enemy.x = W / 2;
    this.enemy.y = 70;
    this.message = "拖曳下方球拍防守／進攻";
  }

  resetPuck() {
    this.puck.x = W / 2;
    this.puck.y = this.serve === "you" ? H * 0.62 : H * 0.38;
    this.puck.vx = (Math.random() - 0.5) * 40;
    this.puck.vy = this.serve === "you" ? -120 : 120;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  aimPaddle(x, y) {
    if (this.status !== "playing" && this.status !== "scored") return;
    const r = this.paddle.r;
    const minY = H / 2 + r + 4;
    const maxY = H - r - 8;
    const nx = clamp(x, r + 4, W - r - 4);
    const ny = clamp(y, minY, maxY);
    this.paddle.vx = (nx - this.paddle.x) / 0.016;
    this.paddle.vy = (ny - this.paddle.y) / 0.016;
    this.paddle.x = nx;
    this.paddle.y = ny;
  }

  /**
   * @param {number} dt
   * @returns {string[]}
   */
  update(dt) {
    /** @type {string[]} */
    const events = [];
    if (this.scoreFlash > 0) {
      this.scoreFlash -= dt;
      if (this.scoreFlash <= 0 && this.status === "scored") {
        if (this.you >= WIN || this.ai >= WIN) {
          this.status = "over";
          this.message = this.you > this.ai ? "你贏了！" : "AI 獲勝";
          this.best = Math.max(this.best, this.you);
          events.push(this.you > this.ai ? "win" : "lose");
        } else {
          this.status = "playing";
          this.resetPuck();
          this.message = "繼續！";
        }
      }
    }
    if (this.status !== "playing") return events;

    this.updateAi(dt);
    this.integrate(this.puck, dt, 0.992);
    this.walls(this.puck);
    const hitP = this.collide(this.paddle, this.puck);
    const hitE = this.collide(this.enemy, this.puck);
    if (hitP || hitE) events.push("hit");

    // goals
    const g0 = (W - GOAL) / 2;
    const g1 = (W + GOAL) / 2;
    if (this.puck.y - this.puck.r < 2 && this.puck.x > g0 && this.puck.x < g1) {
      this.you += 1;
      this.serve = "ai";
      this.lastScorer = "you";
      this.status = "scored";
      this.scoreFlash = 1.1;
      this.puck.vx = this.puck.vy = 0;
      this.message = "得分！";
      events.push("goal-you");
      this.best = Math.max(this.best, this.you);
    } else if (this.puck.y + this.puck.r > H - 2 && this.puck.x > g0 && this.puck.x < g1) {
      this.ai += 1;
      this.serve = "you";
      this.lastScorer = "ai";
      this.status = "scored";
      this.scoreFlash = 1.1;
      this.puck.vx = this.puck.vy = 0;
      this.message = "失分";
      events.push("goal-ai");
    }

    // damp paddle velocity used for impulse
    this.paddle.vx *= 0.6;
    this.paddle.vy *= 0.6;
    return events;
  }

  /** @param {number} dt */
  updateAi(dt) {
    const targetX = this.puck.x + this.puck.vx * 0.08;
    const threat = this.puck.y < H * 0.55 && this.puck.vy < 0;
    let targetY = 70;
    if (threat) targetY = clamp(this.puck.y - 10, this.enemy.r + 8, H / 2 - this.enemy.r - 4);
    else targetY = 64 + Math.sin(performance.now() / 400) * 6;

    const speed = threat ? 280 : 200;
    const dx = clamp(targetX - this.enemy.x, -speed * dt, speed * dt);
    const dy = clamp(targetY - this.enemy.y, -speed * dt, speed * dt);
    this.enemy.vx = dx / Math.max(dt, 0.001);
    this.enemy.vy = dy / Math.max(dt, 0.001);
    this.enemy.x = clamp(this.enemy.x + dx, this.enemy.r + 4, W - this.enemy.r - 4);
    this.enemy.y = clamp(this.enemy.y + dy, this.enemy.r + 8, H / 2 - this.enemy.r - 4);
  }

  /**
   * @param {Body} b
   * @param {number} dt
   * @param {number} friction
   */
  integrate(b, dt, friction) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= friction;
    b.vy *= friction;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 900) {
      b.vx = (b.vx / sp) * 900;
      b.vy = (b.vy / sp) * 900;
    }
    if (sp < 8) {
      b.vx = 0;
      b.vy = 0;
    }
  }

  /** @param {Body} b */
  walls(b) {
    const g0 = (W - GOAL) / 2;
    const g1 = (W + GOAL) / 2;
    if (b.x - b.r < 4) {
      b.x = 4 + b.r;
      b.vx = Math.abs(b.vx) * 0.92;
    }
    if (b.x + b.r > W - 4) {
      b.x = W - 4 - b.r;
      b.vx = -Math.abs(b.vx) * 0.92;
    }
    // top / bottom rails except goal mouth
    if (b.y - b.r < 4) {
      if (b.x < g0 || b.x > g1) {
        b.y = 4 + b.r;
        b.vy = Math.abs(b.vy) * 0.92;
      }
    }
    if (b.y + b.r > H - 4) {
      if (b.x < g0 || b.x > g1) {
        b.y = H - 4 - b.r;
        b.vy = -Math.abs(b.vy) * 0.92;
      }
    }
  }

  /**
   * @param {Body} pad
   * @param {Body} puck
   */
  collide(pad, puck) {
    const dx = puck.x - pad.x;
    const dy = puck.y - pad.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const min = pad.r + puck.r;
    if (dist >= min) return false;
    const nx = dx / dist;
    const ny = dy / dist;
    puck.x = pad.x + nx * min;
    puck.y = pad.y + ny * min;
    const rvx = puck.vx - pad.vx * 0.35;
    const rvy = puck.vy - pad.vy * 0.35;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      puck.vx -= (1.65 + 0.0004 * Math.abs(vn)) * vn * nx;
      puck.vy -= (1.65 + 0.0004 * Math.abs(vn)) * vn * ny;
    }
    // push from paddle motion
    puck.vx += pad.vx * 0.22;
    puck.vy += pad.vy * 0.22;
    const sp = Math.hypot(puck.vx, puck.vy);
    if (sp < 80) {
      puck.vx += nx * 90;
      puck.vy += ny * 90;
    }
    return true;
  }
}

/**
 * @param {number} v
 * @param {number} a
 * @param {number} b
 */
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
