/**
 * Air hockey — table physics, paddle vs AI, first to N.
 * Genre homage; not a commercial clone.
 */

export const W = 320;
export const H = 520;
export const GOAL = 96;
export const WIN = 7;

const STEP = 1 / 120;
const MAX_SUBSTEPS = 8;
const PUCK_MAX_SPEED = 900;
/** Velocity magnitude the paddle may contribute to a hit. */
const PADDLE_HIT_SPEED = 900;
/** Max distance per swept sub-move, so a fast paddle cannot skip the puck. */
const PADDLE_SWEEP = 10;
const WALL = 4;
const FRICTION = 0.992;
const PUCK_MIN_LIVE = 8;
const CORNER_NUDGE = 140;
const STUCK_SPEED = 24;
const STUCK_FRAMES = 18; // ~0.15s at 120Hz steps

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
    /** @deprecated prefer winStreak in app; kept for HUD sync */
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
    /** Accumulated sim time (seconds); drives deterministic AI idle. */
    this.time = 0;
    this._accum = 0;
    this._targetX = this.paddle.x;
    this._targetY = this.paddle.y;
    /** @type {{ x: number, y: number } | null} keyboard velocity input */
    this._keyVel = null;
    this.hitFlash = 0;
    /** Consecutive sim steps the puck stayed nearly still in a rail pocket. */
    this._stuckSteps = 0;
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
    this.time = 0;
    this._accum = 0;
    this.hitFlash = 0;
    this._stuckSteps = 0;
    this.resetPuck();
    this.paddle.x = W / 2;
    this.paddle.y = H - 70;
    this.paddle.vx = 0;
    this.paddle.vy = 0;
    this.enemy.x = W / 2;
    this.enemy.y = 70;
    this.enemy.vx = 0;
    this.enemy.vy = 0;
    this._targetX = this.paddle.x;
    this._targetY = this.paddle.y;
    this._keyVel = null;
    this.message = "拖曳下方球拍防守／進攻";
  }

  resetPuck() {
    this.puck.x = W / 2;
    this.puck.y = this.serve === "you" ? H * 0.62 : H * 0.38;
    this.puck.vx = (Math.random() - 0.5) * 40;
    this.puck.vy = this.serve === "you" ? -120 : 120;
  }

  /**
   * Set pointer / aim target; paddle eases toward it in update.
   * @param {number} x
   * @param {number} y
   */
  setPaddleTarget(x, y) {
    if (this.status !== "playing" && this.status !== "scored") return;
    const r = this.paddle.r;
    this._targetX = clamp(x, r + WALL, W - r - WALL);
    this._targetY = clamp(y, H / 2 + r + 4, H - r - 8);
    this._keyVel = null;
  }

  /** @deprecated use setPaddleTarget */
  aimPaddle(x, y) {
    this.setPaddleTarget(x, y);
  }

  /**
   * Keyboard velocity in world units/sec (clamped later).
   * @param {number} vx
   * @param {number} vy
   */
  setPaddleKeyVelocity(vx, vy) {
    if (this.status !== "playing" && this.status !== "scored") return;
    if (vx === 0 && vy === 0) {
      this._keyVel = null;
      return;
    }
    this._keyVel = { x: vx, y: vy };
  }

  clearPaddleInput() {
    this._keyVel = null;
    this._targetX = this.paddle.x;
    this._targetY = this.paddle.y;
  }

  /**
   * @param {number} dt
   * @returns {string[]}
   */
  update(dt) {
    /** @type {string[]} */
    const events = [];
    const capped = Math.min(0.05, Math.max(0, dt));

    if (this.scoreFlash > 0) {
      this.scoreFlash -= capped;
      if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - capped);
      // Paddle keeps following the pointer during the score pause.
      this.movePlayerPaddle(capped, false);
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
      return events;
    }

    if (this.status !== "playing") return events;

    this._accum += capped;
    let steps = 0;
    while (this._accum >= STEP && steps < MAX_SUBSTEPS) {
      this._accum -= STEP;
      steps += 1;
      const stepEvents = this.step(STEP);
      for (const e of stepEvents) events.push(e);
      if (this.status !== "playing") {
        this._accum = 0;
        break;
      }
    }
    if (steps === MAX_SUBSTEPS) this._accum = 0;

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - capped);
    return events;
  }

  /**
   * @param {number} dt
   * @returns {string[]}
   */
  step(dt) {
    /** @type {string[]} */
    const events = [];
    this.time += dt;

    const sweptHit = this.movePlayerPaddle(dt);
    this.updateAi(dt);
    this.integrate(this.puck, dt, FRICTION);
    this.walls(this.puck);
    this.unstickPuck(dt);

    const hitP = this.collide(this.paddle, this.puck) || sweptHit;
    const hitE = this.collide(this.enemy, this.puck);
    if (hitP || hitE) {
      events.push("hit");
      this.hitFlash = 0.12;
    }

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

    return events;
  }

  /**
   * @param {number} dt
   * @param {boolean} [resolvePuck] run puck collision along the swept path
   */
  movePlayerPaddle(dt, resolvePuck = true) {
    const r = this.paddle.r;
    const minX = r + WALL;
    const maxX = W - r - WALL;
    const minY = H / 2 + r + 4;
    const maxY = H - r - 8;

    if (this._keyVel) {
      this._targetX = clamp(this.paddle.x + this._keyVel.x * dt, minX, maxX);
      this._targetY = clamp(this.paddle.y + this._keyVel.y * dt, minY, maxY);
    }

    // The paddle goes exactly where the pointer is — no tracking speed limit.
    const fromX = this.paddle.x;
    const fromY = this.paddle.y;
    const dx = clamp(this._targetX, minX, maxX) - fromX;
    const dy = clamp(this._targetY, minY, maxY) - fromY;
    const dist = Math.hypot(dx, dy);

    if (dist <= 1e-6) {
      // Keep a little swing memory so a flick still lands in later substeps.
      this.paddle.vx *= 0.6;
      this.paddle.vy *= 0.6;
      if (Math.hypot(this.paddle.vx, this.paddle.vy) < 8) {
        this.paddle.vx = 0;
        this.paddle.vy = 0;
      }
      return false;
    }

    // Velocity comes from actual travel; only this feeds the hit impulse.
    this.paddle.vx = dx / Math.max(dt, 1e-4);
    this.paddle.vy = dy / Math.max(dt, 1e-4);
    this.clampSpeed(this.paddle, PADDLE_HIT_SPEED);

    if (!resolvePuck) {
      this.paddle.x = fromX + dx;
      this.paddle.y = fromY + dy;
      return false;
    }

    const sweeps = Math.max(1, Math.ceil(dist / PADDLE_SWEEP));
    let hit = false;
    for (let i = 1; i <= sweeps; i++) {
      const t = i / sweeps;
      this.paddle.x = fromX + dx * t;
      this.paddle.y = fromY + dy * t;
      if (this.collide(this.paddle, this.puck)) hit = true;
    }
    return hit;
  }

  /** @param {number} dt */
  updateAi(dt) {
    const puck = this.puck;
    const inAiHalf = puck.y < H * 0.55;
    const speed = Math.hypot(puck.vx, puck.vy);
    const threat = inAiHalf && puck.vy < 0;
    const loose = inAiHalf && speed < 90;
    const cornered = this.isInRailCorner(puck);

    let targetX = puck.x + puck.vx * 0.08;
    let targetY = 70;
    let speedCap = 200;

    if (threat || loose) {
      speedCap = cornered || loose ? 340 : 280;
      if (cornered) {
        // Stand off the wall on the goal side, then drive through toward midfield / player.
        const towardCenter = puck.x < W / 2 ? 44 : -44;
        targetX = clamp(puck.x + towardCenter, this.enemy.r + WALL, W - this.enemy.r - WALL);
        targetY = clamp(puck.y - 12, this.enemy.r + 8, H / 2 - this.enemy.r - 4);
      } else {
        // Approach from the goal side so the strike sends the puck toward the player.
        targetX = puck.x + (puck.x < W / 2 ? -6 : 6);
        targetY = clamp(puck.y - 14, this.enemy.r + 8, H / 2 - this.enemy.r - 4);
      }
    } else {
      targetY = 64 + Math.sin(this.time * 2.5) * 6;
    }

    const dx = clamp(targetX - this.enemy.x, -speedCap * dt, speedCap * dt);
    const dy = clamp(targetY - this.enemy.y, -speedCap * dt, speedCap * dt);
    this.enemy.vx = dx / Math.max(dt, 0.001);
    this.enemy.vy = dy / Math.max(dt, 0.001);
    this.enemy.x = clamp(this.enemy.x + dx, this.enemy.r + WALL, W - this.enemy.r - WALL);
    this.enemy.y = clamp(this.enemy.y + dy, this.enemy.r + 8, H / 2 - this.enemy.r - 4);

    // If already overlapping a cornered / dead puck, shove it toward midfield + player half.
    if ((cornered || loose) && this.collide(this.enemy, this.puck)) {
      const awayX = Math.sign(W / 2 - this.puck.x) || 1;
      this.puck.vx += awayX * 180;
      this.puck.vy += 260;
      this.clampSpeed(this.puck, PUCK_MAX_SPEED);
    }
  }

  /** @param {Body} b */
  isInRailCorner(b) {
    const g0 = (W - GOAL) / 2;
    const g1 = (W + GOAL) / 2;
    const nearTop = b.y - b.r < WALL + 14;
    const nearBottom = b.y + b.r > H - WALL - 14;
    const nearLeft = b.x - b.r < WALL + 14;
    const nearRight = b.x + b.r > W - WALL - 14;
    const outsideGoalX = b.x < g0 + 8 || b.x > g1 - 8;
    return (nearTop || nearBottom) && (nearLeft || nearRight) && outsideGoalX;
  }

  /** @param {number} _dt */
  unstickPuck(_dt) {
    const puck = this.puck;
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed < STUCK_SPEED && this.isInRailCorner(puck)) {
      this._stuckSteps += 1;
    } else {
      this._stuckSteps = 0;
      return;
    }
    if (this._stuckSteps < STUCK_FRAMES) return;

    const toMidX = W / 2 - puck.x;
    const toMidY = H / 2 - puck.y;
    const len = Math.hypot(toMidX, toMidY) || 1;
    puck.vx = (toMidX / len) * CORNER_NUDGE;
    puck.vy = (toMidY / len) * CORNER_NUDGE;
    // Peel off the rails a bit so the next wall resolve doesn't cancel the nudge.
    puck.x = clamp(puck.x + Math.sign(toMidX) * 3, WALL + puck.r, W - WALL - puck.r);
    puck.y = clamp(puck.y + Math.sign(toMidY) * 3, WALL + puck.r, H - WALL - puck.r);
    this._stuckSteps = 0;
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
    this.clampSpeed(b, PUCK_MAX_SPEED);
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < PUCK_MIN_LIVE) {
      b.vx = 0;
      b.vy = 0;
    }
  }

  /**
   * @param {Body} b
   * @param {number} max
   */
  clampSpeed(b, max) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > max) {
      b.vx = (b.vx / sp) * max;
      b.vy = (b.vy / sp) * max;
    }
  }

  /** @param {Body} b */
  walls(b) {
    const g0 = (W - GOAL) / 2;
    const g1 = (W + GOAL) / 2;
    if (b.x - b.r < WALL) {
      b.x = WALL + b.r;
      b.vx = Math.abs(b.vx) * 0.92;
    }
    if (b.x + b.r > W - WALL) {
      b.x = W - WALL - b.r;
      b.vx = -Math.abs(b.vx) * 0.92;
    }
    if (b.y - b.r < WALL) {
      if (b.x < g0 || b.x > g1) {
        b.y = WALL + b.r;
        b.vy = Math.abs(b.vy) * 0.92;
      }
    }
    if (b.y + b.r > H - WALL) {
      if (b.x < g0 || b.x > g1) {
        b.y = H - WALL - b.r;
        b.vy = -Math.abs(b.vy) * 0.92;
      }
    }
  }

  /**
   * @param {Body} pad
   * @param {Body} puck
   */
  collide(pad, puck) {
    let dx = puck.x - pad.x;
    let dy = puck.y - pad.y;
    let dist = Math.hypot(dx, dy);
    const min = pad.r + puck.r;
    if (dist < 1e-6) {
      dx = 0;
      dy = -1;
      dist = 1e-6;
    }
    if (dist >= min) return false;
    const nx = dx / dist;
    const ny = dy / dist;
    puck.x = pad.x + nx * min;
    puck.y = pad.y + ny * min;
    const rvx = puck.vx - pad.vx * 0.35;
    const rvy = puck.vy - pad.vy * 0.35;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      puck.vx -= (1.55 + 0.00035 * Math.abs(vn)) * vn * nx;
      puck.vy -= (1.55 + 0.00035 * Math.abs(vn)) * vn * ny;
    }
    puck.vx += pad.vx * 0.18;
    puck.vy += pad.vy * 0.18;
    const sp = Math.hypot(puck.vx, puck.vy);
    if (sp < 80) {
      puck.vx += nx * 90;
      puck.vy += ny * 90;
    }
    this.clampSpeed(puck, PUCK_MAX_SPEED);
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
