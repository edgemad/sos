// Game engine registry: one mount dispatcher for the arcade UI.

import type { GameId } from "../arcade";
import type { GameHandle, GameOpts } from "./snake";
import { mount as mountSnake } from "./snake";
import { mount as mount2048 } from "./g2048";
import { mount as mountMinesweeper } from "./minesweeper";
import { mount as mountBreakout } from "./breakout";
import { mount as mountMemory } from "./memory";
import { mount as mountTictactoe } from "./tictactoe";

const ENGINES: Record<GameId, (c: HTMLElement, o: GameOpts) => GameHandle> = {
  snake: mountSnake,
  g2048: mount2048,
  minesweeper: mountMinesweeper,
  breakout: mountBreakout,
  memory: mountMemory,
  tictactoe: mountTictactoe
};

/** Mount a game into `container`. Returns a cleanup function. */
export function mountGame(container: HTMLElement, id: GameId, opts: GameOpts = {}): () => void {
  const handle = ENGINES[id](container, opts);
  return () => handle.destroy();
}

export type { GameHandle, GameOpts };
