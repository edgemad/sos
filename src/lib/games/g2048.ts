// 2048 — canvas engine with a pure, testable move core.

import type { GameHandle, GameOpts } from "./snake";

export type Grid = number[][]; // 4×4, 0 = empty
export type MoveDir = "left" | "right" | "up" | "down";

export function emptyGrid(): Grid {
  return [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ];
}

/** Slide one line toward index 0, merging equal neighbours once each. */
export function slideLine(line: number[]): { line: number[]; gained: number } {
  const compact = line.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < compact.length; i++) {
    if (i + 1 < compact.length && compact[i] === compact[i + 1]) {
      const merged = compact[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(compact[i]);
    }
  }
  while (out.length < line.length) out.push(0);
  return { line: out, gained };
}

function extractLines(g: Grid, dir: MoveDir): number[][] {
  const lines: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const line: number[] = [];
    for (let j = 0; j < 4; j++) {
      if (dir === "left") line.push(g[i][j]);
      else if (dir === "right") line.push(g[i][3 - j]);
      else if (dir === "up") line.push(g[j][i]);
      else line.push(g[3 - j][i]);
    }
    lines.push(line);
  }
  return lines;
}

function writeLines(g: Grid, dir: MoveDir, lines: number[][]): Grid {
  const next = g.map((row) => [...row]);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const v = lines[i][j];
      if (dir === "left") next[i][j] = v;
      else if (dir === "right") next[i][3 - j] = v;
      else if (dir === "up") next[j][i] = v;
      else next[3 - j][i] = v;
    }
  }
  return next;
}

export function moveGrid(g: Grid, dir: MoveDir): { grid: Grid; gained: number; moved: boolean } {
  const lines = extractLines(g, dir).map((line) => slideLine(line));
  const gained = lines.reduce((n, l) => n + l.gained, 0);
  const grid = writeLines(g, dir, lines.map((l) => l.line));
  const moved = grid.some((row, r) => row.some((v, c) => v !== g[r][c]));
  return { grid, gained, moved };
}

/** Place a 2 (90%) or 4 (10%) in a random empty cell. */
export function spawnTile(g: Grid, rng: () => number = Math.random): Grid {
  const empty: [number, number][] = [];
  g.forEach((row, r) => row.forEach((v, c) => { if (v === 0) empty.push([r, c]); }));
  if (empty.length === 0) return g;
  const [r, c] = empty[Math.floor(rng() * empty.length)];
  const next = g.map((row) => [...row]);
  next[r][c] = rng() < 0.9 ? 2 : 4;
  return next;
}

export function hasMoves(g: Grid): boolean {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      if (g[r][c] === 0) return true;
      if (c < 3 && g[r][c] === g[r][c + 1]) return true;
      if (r < 3 && g[r][c] === g[r + 1][c]) return true;
    }
  return false;
}

export function maxTile(g: Grid): number {
  return Math.max(...g.flat());
}

// ── Canvas mount ────────────────────────────────────────────────────────

const SIZE = 400;
const PAD = 12;
const TILE = (SIZE - PAD * 5) / 4;

const TILE_COLORS: Record<number, [string, string]> = {
  2: ["#eee4da", "#776e65"],
  4: ["#ede0c8", "#776e65"],
  8: ["#f2b179", "#fff"],
  16: ["#f59563", "#fff"],
  32: ["#f67c5f", "#fff"],
  64: ["#f65e3b", "#fff"],
  128: ["#edcf72", "#fff"],
  256: ["#edcc61", "#fff"],
  512: ["#edc850", "#fff"],
  1024: ["#edc53f", "#fff"],
  2048: ["#edc22e", "#fff"]
};

export function mount(container: HTMLElement, opts: GameOpts = {}): GameHandle {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.cssText = "width:100%;max-width:400px;display:block;margin:0 auto;border-radius:12px;background:#bbada0;touch-action:none";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  let grid = spawnTile(spawnTile(emptyGrid()));
  let score = 0;
  let over = false;
  let won = false;
  let touchStart: [number, number] | null = null;

  function draw(): void {
    ctx.fillStyle = "#bbada0";
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = PAD + c * (TILE + PAD);
        const y = PAD + r * (TILE + PAD);
        const v = grid[r][c];
        const [bg, fg] = TILE_COLORS[v] ?? ["#3c3a32", "#fff"];
        ctx.fillStyle = v === 0 ? "rgba(238,228,218,0.35)" : bg;
        roundRect(x, y, TILE, TILE, 8);
        ctx.fill();
        if (v !== 0) {
          ctx.fillStyle = fg;
          ctx.font = `700 ${v >= 1024 ? 30 : v >= 128 ? 34 : 38}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(v), x + TILE / 2, y + TILE / 2 + 2);
        }
      }
    }
    if (over) {
      ctx.fillStyle = "rgba(238,228,218,0.75)";
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = "#776e65";
      ctx.font = "700 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Game over", SIZE / 2, SIZE / 2 - 16);
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("Click or press R to try again", SIZE / 2, SIZE / 2 + 14);
    } else if (won && maxTile(grid) >= 2048) {
      ctx.fillStyle = "#edc22e";
      ctx.font = "700 20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🎉 2048! Keep going…", SIZE / 2, 22);
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

  function move(dir: MoveDir): void {
    if (over) return;
    const r = moveGrid(grid, dir);
    if (!r.moved) return;
    grid = spawnTile(r.grid);
    score += r.gained;
    opts.onScore?.(score);
    if (maxTile(grid) >= 2048) won = true;
    if (!hasMoves(grid)) {
      over = true;
      draw();
      opts.onGameOver?.(score);
    }
  }

  function restart(): void {
    grid = spawnTile(spawnTile(emptyGrid()));
    score = 0;
    over = false;
    won = false;
    opts.onScore?.(0);
    draw();
  }

  function onKey(e: KeyboardEvent): void {
    const map: Record<string, MoveDir> = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down"
    };
    const dir = map[e.key];
    if (dir) {
      e.preventDefault();
      move(dir);
      draw();
    } else if ((e.key === "r" || e.key === "R") && over) {
      restart();
    }
  }

  function onClick(): void {
    if (over) restart();
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
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    draw();
  }

  window.addEventListener("keydown", onKey);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("touchstart", onTouchStart, { passive: true });
  canvas.addEventListener("touchend", onTouchEnd, { passive: true });
  draw();

  return {
    destroy(): void {
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.remove();
    }
  };
}
