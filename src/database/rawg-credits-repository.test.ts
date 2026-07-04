import { beforeEach, describe, expect, test } from "bun:test";
import { getGameCredits, saveGameCredits } from "./rawg-credits-repository";
import { saveGame } from "./game-repository";
import { resetDatabase } from "./test-helpers";
import type { Game } from "../types/game";

function buildGame(overrides: Partial<Game>): Game {
  return {
    source: "rawg",
    sourceId: "3498",
    title: "Grand Theft Auto V",
    releaseYear: 2013,
    platforms: [],
    slug: "grand-theft-auto-v",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("saveGameCredits / getGameCredits", () => {
  test("[getGameCredits] jeu sans crédit retourne []", async () => {
    const gameId = await saveGame(buildGame({}));

    expect(await getGameCredits(gameId)).toEqual([]);
  });

  test("[saveGameCredits] insertion nominale", async () => {
    const gameId = await saveGame(buildGame({}));

    await saveGameCredits(gameId, [
      { id: 1, name: "Person A", slug: "person-a" },
      { id: 2, name: "Person B", slug: null },
    ]);

    const credits = await getGameCredits(gameId);

    expect(credits.sort((a, b) => a.id - b.id)).toEqual([
      { id: 1, name: "Person A", slug: "person-a" },
      { id: 2, name: "Person B", slug: null },
    ]);
  });

  test("[saveGameCredits] même (game_id, rawg_person_id) fait un upsert", async () => {
    const gameId = await saveGame(buildGame({}));

    await saveGameCredits(gameId, [{ id: 1, name: "Ancien nom", slug: null }]);
    await saveGameCredits(gameId, [{ id: 1, name: "Nouveau nom", slug: "nouveau-nom" }]);

    const credits = await getGameCredits(gameId);

    expect(credits).toEqual([{ id: 1, name: "Nouveau nom", slug: "nouveau-nom" }]);
  });

  test("[getGameCredits] ne retourne que les crédits du jeu demandé", async () => {
    const gameA = await saveGame(buildGame({ sourceId: "1" }));
    const gameB = await saveGame(buildGame({ sourceId: "2" }));

    await saveGameCredits(gameA, [{ id: 1, name: "Person A", slug: null }]);
    await saveGameCredits(gameB, [{ id: 2, name: "Person B", slug: null }]);

    expect(await getGameCredits(gameA)).toEqual([{ id: 1, name: "Person A", slug: null }]);
  });
});
