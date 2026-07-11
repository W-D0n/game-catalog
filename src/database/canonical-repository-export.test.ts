import { beforeEach, describe, expect, test } from "bun:test";
import {
  createCanonicalGamesBulk,
  getCanonicalGamesForExport,
  linkGamesToCanonicalBulk,
  saveCanonicalGenresBulk,
  saveCompaniesBulk,
  saveGameCompaniesBulk,
  saveGameRelationshipsBulk,
  saveGenresBulk,
} from "./canonical-repository";
import { saveArchipelagoGame, linkArchipelagoGamesToCanonicalBulk } from "./archipelago-games-repository";
import { saveGame } from "./game-repository";
import { savePlatforms } from "./platform-repository";
import { resetDatabase } from "./test-helpers";
import { db } from "./db";
import type { Game } from "../types/game";

beforeEach(async () => {
  await resetDatabase();
});

describe("getCanonicalGamesForExport", () => {
  test("[getCanonicalGamesForExport] base vide retourne []", async () => {
    expect(await getCanonicalGamesForExport()).toEqual([]);
  });

  test("[getCanonicalGamesForExport] jeu sans société/genre/relation a des tableaux vides", async () => {
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Solo Game", releaseYear: 2020, releaseStatus: "Released" },
    ]);
    const game: Game = {
      source: "igdb",
      sourceId: "1",
      title: "Solo Game",
      releaseYear: 2020,
      platforms: ["PC"],
    };
    const gameId = await saveGame(game);
    await savePlatforms(game, gameId);
    await linkGamesToCanonicalBulk([{ gameId, canonicalId: canonicalId! }]);

    const [exported] = await getCanonicalGamesForExport();

    expect(exported?.title).toBe("Solo Game");
    expect(exported?.platforms).toEqual(["PC"]);
    expect(exported?.genres).toEqual([]);
    expect(exported?.companies).toEqual([]);
    expect(exported?.relationships).toEqual([]);
    expect(exported?.sources).toEqual([{ source: "igdb", sourceId: "1", title: "Solo Game" }]);
    expect(exported?.archipelago).toBe(false);
  });

  test("[getCanonicalGamesForExport] archipelago: true si le canonical game est lié à archipelago_games", async () => {
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Celeste", releaseYear: 2018, releaseStatus: "Released" },
    ]);
    await saveArchipelagoGame("official", "Celeste");
    const [row] = await db<{ id: string }[]>`
      SELECT id FROM archipelago_games WHERE raw_title = 'Celeste'
    `;
    await linkArchipelagoGamesToCanonicalBulk([
      { archipelagoGameId: BigInt(row!.id), canonicalId: canonicalId! },
    ]);

    const [exported] = await getCanonicalGamesForExport();

    expect(exported?.archipelago).toBe(true);
  });

  test("[getCanonicalGamesForExport] jeu complet avec société, genre et relation", async () => {
    const [fromId, toId] = await createCanonicalGamesBulk([
      { title: "Demon's Souls Remake", releaseYear: 2020, releaseStatus: "Released" },
      { title: "Demon's Souls", releaseYear: 2009, releaseStatus: "Released" },
    ]);

    const companyId = (await saveCompaniesBulk(["Bluepoint Games"])).get("Bluepoint Games")!;
    await saveGameCompaniesBulk([
      {
        canonicalId: fromId!,
        companyId,
        name: "Bluepoint Games",
        isDeveloper: true,
        isPublisher: false,
        isPorting: false,
        isSupporting: false,
      },
    ]);

    const genreId = (await saveGenresBulk(["Action RPG"])).get("Action RPG")!;
    await saveCanonicalGenresBulk([{ canonicalId: fromId!, genreId }]);

    await saveGameRelationshipsBulk([
      { fromCanonicalId: fromId!, toCanonicalId: toId!, type: "remake_of" },
    ]);

    const exported = await getCanonicalGamesForExport();
    const remake = exported.find((g) => g.title === "Demon's Souls Remake");

    expect(remake?.companies).toEqual([
      {
        name: "Bluepoint Games",
        isDeveloper: true,
        isPublisher: false,
        isPorting: false,
        isSupporting: false,
      },
    ]);
    expect(remake?.genres).toEqual(["Action RPG"]);
    expect(remake?.relationships).toEqual([
      { type: "remake_of", toId: toId!.toString(), toTitle: "Demon's Souls" },
    ]);
  });
});
