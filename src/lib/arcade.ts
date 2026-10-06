// Talia Arcade — an in-app game store. Games are built in (offline, zero
// dependencies): browsing, installing, playing and personal bests work
// exactly like a store, but nothing ever leaves the device.

import { writable } from "svelte/store";

export type GameId = "snake" | "g2048" | "minesweeper" | "breakout" | "memory" | "tictactoe";

export type GameCategory = "Arcade" | "Puzzle" | "Classic";

export interface GameMeta {
  id: GameId;
  name: string;
  icon: string;
  tagline: string;
  category: GameCategory;
  /** Store-style rating (static, editorial). */
  rating: number;
  /** Gradient ends for the card art. */
  from: string;
  to: string;
  controls: string;
}

export const GAMES: GameMeta[] = [
  {
    id: "snake", name: "Snake Classic", icon: "🐍", tagline: "Grow long, don't bite yourself. The timeless grid crawler.",
    category: "Arcade", rating: 4.6, from: "#22c55e", to: "#065f46", controls: "Arrows / WASD / swipe"
  },
  {
    id: "g2048", name: "2048", icon: "🔢", tagline: "Slide and merge tiles — can you reach the golden 2048?",
    category: "Puzzle", rating: 4.8, from: "#f59e0b", to: "#b45309", controls: "Arrows / swipe · R restarts"
  },
  {
    id: "minesweeper", name: "Minesweeper", icon: "💣", tagline: "Sweep the grid, flag the bombs, trust the numbers.",
    category: "Classic", rating: 4.5, from: "#64748b", to: "#1e293b", controls: "Click reveals · right-click flags"
  },
  {
    id: "breakout", name: "Brick Breaker", icon: "🧱", tagline: "Bounce, smash every brick, chase the perfect clear.",
    category: "Arcade", rating: 4.4, from: "#ef4444", to: "#7f1d1d", controls: "Mouse or ← →"
  },
  {
    id: "memory", name: "Memory Match", icon: "🃏", tagline: "Flip, remember, match all eight pairs in as few moves as you can.",
    category: "Puzzle", rating: 4.3, from: "#8b5cf6", to: "#4c1d95", controls: "Click cards"
  },
  {
    id: "tictactoe", name: "Tic-Tac-Toe vs Talia", icon: "⭕", tagline: "Beat Talia at noughts and crosses — she's good, but not perfect!",
    category: "Classic", rating: 4.7, from: "#3b82f6", to: "#1e3a8a", controls: "Click a square"
  }
];

export function gameById(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}

// ── Persisted arcade state ──────────────────────────────────────────────

export interface ArcadeState {
  installed: GameId[];
  /** Personal best score per game (higher is better for every game). */
  best: Partial<Record<GameId, number>>;
  plays: Partial<Record<GameId, number>>;
}

const KEY = "sos.arcade.v1";

export function newArcadeState(): ArcadeState {
  return { installed: [], best: {}, plays: {} };
}

export function isInstalled(s: ArcadeState, id: GameId): boolean {
  return s.installed.includes(id);
}

export function bestScore(s: ArcadeState, id: GameId): number {
  return s.best[id] ?? 0;
}

/** Install a game. Returns the new state (pure — the store applies it). */
export function withInstalled(s: ArcadeState, id: GameId): ArcadeState {
  if (isInstalled(s, id)) return s;
  return { ...s, installed: [...s.installed, id] };
}

/** Uninstall (progress like best scores is kept — reinstalling restores it). */
export function withoutInstalled(s: ArcadeState, id: GameId): ArcadeState {
  return { ...s, installed: s.installed.filter((g) => g !== id) };
}

/** Record a finished run. Returns whether it set a new personal best. */
export function withScore(s: ArcadeState, id: GameId, score: number): { state: ArcadeState; newBest: boolean } {
  const prev = bestScore(s, id);
  const newBest = Number.isFinite(score) && score > prev;
  return {
    state: { ...s, best: { ...s.best, [id]: newBest ? score : prev }, plays: { ...s.plays, [id]: (s.plays[id] ?? 0) + 1 } },
    newBest
  };
}

function loadArcade(): ArcadeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newArcadeState();
    const parsed = JSON.parse(raw) as Partial<ArcadeState>;
    const valid = new Set(GAMES.map((g) => g.id));
    return {
      installed: Array.isArray(parsed.installed) ? parsed.installed.filter((id): id is GameId => valid.has(id as GameId)) : [],
      best: typeof parsed.best === "object" && parsed.best ? parsed.best : {},
      plays: typeof parsed.plays === "object" && parsed.plays ? parsed.plays : {}
    };
  } catch {
    return newArcadeState();
  }
}

export const arcade = writable<ArcadeState>(loadArcade());

arcade.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* non-fatal */
  }
});

export function installGame(id: GameId): void {
  arcade.update((s) => withInstalled(s, id));
}

export function uninstallGame(id: GameId): void {
  arcade.update((s) => withoutInstalled(s, id));
}

/** Record a finished run; returns true when it set a new personal best. */
export function recordScore(id: GameId, score: number): boolean {
  let newBest = false;
  arcade.update((s) => {
    const r = withScore(s, id, score);
    newBest = r.newBest;
    return r.state;
  });
  return newBest;
}
