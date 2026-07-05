import { beforeEach, describe, expect, test } from "bun:test";
import { countGames, getGamesBySource, saveGame } from "./game-repository";
import { savePlatforms } from "./platform-repository";
import { resetDatabase } from "./test-helpers";
import { db } from "./db";
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

describe("saveGame", () => {
  test("[saveGame] insertion nominale retourne un id", async () => {
    const id = await saveGame(buildGame({}));

    expect(id).toBeGreaterThan(0n);
  });

  test("[saveGame] même (source, source_id) fait un upsert, pas un doublon", async () => {
    await saveGame(buildGame({ title: "Grand Theft Auto V" }));
    await saveGame(buildGame({ title: "GTA V (retitré)" }));

    const count = await countGames();

    expect(count).toBe(1);
  });

  test("[saveGame] upsert rafraîchit le titre", async () => {
    await saveGame(buildGame({ title: "Ancien titre" }));
    await saveGame(buildGame({ title: "Nouveau titre" }));

    const [game] = await getGamesBySource("rawg");

    expect(game?.title).toBe("Nouveau titre");
  });

  test("[saveGame] releaseYear et slug null acceptés", async () => {
    const id = await saveGame(
      buildGame({ releaseYear: null, slug: null, sourceId: "999" })
    );

    expect(id).toBeGreaterThan(0n);
  });

  test("[saveGame] rawMetadata absent n'empêche pas la sauvegarde", async () => {
    const id = await saveGame(buildGame({ sourceId: "1000" }));

    expect(id).toBeGreaterThan(0n);
  });

  test("[saveGame] rawMetadata persisté et relu tel quel", async () => {
    await saveGame(
      buildGame({
        source: "igdb",
        sourceId: "1942",
        rawMetadata: {
          genres: ["RPG", "Adventure"],
          companies: [
            {
              name: "CD Projekt Red",
              isDeveloper: true,
              isPublisher: true,
              isPorting: false,
              isSupporting: false,
            },
          ],
          gameType: 0,
          gameStatus: 0,
          parentGame: null,
          versionParent: null,
        },
      })
    );

    const [game] = await getGamesBySource("igdb");

    expect(game?.rawMetadata).toEqual({
      genres: ["RPG", "Adventure"],
      companies: [
        {
          name: "CD Projekt Red",
          isDeveloper: true,
          isPublisher: true,
          isPorting: false,
          isSupporting: false,
        },
      ],
      gameType: 0,
      gameStatus: 0,
      parentGame: null,
      versionParent: null,
    });
  });

  test("[saveGame] raw_metadata est un objet jsonb natif, extractible via ->> (pas une chaîne JSON doublement encodée)", async () => {
    await saveGame(
      buildGame({
        source: "igdb",
        sourceId: "1942",
        rawMetadata: { coverUrl: "https://images.igdb.com/x.jpg" },
      })
    );

    const [row] = await db<{ cover: string | null }[]>`
      SELECT raw_metadata->>'coverUrl' AS cover FROM games WHERE source = 'igdb' AND source_id = '1942'
    `;

    expect(row?.cover).toBe("https://images.igdb.com/x.jpg");
  });

  test("[saveGame] même titre, sources différentes ne collisionnent pas", async () => {
    await saveGame(buildGame({ source: "rawg", sourceId: "1" }));
    await saveGame(buildGame({ source: "igdb", sourceId: "1" }));

    const count = await countGames();

    expect(count).toBe(2);
  });
});

describe("getGamesBySource", () => {
  test("[getGamesBySource] source inconnue retourne []", async () => {
    const games = await getGamesBySource("mobygames");

    expect(games).toEqual([]);
  });

  test("[getGamesBySource] inclut les plateformes liées", async () => {
    const gameId = await saveGame(
      buildGame({ platforms: ["PC", "PlayStation 5"] })
    );
    await savePlatforms(buildGame({ platforms: ["PC", "PlayStation 5"] }), gameId);

    const [game] = await getGamesBySource("rawg");

    expect(game?.platforms.sort()).toEqual(["PC", "PlayStation 5"]);
  });

  test("[getGamesBySource] jeu sans plateforme retourne un tableau vide", async () => {
    await saveGame(buildGame({}));

    const [game] = await getGamesBySource("rawg");

    expect(game?.platforms).toEqual([]);
  });

  test("[getGamesBySource] ne retourne que la source demandée", async () => {
    await saveGame(buildGame({ source: "rawg", sourceId: "1" }));
    await saveGame(buildGame({ source: "igdb", sourceId: "2" }));

    const rawgGames = await getGamesBySource("rawg");

    expect(rawgGames).toHaveLength(1);
    expect(rawgGames[0]?.source).toBe("rawg");
  });

  test("[getGamesBySource] trié par titre", async () => {
    await saveGame(buildGame({ sourceId: "1", title: "Zelda" }));
    await saveGame(buildGame({ sourceId: "2", title: "Astro Bot" }));

    const games = await getGamesBySource("rawg");

    expect(games.map((g) => g.title)).toEqual(["Astro Bot", "Zelda"]);
  });
});

describe("countGames", () => {
  test("[countGames] base vide retourne 0", async () => {
    expect(await countGames()).toBe(0);
  });

  test("[countGames] compte toutes sources confondues", async () => {
    await saveGame(buildGame({ source: "rawg", sourceId: "1" }));
    await saveGame(buildGame({ source: "igdb", sourceId: "2" }));

    expect(await countGames()).toBe(2);
  });
});
