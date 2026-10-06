// Brick Breaker — canvas engine (mouse or arrow keys, dt-based physics).

import type { GameHandle, GameOpts } from "./snake";

const W = 480;
const H = 340;
const COLS = 8;
const ROWS = 4;
const BRICK_H = 18;
const BRICK_TOP = 40;
const PADDLE_W = 78;
const PADDLE_H = 10;

const BRICK_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e"];

interface Brick { x: number; y: number; w: number; h: number; alive: boolean; row: number }

export function mount(container: HTMLElement, opts: GameOpts = {}): GameHandle {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = "width:100%;max-width:480px;display:block;margin:0 auto;border-radius:12px;background:#0f172a;touch-action:none;cursor:none";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  let paddleX = W / 2;
  let ball = { x: W / 2, y: H - 40, vx: 3.2, vy: -3.2 };
  let bricks: Brick[] = [];
  let score = 0;
  let lives = 3;
  let level = 1;
  let over = false;
  let raf = 0;
  let last = performance.now();
  let leftDown = false;
  let rightDown = false;

  function buildBricks(): void {
    bricks = [];
    const gap = 4;
    const bw = (W - gap * (COLS + 1)) / COLS;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        bricks.push({ x: gap + c * (bw + gap), y: BRICK_TOP + r * (BRICK_H + gap), w: bw, h: BRICK_H, alive: true, row: r });
  }

  function resetBall(): void {
    ball = { x: W / 2, y: H - 40, vx: (level % 2 === 0 ? -1 : 1) * 3.2 * (1 + (level - 1) * 0.08), vy: -3.2 * (1 + (level - 1) * 0.08) };
  }

  function restart(): void {
    score = 0;
    lives = 3;
    level = 1;
    over = false;
    buildBricks();
    resetBall();
    opts.onScore?.(0);
  }

  function draw(): void {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = BRICK_COLORS[b.row % BRICK_COLORS.length];
      roundRect(b.x, b.y, b.w, b.h, 4);
      ctx.fill();
    }
    // paddle
    ctx.fillStyle = "#38bdf8";
    roundRect(paddleX - PADDLE_W / 2, H - 18, PADDLE_W, PADDLE_H, 5);
    ctx.fill();
    // ball
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
    ctx.fill();
    // hud
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`❤️ ${lives}`, 10, 20);
    ctx.textAlign = "center";
    ctx.fillText(`Level ${level}`, W / 2, 20);
    if (over) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "600 22px system-ui, sans-serif";
      ctx.fillText("Game over", W / 2, H / 2 - 12);
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("Click to play again", W / 2, H / 2 + 16);
    }
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function tick(now: number): void {
    const dt = Math.min(32, now - last) / 16.667; // ~1 unit per 60fps frame
    last = now;
    if (!over) {
      // paddle
      if (leftDown) paddleX -= 6 * dt;
      if (rightDown) paddleX += 6 * dt;
      paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, paddleX));

      // ball
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < 6) { ball.x = 6; ball.vx = Math.abs(ball.vx); }
      if (ball.x > W - 6) { ball.x = W - 6; ball.vx = -Math.abs(ball.vx); }
      if (ball.y < 6) { ball.y = 6; ball.vy = Math.abs(ball.vy); }

      // paddle bounce (angle depends on where it lands)
      if (ball.vy > 0 && ball.y >= H - 18 - 6 && ball.y <= H - 12 && Math.abs(ball.x - paddleX) <= PADDLE_W / 2 + 6) {
        const hit = (ball.x - paddleX) / (PADDLE_W / 2); // -1..1
        const speed = Math.hypot(ball.vx, ball.vy);
        const angle = hit * (Math.PI / 3); // up to 60°
        ball.vx = speed * Math.sin(angle);
        ball.vy = -Math.abs(speed * Math.cos(angle));
        ball.y = H - 18 - 6;
      }

      // brick collisions
      for (const b of bricks) {
        if (!b.alive) continue;
        if (ball.x > b.x - 6 && ball.x < b.x + b.w + 6 && ball.y > b.y - 6 && ball.y < b.y + b.h + 6) {
          b.alive = false;
          score += 10;
          opts.onScore?.(score);
          // Bounce back on the axis of least penetration.
          const fromLeft = ball.x - (b.x - 6);
          const fromRight = b.x + b.w + 6 - ball.x;
          const fromTop = ball.y - (b.y - 6);
          const fromBottom = b.y + b.h + 6 - ball.y;
          const min = Math.min(fromLeft, fromRight, fromTop, fromBottom);
          if (min === fromTop || min === fromBottom) ball.vy = -ball.vy;
          else ball.vx = -ball.vx;
          break;
        }
      }

      // level clear
      if (bricks.every((b) => !b.alive)) {
        level++;
        buildBricks();
        resetBall();
      }

      // fell off
      if (ball.y > H + 10) {
        lives--;
        if (lives <= 0) {
          over = true;
          opts.onGameOver?.(score);
        } else {
          resetBall();
        }
      }
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  function onKey(e: KeyboardEvent, down: boolean): void {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { leftDown = down; e.preventDefault(); }
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { rightDown = down; e.preventDefault(); }
  }
  const onKeydown = (e: KeyboardEvent): void => onKey(e, true);
  const onKeyup = (e: KeyboardEvent): void => onKey(e, false);

  function onMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    paddleX = ((e.clientX - rect.left) / rect.width) * W;
  }
  function onTouch(e: TouchEvent): void {
    const rect = canvas.getBoundingClientRect();
    paddleX = ((e.touches[0].clientX - rect.left) / rect.width) * W;
  }
  function onClick(): void {
    if (over) restart();
  }

  window.addEventListener("keydown", onKeydown);
  window.addEventListener("keyup", onKeyup);
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("touchmove", onTouch, { passive: true });
  canvas.addEventListener("click", onClick);

  restart();
  raf = requestAnimationFrame(tick);

  return {
    destroy(): void {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("keyup", onKeyup);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("click", onClick);
      canvas.remove();
    }
  };
}
