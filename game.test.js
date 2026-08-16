import { describe, expect, it } from "vitest";
import { AirHockeyGame, GOAL, H, W, WIN } from "./game.js";

/** @param {AirHockeyGame} g */
function freezeAi(g) {
  g.enemy.x = W / 2;
  g.enemy.y = 70;
  g.enemy.vx = 0;
  g.enemy.vy = 0;
  g.updateAi = () => {};
}

describe("AirHockeyGame", () => {
  it("keeps player paddle in the bottom half within rails", () => {
    const g = new AirHockeyGame();
    g.start();
    g.setPaddleTarget(-100, -100);
    g.update(1 / 60);
    expect(g.paddle.x).toBeGreaterThanOrEqual(g.paddle.r + 4);
    expect(g.paddle.y).toBeGreaterThanOrEqual(H / 2 + g.paddle.r + 4);
    g.setPaddleTarget(999, 999);
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    expect(g.paddle.x).toBeLessThanOrEqual(W - g.paddle.r - 4);
    expect(g.paddle.y).toBeLessThanOrEqual(H - g.paddle.r - 8);
  });

  it("places the paddle exactly on the pointer target in one frame", () => {
    const g = new AirHockeyGame();
    g.start();
    const targetX = g.paddle.x + 60;
    const targetY = g.paddle.y - 30;
    g.setPaddleTarget(targetX, targetY);
    g.update(1 / 60);
    expect(g.paddle.x).toBeCloseTo(targetX, 6);
    expect(g.paddle.y).toBeCloseTo(targetY, 6);
  });

  it("tracks a far pointer target 1:1 within the same frame", () => {
    const g = new AirHockeyGame();
    g.start();
    const targetX = W - g.paddle.r - 4;
    const targetY = H - g.paddle.r - 8;
    g.setPaddleTarget(targetX, targetY);
    g.update(1 / 60);
    expect(g.paddle.x).toBeCloseTo(targetX, 6);
    expect(g.paddle.y).toBeCloseTo(targetY, 6);
  });

  it("keeps following the pointer during the score pause", () => {
    const g = new AirHockeyGame();
    g.start();
    g.status = "scored";
    g.scoreFlash = 1.1;
    g.lastScorer = "you";
    const targetX = g.paddle.x - 70;
    const targetY = H - g.paddle.r - 8;
    g.setPaddleTarget(targetX, targetY);
    g.update(1 / 60);
    expect(g.paddle.x).toBeCloseTo(targetX, 6);
    expect(g.paddle.y).toBeCloseTo(targetY, 6);
  });

  it("still resolves the puck when the paddle sweeps across it", () => {
    const g = new AirHockeyGame();
    g.start();
    freezeAi(g);
    g.paddle.x = 40;
    g.paddle.y = H * 0.8;
    g.puck.x = 160;
    g.puck.y = H * 0.8;
    g.puck.vx = 0;
    g.puck.vy = 0;
    g.setPaddleTarget(280, H * 0.8);
    g.update(1 / 60);
    const dist = Math.hypot(g.puck.x - g.paddle.x, g.puck.y - g.paddle.y);
    expect(dist).toBeGreaterThanOrEqual(g.paddle.r + g.puck.r - 0.01);
    expect(g.puck.vx).toBeGreaterThan(0);
  });

  it("caps the paddle velocity used for hit impulse", () => {
    const g = new AirHockeyGame();
    g.start();
    g.setPaddleTarget(W - g.paddle.r - 4, H - g.paddle.r - 8);
    g.update(1 / 60);
    expect(Math.hypot(g.paddle.vx, g.paddle.vy)).toBeLessThanOrEqual(900.01);
  });

  it("produces similar puck motion at 30fps vs 60fps over the same duration", () => {
    const run = (hz) => {
      const g = new AirHockeyGame();
      g.start(0);
      freezeAi(g);
      g.puck.x = W / 2;
      g.puck.y = H / 2;
      g.puck.vx = 180;
      g.puck.vy = -220;
      const dt = 1 / hz;
      const steps = Math.round(0.5 * hz);
      for (let i = 0; i < steps; i++) g.update(dt);
      return { x: g.puck.x, y: g.puck.y, vx: g.puck.vx, vy: g.puck.vy };
    };
    const a = run(60);
    const b = run(30);
    expect(Math.abs(a.x - b.x)).toBeLessThan(8);
    expect(Math.abs(a.y - b.y)).toBeLessThan(8);
    expect(Math.abs(a.vx - b.vx)).toBeLessThan(40);
    expect(Math.abs(a.vy - b.vy)).toBeLessThan(40);
  });

  it("does not let a fast puck leave the table through side rails", () => {
    const g = new AirHockeyGame();
    g.start();
    freezeAi(g);
    g.puck.x = 40;
    g.puck.y = H / 2;
    g.puck.vx = -2000;
    g.puck.vy = 0;
    for (let i = 0; i < 20; i++) g.update(1 / 60);
    expect(g.puck.x - g.puck.r).toBeGreaterThanOrEqual(3.5);
    expect(g.puck.x + g.puck.r).toBeLessThanOrEqual(W - 3.5);
  });

  it("reflects a fast puck off top rail outside the goal mouth", () => {
    const g = new AirHockeyGame();
    g.start();
    freezeAi(g);
    g.puck.x = 30;
    g.puck.y = 40;
    g.puck.vx = 0;
    g.puck.vy = -1800;
    for (let i = 0; i < 20; i++) g.update(1 / 60);
    expect(g.puck.y - g.puck.r).toBeGreaterThanOrEqual(3.5);
    expect(g.status).toBe("playing");
  });

  it("scores when the puck enters the top goal", () => {
    const g = new AirHockeyGame();
    g.start();
    freezeAi(g);
    const g0 = (W - GOAL) / 2;
    const g1 = (W + GOAL) / 2;
    g.puck.x = (g0 + g1) / 2;
    g.puck.y = g.puck.r + 1;
    g.puck.vx = 0;
    g.puck.vy = -400;
    const events = [];
    for (let i = 0; i < 10; i++) events.push(...g.update(1 / 60));
    expect(events).toContain("goal-you");
    expect(g.you).toBe(1);
    expect(g.status).toBe("scored");
  });

  it("ends the match after first to WIN and emits win", () => {
    const g = new AirHockeyGame();
    g.start();
    freezeAi(g);
    g.you = WIN - 1;
    const g0 = (W - GOAL) / 2;
    const g1 = (W + GOAL) / 2;
    g.puck.x = (g0 + g1) / 2;
    g.puck.y = g.puck.r + 1;
    g.puck.vx = 0;
    g.puck.vy = -500;
    for (let i = 0; i < 8; i++) g.update(1 / 60);
    expect(g.you).toBe(WIN);
    expect(g.status).toBe("scored");
    const events = [];
    for (let i = 0; i < 90; i++) events.push(...g.update(1 / 60));
    expect(g.status).toBe("over");
    expect(events).toContain("win");
  });

  it("keeps AI paddle in the top half within rails", () => {
    const g = new AirHockeyGame();
    g.start();
    g.puck.x = W / 2;
    g.puck.y = 80;
    g.puck.vx = 400;
    g.puck.vy = -200;
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    expect(g.enemy.x).toBeGreaterThanOrEqual(g.enemy.r + 4);
    expect(g.enemy.x).toBeLessThanOrEqual(W - g.enemy.r - 4);
    expect(g.enemy.y).toBeGreaterThanOrEqual(g.enemy.r + 8);
    expect(g.enemy.y).toBeLessThanOrEqual(H / 2 - g.enemy.r - 4);
  });

  it("does not leave a slow puck pinned forever in the top-left corner under AI pressure", () => {
    const g = new AirHockeyGame();
    g.start();
    const cornerX = 4 + g.puck.r;
    const cornerY = 4 + g.puck.r;
    g.puck.x = cornerX;
    g.puck.y = cornerY;
    g.puck.vx = 0;
    g.puck.vy = 0;
    g.enemy.x = cornerX + 18;
    g.enemy.y = cornerY + 18;
    g.enemy.vx = 0;
    g.enemy.vy = 0;
    let escaped = false;
    for (let i = 0; i < 240; i++) {
      g.update(1 / 60);
      const nearCorner =
        g.puck.x < 4 + g.puck.r + 8 && g.puck.y < 4 + g.puck.r + 8;
      const speed = Math.hypot(g.puck.vx, g.puck.vy);
      if (!nearCorner || speed > 40) {
        escaped = true;
        break;
      }
    }
    expect(escaped).toBe(true);
  });

  it("does not leave a slow puck pinned forever in the top-right corner under AI pressure", () => {
    const g = new AirHockeyGame();
    g.start();
    const cornerX = W - 4 - g.puck.r;
    const cornerY = 4 + g.puck.r;
    g.puck.x = cornerX;
    g.puck.y = cornerY;
    g.puck.vx = 0;
    g.puck.vy = 0;
    g.enemy.x = cornerX - 18;
    g.enemy.y = cornerY + 18;
    g.enemy.vx = 0;
    g.enemy.vy = 0;
    let escaped = false;
    for (let i = 0; i < 240; i++) {
      g.update(1 / 60);
      const nearCorner =
        g.puck.x > W - 4 - g.puck.r - 8 && g.puck.y < 4 + g.puck.r + 8;
      const speed = Math.hypot(g.puck.vx, g.puck.vy);
      if (!nearCorner || speed > 40) {
        escaped = true;
        break;
      }
    }
    expect(escaped).toBe(true);
  });

  it("nudges a motionless puck out of a rail corner without AI help", () => {
    const g = new AirHockeyGame();
    g.start();
    freezeAi(g);
    g.puck.x = 4 + g.puck.r;
    g.puck.y = 4 + g.puck.r;
    g.puck.vx = 0;
    g.puck.vy = 0;
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    expect(Math.hypot(g.puck.vx, g.puck.vy)).toBeGreaterThan(20);
    expect(g.puck.x).toBeGreaterThan(4 + g.puck.r + 2);
  });

  it("AI idle motion is deterministic from game time (no performance.now)", () => {
    const run = () => {
      const g = new AirHockeyGame();
      g.start();
      g.puck.x = W / 2;
      g.puck.y = H * 0.7;
      g.puck.vx = 0;
      g.puck.vy = 40;
      for (let i = 0; i < 90; i++) g.update(1 / 60);
      return { x: g.enemy.x, y: g.enemy.y, t: g.time };
    };
    const a = run();
    const b = run();
    expect(a.t).toBeCloseTo(b.t, 5);
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.y).toBeCloseTo(b.y, 5);
  });

  it("separates overlapping paddle and puck without burying the puck", () => {
    const g = new AirHockeyGame();
    g.start();
    freezeAi(g);
    g.paddle.x = W / 2;
    g.paddle.y = H * 0.75;
    g.paddle.vx = 0;
    g.paddle.vy = 0;
    g.puck.x = g.paddle.x;
    g.puck.y = g.paddle.y;
    g.puck.vx = 0;
    g.puck.vy = 0;
    g.collide(g.paddle, g.puck);
    const dist = Math.hypot(g.puck.x - g.paddle.x, g.puck.y - g.paddle.y);
    expect(dist).toBeGreaterThanOrEqual(g.paddle.r + g.puck.r - 0.01);
  });

  it("caps extreme puck speed after collision impulse", () => {
    const g = new AirHockeyGame();
    g.start();
    freezeAi(g);
    g.paddle.x = W / 2;
    g.paddle.y = H * 0.7;
    g.paddle.vx = 2000;
    g.paddle.vy = -2000;
    g.puck.x = g.paddle.x;
    g.puck.y = g.paddle.y - g.paddle.r - g.puck.r + 2;
    g.puck.vx = 0;
    g.puck.vy = 100;
    g.collide(g.paddle, g.puck);
    expect(Math.hypot(g.puck.vx, g.puck.vy)).toBeLessThanOrEqual(900.01);
  });
});
