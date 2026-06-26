import type { Game } from "../types/game";
import { normalizeTitle } from "../normalizers/game-normalizer";

export function deduplicateGames(games: Game[]): Game[] {
  const map = new Map<string, Game>();

  for (const game of games) {
    const key =
      normalizeTitle(game.title) +
      "_" +
      (game.releaseYear ?? "unknown");

    if (!map.has(key)) {
      map.set(key, game);
    }
  }

  return [...map.values()];
}