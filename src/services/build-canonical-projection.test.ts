import { beforeEach, describe, expect, test } from "bun:test";
import { buildCanonicalProjection } from "./build-canonical-projection";
import { saveGame } from "../database/game-repository";
import { savePlatforms } from "../database/platform-repository";
import { resetDatabase } from "../database/test-helpers";
import { db } from "../database/db";
import type { Game } from "../types/game";

async function saveGameWithPlatforms(game: Game): Promise<bigint> {
  const gameId = await saveGame(game);
  await savePlatforms(game, gameId);
  return gameId;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("buildCanonicalProjection", () => {
  test("[buildCanonicalProjection] même jeu RAWG+IGDB collapse en un seul canonical game", async () => {
    const rawgGame: Game = {
      source: "rawg",
      sourceId: "1",
      title: "The Witcher 3",
      releaseYear: 2015,
      platforms: ["PC"],
    };
    const igdbGame: Game = {
      source: "igdb",
      sourceId: "100",
      title: "The Witcher 3",
      releaseYear: 2015,
      platforms: ["PC (Microsoft Windows)"],
      rawMetadata: {
        genres: ["RPG"],
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
    };

    await saveGameWithPlatforms(rawgGame);
    await saveGameWithPlatforms(igdbGame);

    await buildCanonicalProjection();

    const canonicalGames = await db<{ id: string; title: string; release_status: string }[]>`
      SELECT id, title, release_status FROM canonical_games
    `;
    expect(canonicalGames).toHaveLength(1);
    expect(canonicalGames[0]?.release_status).toBe("Released");

    const linkedGames = await db<{ canonical_id: string }[]>`
      SELECT DISTINCT canonical_id FROM games
    `;
    expect(linkedGames).toHaveLength(1);

    const companies = await db<{ name: string; is_developer: boolean; is_publisher: boolean }[]>`
      SELECT c.name, gc.is_developer, gc.is_publisher
      FROM game_companies gc
      JOIN companies c ON c.id = gc.company_id
    `;
    expect(companies).toEqual([
      { name: "CD Projekt Red", is_developer: true, is_publisher: true },
    ]);

    const genres = await db<{ name: string }[]>`
      SELECT g.name FROM canonical_game_genres cgg JOIN genres g ON g.id = cgg.genre_id
    `;
    expect(genres).toEqual([{ name: "RPG" }]);
  });

  test("[buildCanonicalProjection] jeux non-matchés (plateformes disjointes) restent séparés", async () => {
    await saveGameWithPlatforms({
      source: "rawg",
      sourceId: "1",
      title: "Chess",
      releaseYear: 2020,
      platforms: ["PlayStation 5"],
    });
    await saveGameWithPlatforms({
      source: "igdb",
      sourceId: "2",
      title: "Chess",
      releaseYear: 2020,
      platforms: ["Xbox One"],
    });

    await buildCanonicalProjection();

    const canonicalGames = await db<{ id: string }[]>`SELECT id FROM canonical_games`;
    expect(canonicalGames).toHaveLength(2);
  });

  test("[buildCanonicalProjection] relation remake_of créée via parent_game", async () => {
    await saveGameWithPlatforms({
      source: "igdb",
      sourceId: "1",
      title: "Demon's Souls",
      releaseYear: 2009,
      platforms: ["PlayStation 3"],
      rawMetadata: {
        gameType: 0,
        gameStatus: 0,
        parentGame: null,
        versionParent: null,
      },
    });
    await saveGameWithPlatforms({
      source: "igdb",
      sourceId: "2",
      title: "Demon's Souls Remake",
      releaseYear: 2020,
      platforms: ["PlayStation 5"],
      rawMetadata: {
        gameType: 8,
        gameStatus: 0,
        parentGame: 1,
        versionParent: null,
      },
    });

    await buildCanonicalProjection();

    const relationships = await db<{ type: string }[]>`SELECT type FROM game_relationships`;
    expect(relationships).toEqual([{ type: "remake_of" }]);
  });
});
