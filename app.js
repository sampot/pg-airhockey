import { AirHockeyAudio } from "./audio.js";
import { AirHockeyGame, GOAL, H, W, WIN } from "./game.js";

const STREAK_KEY = "pg-airhockey-win-streak";
const MUTE_KEY = "pg-airhockey-sfx";
const KEY_SPEED = 420;

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

/** Highest win streak ever (persisted). */
let bestStreak = loadStreak();
/** Current consecutive wins this browser session chain. */
let currentStreak = 0;
let lastTs = 0;
let pointerId = /** @type {number | null} */ (null);
let dark = matchMedia("(prefers-color-scheme: dark)").matches;
let reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
/** @type {Set<string>} */
const keys = new Set();

function loadStreak() {
  try {
    return Math.max(0, Number(localStorage.getItem(STREAK_KEY) || 0));
  } catch {
    return 0;
  }
}

function saveStreak() {
  try {
    localStorage.setItem(STREAK_KEY, String(bestStreak));
  } catch {
    /* */
  }
}

function loadSfxEnabled() {
  try {
    const v = localStorage.getItem(MUTE_KEY);
    if (v === null) return true;
    return v !== "0";
  } catch {
    return true;
  }
}

function saveSfxEnabled(on) {
  try {
    localStorage.setItem(MUTE_KEY, on ? "1" : "0");
  } catch {
    /* */
  }
}

function applyMuteUi(on) {
  btnMute.setAttribute("aria-pressed", on ? "true" : "false");
  btnMute.textContent = on ? "音效" : "靜音";
  audio.setEnabled(on);
}

/** @param {string} msg @param {string} [tone] */
function setStatus(msg, tone = "") {
  statusEl.textContent = msg;
  statusEl.dataset.tone = tone;
}

function syncHud() {
  youEl.textContent = String(game.you);
  aiEl.textContent = String(game.ai);
  bestEl.textContent = String(bestStreak);
  btnStart.textContent = game.status === "ready" ? "開局" : "重開";
}

function setupCanvas() {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

/**
 * @param {PointerEvent} ev
 */
function canvasPos(ev) {
  const rect = canvas.getBoundingClientRect();
  let x = ((ev.clientX - rect.left) / rect.width) * W;
  let y = ((ev.clientY - rect.top) / rect.height) * H;
  // Finger offset so the paddle sits above the touch
  if (ev.pointerType === "touch") {
    y -= 30;
  }
  return { x, y };
}

function syncKeyboardAim() {
  let vx = 0;
  let vy = 0;
  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) vx -= KEY_SPEED;
  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) vx += KEY_SPEED;
  if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) vy -= KEY_SPEED;
  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) vy += KEY_SPEED;
  if (vx !== 0 || vy !== 0) {
    game.setPaddleKeyVelocity(vx, vy);
  } else if (!pointerId) {
    game.setPaddleKeyVelocity(0, 0);
  }
}

function clearInputs() {
  keys.clear();
  pointerId = null;
  game.clearPaddleInput();
}

canvas.addEventListener("pointerdown", async (ev) => {
  await audio.unlock();
  if (game.status === "ready") return;
  pointerId = ev.pointerId;
  canvas.setPointerCapture(ev.pointerId);
  canvas.focus({ preventScroll: true });
  keys.clear();
  const p = canvasPos(ev);
  game.setPaddleTarget(p.x, p.y);
});

canvas.addEventListener("pointermove", (ev) => {
  // Mouse follows the cursor over the table; touch/pen require an active drag.
  const following = pointerId === ev.pointerId || ev.pointerType === "mouse";
  if (!following) return;
  const p = canvasPos(ev);
  game.setPaddleTarget(p.x, p.y);
});

function endPointer(ev) {
  if (pointerId === ev.pointerId) {
    pointerId = null;
    if (keys.size === 0) game.setPaddleKeyVelocity(0, 0);
  }
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("lostpointercapture", (ev) => {
  if (pointerId === ev.pointerId) pointerId = null;
});

window.addEventListener("keydown", (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key;
  if (
    k === "ArrowLeft" ||
    k === "ArrowRight" ||
    k === "ArrowUp" ||
    k === "ArrowDown" ||
    k === "w" ||
    k === "a" ||
    k === "s" ||
    k === "d" ||
    k === "W" ||
    k === "A" ||
    k === "S" ||
    k === "D"
  ) {
    if (game.status === "ready") return;
    ev.preventDefault();
    keys.add(k);
    pointerId = null;
    syncKeyboardAim();
  }
});

window.addEventListener("keyup", (ev) => {
  keys.delete(ev.key);
  syncKeyboardAim();
});

window.addEventListener("blur", () => {
  clearInputs();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInputs();
});

btnStart.addEventListener("click", async () => {
  await audio.unlock();
  audio.click();
  clearInputs();
  game.start();
  setStatus(game.message);
  syncHud();
  canvas.focus({ preventScroll: true });
});

btnMute.addEventListener("click", async () => {
  await audio.unlock();
  const on = btnMute.getAttribute("aria-pressed") !== "true";
  applyMuteUi(on);
  saveSfxEnabled(on);
  if (on) audio.click();
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (ev) => {
  dark = ev.matches;
});

matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (ev) => {
  reduceMotion = ev.matches;
});

window.addEventListener("resize", () => {
  setupCanvas();
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
      currentStreak += 1;
      if (currentStreak > bestStreak) {
        bestStreak = currentStreak;
        saveStreak();
      }
      setStatus(`${game.message} 連勝 ${currentStreak}`, "ok");
      syncHud();
    } else if (e === "lose") {
      audio.lose();
      currentStreak = 0;
      setStatus(game.message, "bad");
      syncHud();
    }
  }
}

function draw() {
  if (!ctx) return;
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

  // goals — clearer mouths
  const g0 = (W - GOAL) / 2;
  ctx.fillStyle = dark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.32)";
  ctx.fillRect(g0, 0, GOAL, 14);
  ctx.fillRect(g0, H - 14, GOAL, 14);
  ctx.strokeStyle = "rgba(255,220,120,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(g0 + 0.5, 0.5, GOAL - 1, 13);
  ctx.strokeRect(g0 + 0.5, H - 13.5, GOAL - 1, 13);
  ctx.fillStyle = "rgba(255,220,120,0.35)";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("AI", W / 2, 11);
  ctx.fillText("你", W / 2, H - 3);

  // rails
  ctx.strokeStyle = dark ? "#c4a574" : "#e8c98a";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  drawPaddle(game.enemy, dark ? "#f87171" : "#ef4444");
  drawPaddle(game.paddle, dark ? "#38bdf8" : "#0ea5e9");
  drawPuck(game.puck);

  if (!reduceMotion && game.hitFlash > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.55, game.hitFlash * 4)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(game.puck.x, game.puck.y, game.puck.r + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (game.scoreFlash > 0 && game.lastScorer) {
    const alpha = reduceMotion ? 0.12 : Math.min(0.35, game.scoreFlash * 0.3);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
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
  rg.addColorStop(0.28, color);
  rg.addColorStop(1, dark ? "#0b1220" : "#0f172a");
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
  const sp = Math.hypot(p.vx, p.vy);
  if (!reduceMotion && sp > 120) {
    const nx = p.vx / sp;
    const ny = p.vy / sp;
    const trail = Math.min(28, sp * 0.035);
    const tg = ctx.createLinearGradient(p.x, p.y, p.x - nx * trail, p.y - ny * trail);
    tg.addColorStop(0, "rgba(248,250,252,0.45)");
    tg.addColorStop(1, "rgba(248,250,252,0)");
    ctx.strokeStyle = tg;
    ctx.lineWidth = p.r * 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - nx * trail, p.y - ny * trail);
    ctx.stroke();
  }
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
  if (keys.size) syncKeyboardAim();
  const events = game.update(dt);
  handleEvents(events);
  draw();
  syncHud();
  requestAnimationFrame(frame);
}

setupCanvas();
applyMuteUi(loadSfxEnabled());
bestEl.textContent = String(bestStreak);
setStatus(game.message);
syncHud();
draw();
requestAnimationFrame(frame);
