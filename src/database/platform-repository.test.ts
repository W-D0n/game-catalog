import { beforeEach, describe, expect, test } from "bun:test";
import { countPlatforms, savePlatforms } from "./platform-repository";
import { getGamesBySource, saveGame } from "./game-repository";
import { resetDatabase } from "./test-helpers";
import type { Game } from "../types/game";

function buildGame(overrides: Partial<Game>): Game {
  return {
    source: "rawg",
    sourceId: "3498",
    title: "Grand Theft Auto V",
    releaseYear: 2013,
    platforms: ["PC"],
    slug: "grand-theft-auto-v",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("savePlatforms", () => {
  test("[savePlatforms] lie les plateformes au jeu", async () => {
    const game = buildGame({ platforms: ["PC", "Xbox Series X"] });
    const gameId = await saveGame(game);

    await savePlatforms(game, gameId);

    const [saved] = await getGamesBySource("rawg");
    expect(saved?.platforms.sort()).toEqual(["PC", "Xbox Series X"]);
  });

  test("[savePlatforms] aucune plateforme ne crée aucune liaison", async () => {
    const game = buildGame({ platforms: [] });
    const gameId = await saveGame(game);

    await savePlatforms(game, gameId);

    const [saved] = await getGamesBySource("rawg");
    expect(saved?.platforms).toEqual([]);
  });

  test("[savePlatforms] plateforme partagée entre deux jeux n'est créée qu'une fois", async () => {
    const gameA = buildGame({ sourceId: "1", platforms: ["PC"] });
    const gameB = buildGame({ sourceId: "2", platforms: ["PC"] });

    await savePlatforms(gameA, await saveGame(gameA));
    await savePlatforms(gameB, await saveGame(gameB));

    expect(await countPlatforms()).toBe(1);
  });

  test("[savePlatforms] rejouer la même liaison ne duplique rien (idempotent)", async () => {
    const game = buildGame({ platforms: ["PC"] });
    const gameId = await saveGame(game);

    await savePlatforms(game, gameId);
    await savePlatforms(game, gameId);

    const [saved] = await getGamesBySource("rawg");
    expect(saved?.platforms).toEqual(["PC"]);
  });
});

describe("countPlatforms", () => {
  test("[countPlatforms] base vide retourne 0", async () => {
    expect(await countPlatforms()).toBe(0);
  });

  test("[countPlatforms] compte les plateformes distinctes", async () => {
    const game = buildGame({ platforms: ["PC", "PlayStation 5", "Xbox Series X"] });
    await savePlatforms(game, await saveGame(game));

    expect(await countPlatforms()).toBe(3);
  });
});
