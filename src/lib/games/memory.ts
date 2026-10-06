// Memory Match — DOM card grid; score rewards fewer moves.

import type { GameHandle, GameOpts } from "./snake";

export const MEMORY_EMOJI = ["🍎", "🚀", "🐶", "🌟", "🎈", "🍩", "🐸", "🎸"];

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Score for a finished board: 1000 minus a 30-point toll per move beyond
 *  the perfect 8-pair minimum (16 flips / 2 = 8 "moves" in flip pairs). */
export function memoryScore(moves: number): number {
  return Math.max(50, 1000 - Math.max(0, moves - 8) * 30);
}

export function mount(container: HTMLElement, opts: GameOpts = {}): GameHandle {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:12px";
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(4,76px);gap:8px";
  const status = document.createElement("p");
  status.style.cssText = "font-size:13px;color:#888;margin:0";
  wrap.appendChild(grid);
  wrap.appendChild(status);
  container.appendChild(wrap);

  interface Card { emoji: string; matched: boolean }
  let cards: Card[] = [];
  let buttons: HTMLButtonElement[] = [];
  let open: number[] = []; // indexes of face-up, unmatched cards
  let moves = 0;
  let matched = 0;
  let lock = false;

  function deal(): void {
    cards = shuffle([...MEMORY_EMOJI, ...MEMORY_EMOJI]).map((emoji) => ({ emoji, matched: false }));
    buttons = cards.map((card, i) => {
      const btn = document.createElement("button");
      btn.style.cssText =
        "width:76px;height:76px;border-radius:12px;border:1px solid #c7cbd1;background:linear-gradient(135deg,#eef2ff,#e0e7ff);" +
        "font-size:30px;cursor:pointer;display:grid;place-items:center;padding:0;transition:transform .12s";
      btn.addEventListener("click", () => flip(i));
      grid.appendChild(btn);
      return btn;
    });
    open = [];
    moves = 0;
    matched = 0;
    lock = false;
    status.textContent = "";
    paint();
  }

  function paint(): void {
    cards.forEach((card, i) => {
      const btn = buttons[i];
      const faceUp = card.matched || open.includes(i);
      btn.textContent = faceUp ? card.emoji : "";
      btn.style.transform = card.matched ? "scale(0.94)" : "";
      btn.style.opacity = card.matched ? "0.55" : "1";
      btn.style.background = card.matched ? "linear-gradient(135deg,#dcfce7,#bbf7d0)" : "linear-gradient(135deg,#eef2ff,#e0e7ff)";
    });
  }

  function flip(i: number): void {
    if (lock || cards[i].matched || open.includes(i)) return;
    open.push(i);
    paint();
    if (open.length < 2) return;
    moves++;
    const [a, b] = open;
    if (cards[a].emoji === cards[b].emoji) {
      cards[a].matched = true;
      cards[b].matched = true;
      open = [];
      matched++;
      opts.onScore?.(memoryScore(moves));
      paint();
      if (matched === MEMORY_EMOJI.length) {
        const final = memoryScore(moves);
        status.textContent = `🎉 All pairs in ${moves} moves — score ${final}!`;
        opts.onGameOver?.(final);
      }
    } else {
      lock = true;
      setTimeout(() => {
        open = [];
        lock = false;
        paint();
      }, 650);
    }
  }

  deal();

  return {
    destroy(): void {
      wrap.remove();
    }
  };
}
