// Snake Classic — canvas engine with a pure, testable step core.
// Mount contract shared by every arcade game: mount(container, opts) → handle.

export interface GameHandle {
  destroy(): void;
}
export interface GameOpts {
  onScore?: (score: number) => void;
  onGameOver?: (finalScore: number) => void;
}

export const SNAKE_GRID = 20;
export type Dir = "up" | "down" | "left" | "right";

export interface SnakeState {
  body: [number, number][]; // head first
  dir: Dir;
  pending: Dir | null;
  food: [number, number];
  score: number;
  alive: boolean;
}

const DELTAS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

function spawnFood(body: [number, number][], rng: () => number): [number, number] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const c: [number, number] = [Math.floor(rng() * SNAKE_GRID), Math.floor(rng() * SNAKE_GRID)];
    if (!body.some(([x, y]) => x === c[0] && y === c[1])) return c;
  }
  for (let y = 0; y < SNAKE_GRID; y++)
    for (let x = 0; x < SNAKE_GRID; x++)
      if (!body.some(([bx, by]) => bx === x && by === y)) return [x, y];
  return [0, 0];
}

export function initSnake(rng: () => number = Math.random): SnakeState {
  const body: [number, number][] = [[10, 10], [9, 10], [8, 10]];
  return { body, dir: "right", pending: null, food: spawnFood(body, rng), score: 0, alive: true };
}

/** Queue a turn; 180° reversals are ignored. */
export function turnSnake(s: SnakeState, d: Dir): SnakeState {
  const base = s.pending ?? s.dir;
  if (d === OPPOSITE[base] || d === base) return s;
  return { ...s, pending: d };
}

/** Advance one tick. Returns the next state and whether food was eaten. */
export function stepSnake(s: SnakeState, rng: () => number = Math.random): { next: SnakeState; ate: boolean } {
  if (!s.alive) return { next: s, ate: false };
  const dir = s.pending ?? s.dir;
  const [dx, dy] = DELTAS[dir];
  const [hx, hy] = s.body[0];
  const head: [number, number] = [hx + dx, hy + dy];
  const hitWall = head[0] < 0 || head[1] < 0 || head[0] >= SNAKE_GRID || head[1] >= SNAKE_GRID;
  const ate = !hitWall && head[0] === s.food[0] && head[1] === s.food[1];
  // The tail vacates its cell unless we grow this tick.
  const bodyForHit = ate ? s.body : s.body.slice(0, -1);
  const hitSelf = bodyForHit.some(([x, y]) => x === head[0] && y === head[1]);
  if (hitWall || hitSelf) return { next: { ...s, alive: false, dir }, ate: false };

  const body: [number, number][] = [head, ...s.body];
  if (!ate) body.pop();
  const next: SnakeState = {
    body,
    dir,
    pending: null,
    food: ate ? spawnFood(body, rng) : s.food,
    score: s.score + (ate ? 10 : 0),
    alive: true
  };
  return { next, ate };
}

// ── Canvas mount ────────────────────────────────────────────────────────

const SIZE = 400;
const CELL = SIZE / SNAKE_GRID;

export function mount(container: HTMLElement, opts: GameOpts = {}): GameHandle {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.cssText = "width:100%;max-width:400px;display:block;margin:0 auto;border-radius:12px;background:#0b1220;touch-action:none";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  let state = initSnake();
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let over = false;
  let touchStart: [number, number] | null = null;

  function stepMs(): number {
    return Math.max(70, 150 - Math.floor(state.score / 50) * 10);
  }

  function draw(): void {
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 1; i < SNAKE_GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(SIZE, i * CELL); ctx.stroke();
    }
    // food
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(state.food[0] * CELL + CELL / 2, state.food[1] * CELL + CELL / 2, CELL * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // snake
    state.body.forEach(([x, y], i) => {
      ctx.fillStyle = i === 0 ? "#86efac" : "#22c55e";
      const pad = i === 0 ? 1 : 2;
      roundRect(x * CELL + pad, y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 5);
      ctx.fill();
    });
    if (!state.alive) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = "#fff";
      ctx.font = "600 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Game over", SIZE / 2, SIZE / 2 - 14);
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("Click or press Space to play again", SIZE / 2, SIZE / 2 + 16);
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
    const dt = now - last;
    last = now;
    acc += dt;
    while (acc >= stepMs() && state.alive) {
      acc -= stepMs();
      const { next } = stepSnake(state);
      state = next;
      opts.onScore?.(state.score);
    }
    draw();
    if (!state.alive && !over) {
      over = true;
      opts.onGameOver?.(state.score);
    }
    raf = requestAnimationFrame(tick);
  }

  function restart(): void {
    state = initSnake();
    over = false;
    acc = 0;
    opts.onScore?.(0);
  }

  function onKey(e: KeyboardEvent): void {
    const map: Record<string, Dir> = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right"
    };
    const dir = map[e.key];
    if (dir) {
      e.preventDefault();
      state = turnSnake(state, dir);
    } else if (e.key === " " && !state.alive) {
      e.preventDefault();
      restart();
    }
  }

  function onClick(): void {
    if (!state.alive) restart();
  }

  function onTouchStart(e: TouchEvent): void {
    const t = e.touches[0];
    touchStart = [t.clientX, t.clientY];
  }
  function onTouchEnd(e: TouchEvent): void {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart[0];
    const dy = t.clientY - touchStart[1];
    touchStart = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
      onClick();
      return;
    }
    state = turnSnake(state, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  }

  window.addEventListener("keydown", onKey);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchend", onTouchEnd, { passive: true });
  raf = requestAnimationFrame(tick);

  return {
    destroy(): void {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.remove();
    }
  };
}
