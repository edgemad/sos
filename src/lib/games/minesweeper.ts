// Minesweeper — DOM grid engine with a pure, testable board core.

import type { GameHandle, GameOpts } from "./snake";

export const MS_ROWS = 9;
export const MS_COLS = 9;
export const MS_MINES = 10;

export interface MinesCell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  count: number; // neighbouring mines
}

export type MinesBoard = MinesCell[][];

export function emptyBoard(rows = MS_ROWS, cols = MS_COLS): MinesBoard {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, count: 0 }))
  );
}

export function neighbors(r: number, c: number, rows = MS_ROWS, cols = MS_COLS): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) out.push([nr, nc]);
    }
  return out;
}

/** Generate a board whose first-clicked cell (and, when possible, its
 *  neighborhood) is guaranteed mine-free. Pure: returns a new board. */
export function generateBoard(rows: number, cols: number, mines: number, safeR: number, safeC: number, rng: () => number = Math.random): MinesBoard {
  const board = emptyBoard(rows, cols);
  const safe = new Set<string>([`${safeR},${safeC}`, ...neighbors(safeR, safeC, rows, cols).map(([r, c]) => `${r},${c}`)]);
  const spots: string[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if (!safe.has(`${r},${c}`)) spots.push(`${r},${c}`);
  if (spots.length < mines) {
    spots.length = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (!(r === safeR && c === safeC)) spots.push(`${r},${c}`);
  }
  // Fisher–Yates with the injected rng, take the first `mines`.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const spot of spots.slice(0, mines)) {
    const [r, c] = spot.split(",").map(Number);
    board[r][c].mine = true;
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      board[r][c].count = neighbors(r, c, rows, cols).filter(([nr, nc]) => board[nr][nc].mine).length;
  return board;
}

/** Reveal a cell, flooding zero-count regions. Mutates the board in place. */
export function revealFrom(board: MinesBoard, r: number, c: number): { hit: boolean; revealed: number } {
  const cell = board[r][c];
  if (cell.flagged || cell.revealed) return { hit: false, revealed: 0 };
  cell.revealed = true;
  if (cell.mine) return { hit: true, revealed: 1 };
  let revealed = 1;
  if (cell.count === 0) {
    for (const [nr, nc] of neighbors(r, c, board.length, board[0].length)) {
      if (!board[nr][nc].revealed) revealed += revealFrom(board, nr, nc).revealed;
    }
  }
  return { hit: false, revealed };
}

export function isWin(board: MinesBoard): boolean {
  for (const row of board)
    for (const cell of row)
      if (!cell.mine && !cell.revealed) return false;
  return true;
}

export function revealedCount(board: MinesBoard): number {
  let n = 0;
  for (const row of board) for (const cell of row) if (cell.revealed && !cell.mine) n++;
  return n;
}

// ── DOM mount ───────────────────────────────────────────────────────────

const NUM_COLORS = ["", "#1976d2", "#388e3c", "#d32f2f", "#7b1fa2", "#c62828", "#00838f", "#000", "#616161"];

export function mount(container: HTMLElement, opts: GameOpts = {}): GameHandle {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:10px";
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(9,32px);gap:2px;user-select:none";
  const status = document.createElement("p");
  status.style.cssText = "font-size:13px;color:#888;margin:0";
  wrap.appendChild(grid);
  wrap.appendChild(status);
  container.appendChild(wrap);

  let board: MinesBoard | null = null;
  let over = false;
  let won = false;
  let score = 0;
  const cells: HTMLButtonElement[] = [];

  const CSS = (btn: HTMLButtonElement, revealed: boolean): void => {
    btn.style.cssText =
      `width:32px;height:32px;border-radius:5px;border:1px solid ${revealed ? "#c9c9c9" : "#9aa4b2"};` +
      `background:${revealed ? "#e8eaed" : "#f8fafc"};font:600 14px system-ui,sans-serif;color:#333;` +
      `cursor:pointer;display:grid;place-items:center;padding:0`;
  };

  function paint(): void {
    if (!board) return;
    for (let r = 0; r < MS_ROWS; r++)
      for (let c = 0; c < MS_COLS; c++) {
        const btn = cells[r * MS_COLS + c];
        const cell = board[r][c];
        if (cell.revealed) {
          CSS(btn, true);
          if (cell.mine) {
            btn.textContent = "💣";
            // On a loss every mine reads red so the board is readable at a glance.
            btn.style.background = over && !won ? "#fecaca" : "#e8eaed";
          } else if (cell.count > 0) {
            btn.textContent = String(cell.count);
            btn.style.color = NUM_COLORS[cell.count];
          } else {
            btn.textContent = "";
          }
        } else {
          CSS(btn, false);
          btn.textContent = cell.flagged ? "🚩" : "";
        }
      }
  }

  function finish(finalScore: number, wonGame: boolean): void {
    over = true;
    won = wonGame;
    status.textContent = wonGame
      ? `🎉 Cleared! Score ${finalScore} — click any cell for a new board.`
      : `💥 Boom! Score ${finalScore} — click any cell to retry.`;
    opts.onGameOver?.(finalScore);
  }

  function onCell(r: number, c: number): void {
    if (over) {
      restart();
      onCell(r, c); // first click of the new board
      return;
    }
    if (!board) {
      board = generateBoard(MS_ROWS, MS_COLS, MS_MINES, r, c);
      status.textContent = "Right-click (or long-press) to flag 💣";
    }
    const cell = board[r][c];
    if (cell.flagged || cell.revealed) return;
    const res = revealFrom(board, r, c);
    if (res.hit) {
      // Reveal every mine, then end.
      for (const row of board) for (const m of row) if (m.mine) m.revealed = true;
      paint();
      finish(score, false);
      return;
    }
    score = revealedCount(board) * 15;
    opts.onScore?.(score);
    paint();
    if (isWin(board)) {
      score += 500;
      opts.onScore?.(score);
      paint();
      finish(score, true);
    }
  }

  function onFlag(r: number, c: number): void {
    if (!board || over) return;
    const cell = board[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    paint();
  }

  function restart(): void {
    board = null;
    over = false;
    won = false;
    score = 0;
    opts.onScore?.(0);
    status.textContent = "";
  }

  for (let r = 0; r < MS_ROWS; r++)
    for (let c = 0; c < MS_COLS; c++) {
      const btn = document.createElement("button");
      CSS(btn, false);
      btn.addEventListener("click", () => onCell(r, c));
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        onFlag(r, c);
      });
      // Long-press flags on touch devices.
      let pressTimer: ReturnType<typeof setTimeout> | null = null;
      btn.addEventListener("touchstart", () => {
        pressTimer = setTimeout(() => onFlag(r, c), 450);
      }, { passive: true });
      btn.addEventListener("touchend", () => {
        if (pressTimer) clearTimeout(pressTimer);
      }, { passive: true });
      cells.push(btn);
      grid.appendChild(btn);
    }

  return {
    destroy(): void {
      wrap.remove();
    }
  };
}
