import { AirHockeyAudio } from "./audio.js";
import { AirHockeyGame, GOAL, H, W, WIN } from "./game.js";

const BEST_KEY = "pg-airhockey-best";
const audio = new AirHockeyAudio();
const game = new AirHockeyGame();

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
const ctx = canvas.getContext("2d");
const youEl = document.getElementById("you");
const aiEl = document.getElementById("ai");
const bestEl = document.getElementById("best");
const statusEl = document.getElementById("status");
const btnStart = document.getElementById("btn-start");
const btnMute = document.getElementById("btn-mute");

canvas.width = W;
canvas.height = H;

let best = loadBest();
let lastTs = 0;
let pointerId = /** @type {number | null} */ (null);

function loadBest() {
  try {
    return Math.max(0, Number(localStorage.getItem(BEST_KEY) || 0));
  } catch {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    /* */
  }
}

/** @param {string} msg @param {string} [tone] */
function setStatus(msg, tone = "") {
  statusEl.textContent = msg;
  statusEl.dataset.tone = tone;
}

function syncHud() {
  youEl.textContent = String(game.you);
  aiEl.textContent = String(game.ai);
  bestEl.textContent = String(Math.max(best, game.best));
  btnStart.textContent = game.status === "ready" ? "開局" : "重開";
}

/**
 * @param {PointerEvent} ev
 */
function canvasPos(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * W;
  const y = ((ev.clientY - rect.top) / rect.height) * H;
  return { x, y };
}

canvas.addEventListener("pointerdown", async (ev) => {
  await audio.unlock();
  if (game.status === "ready") return;
  pointerId = ev.pointerId;
  canvas.setPointerCapture(ev.pointerId);
  const p = canvasPos(ev);
  game.aimPaddle(p.x, p.y);
});

canvas.addEventListener("pointermove", (ev) => {
  if (pointerId !== ev.pointerId) return;
  const p = canvasPos(ev);
  game.aimPaddle(p.x, p.y);
});

canvas.addEventListener("pointerup", (ev) => {
  if (pointerId === ev.pointerId) pointerId = null;
});
canvas.addEventListener("pointercancel", () => {
  pointerId = null;
});

btnStart.addEventListener("click", async () => {
  await audio.unlock();
  audio.click();
  game.start(best);
  setStatus(game.message);
  syncHud();
});

btnMute.addEventListener("click", async () => {
  await audio.unlock();
  const on = btnMute.getAttribute("aria-pressed") !== "true";
  btnMute.setAttribute("aria-pressed", on ? "true" : "false");
  btnMute.textContent = on ? "音效" : "靜音";
  audio.setEnabled(on);
  audio.click();
});

/** @param {string[]} events */
function handleEvents(events) {
  for (const e of events) {
    if (e === "hit") audio.hit();
    else if (e === "goal-you") {
      audio.goal();
      setStatus(game.message, "ok");
    } else if (e === "goal-ai") {
      audio.losePoint();
      setStatus(game.message, "warn");
    } else if (e === "win") {
      audio.win();
      best = Math.max(best, game.you);
      saveBest();
      setStatus(game.message, "ok");
    } else if (e === "lose") {
      audio.lose();
      setStatus(game.message, "bad");
    }
  }
}

function draw() {
  if (!ctx) return;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  // table
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, dark ? "#0f3a4a" : "#1a6b7a");
  g.addColorStop(0.5, dark ? "#0c2f3c" : "#157a8a");
  g.addColorStop(1, dark ? "#0f3a4a" : "#1a6b7a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // center line + circle
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(8, H / 2);
  ctx.lineTo(W - 8, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 42, 0, Math.PI * 2);
  ctx.stroke();

  // goals
  const g0 = (W - GOAL) / 2;
  ctx.fillStyle = dark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.28)";
  ctx.fillRect(g0, 0, GOAL, 10);
  ctx.fillRect(g0, H - 10, GOAL, 10);
  ctx.strokeStyle = "rgba(255,220,120,0.7)";
  ctx.strokeRect(g0 + 0.5, 0.5, GOAL - 1, 9);
  ctx.strokeRect(g0 + 0.5, H - 9.5, GOAL - 1, 9);

  // rails
  ctx.strokeStyle = dark ? "#c4a574" : "#e8c98a";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  drawPaddle(game.enemy, dark ? "#f87171" : "#ef4444");
  drawPaddle(game.paddle, dark ? "#38bdf8" : "#0ea5e9");
  drawPuck(game.puck);

  if (game.scoreFlash > 0 && game.lastScorer) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.35, game.scoreFlash * 0.3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(game.lastScorer === "you" ? "+1" : "AI +1", W / 2, H / 2);
  }

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`先得 ${WIN} 分`, W / 2, H / 2 + 58);
}

/**
 * @param {import('./game.js').Body} p
 * @param {string} color
 */
function drawPaddle(p, color) {
  if (!ctx) return;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  const rg = ctx.createRadialGradient(p.x - 6, p.y - 6, 4, p.x, p.y, p.r);
  rg.addColorStop(0, "#fff");
  rg.addColorStop(0.2, color);
  rg.addColorStop(1, "#0f172a");
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fill();
}

/** @param {import('./game.js').Body} p */
function drawPuck(p) {
  if (!ctx) return;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  const rg = ctx.createRadialGradient(p.x - 3, p.y - 3, 2, p.x, p.y, p.r);
  rg.addColorStop(0, "#f8fafc");
  rg.addColorStop(0.5, "#334155");
  rg.addColorStop(1, "#020617");
  ctx.fillStyle = rg;
  ctx.fill();
}

function frame(ts) {
  const dt = Math.min(0.033, (ts - (lastTs || ts)) / 1000);
  lastTs = ts;
  const events = game.update(dt);
  handleEvents(events);
  if (game.status === "over") {
    best = Math.max(best, game.best, game.you);
    saveBest();
  }
  draw();
  syncHud();
  requestAnimationFrame(frame);
}

bestEl.textContent = String(best);
setStatus(game.message);
syncHud();
draw();
requestAnimationFrame(frame);
