// Tic-Tac-Toe vs Talia — DOM board with a pure, testable minimax core.
// Talia plays near-perfect but takes a random move 25% of the time, so she
// is beatable with a plan (and always with luck).

import type { GameHandle, GameOpts } from "./snake";

export type TttCell = "X" | "O" | " ";
export type TttBoard = TttCell[]; // 9 cells, indexes 0..8

const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export function tttWinner(b: TttBoard): "X" | "O" | "draw" | null {
  for (const [a, c, d] of LINES) {
    if (b[a] !== " " && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return b.every((v) => v !== " ") ? "draw" : null;
}

export function availableCells(b: TttBoard): number[] {
  return b.map((v, i) => (v === " " ? i : -1)).filter((i) => i >= 0);
}

function minimax(b: TttBoard, me: TttCell, turn: TttCell): number {
  const w = tttWinner(b);
  if (w === me) return 1;
  if (w === "draw") return 0;
  if (w) return -1;
  const scores = availableCells(b).map((i) => {
    const next = [...b];
    next[i] = turn;
    return minimax(next, me, turn === "X" ? "O" : "X");
  });
  return turn === me ? Math.max(...scores) : Math.min(...scores);
}

/** Talia's move: minimax-optimal, diluted by an occasional random pick. */
export function taliaMove(b: TttBoard, me: TttCell = "O", rng: () => number = Math.random): number {
  const options = availableCells(b);
  if (options.length === 0) return -1;
  if (rng() < 0.25) return options[Math.floor(rng() * options.length)];
  let best = options[0];
  let bestScore = -Infinity;
  for (const i of options) {
    const next = [...b];
    next[i] = me;
    const s = minimax(next, me, me === "X" ? "O" : "X");
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

// ── DOM mount ───────────────────────────────────────────────────────────

export function mount(container: HTMLElement, opts: GameOpts = {}): GameHandle {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:12px";
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(3,86px);gap:6px";
  const status = document.createElement("p");
  status.style.cssText = "font-size:13px;color:#888;margin:0;min-height:18px";
  wrap.appendChild(grid);
  wrap.appendChild(status);
  container.appendChild(wrap);

  let board: TttBoard = Array(9).fill(" ");
  let over = false;
  let thinking = false;
  const buttons: HTMLButtonElement[] = [];

  function paint(): void {
    board.forEach((v, i) => {
      const btn = buttons[i];
      btn.textContent = v === " " ? "" : v;
      btn.style.color = v === "X" ? "#1a73e8" : "#e91e63";
      btn.disabled = over || v !== " " || thinking;
    });
  }

  function finish(finalScore: number, w: "X" | "O" | "draw"): void {
    over = true;
    status.textContent = w === "X" ? "🎉 You win! +100" : w === "draw" ? "🤝 A draw! +50" : "😈 Talia wins this one! +0";
    opts.onGameOver?.(finalScore);
    paint();
  }

  function evaluate(): void {
    const w = tttWinner(board);
    if (!w) return;
    finish(w === "X" ? 100 : w === "draw" ? 50 : 0, w);
  }

  function onCell(i: number): void {
    if (over || thinking || board[i] !== " ") return;
    board[i] = "X";
    paint();
    evaluate();
    if (over) return;
    thinking = true;
    paint();
    status.textContent = "Talia is thinking…";
    setTimeout(() => {
      const move = taliaMove(board, "O");
      if (move >= 0) board[move] = "O";
      thinking = false;
      paint();
      evaluate();
      if (!over) status.textContent = "Your move — you are ✕";
    }, 350);
  }

  function restart(): void {
    board = Array(9).fill(" ");
    over = false;
    thinking = false;
    status.textContent = "Your move — you are ✕";
    opts.onScore?.(0);
    paint();
  }

  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.style.cssText =
      "width:86px;height:86px;border-radius:12px;border:1px solid #c7cbd1;background:#fff;" +
      "font:700 40px system-ui,sans-serif;cursor:pointer;display:grid;place-items:center;padding:0";
    btn.addEventListener("click", () => onCell(i));
    buttons.push(btn);
    grid.appendChild(btn);
  }
  restart();

  return {
    destroy(): void {
      wrap.remove();
    }
  };
}
