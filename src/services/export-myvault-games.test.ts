import { beforeEach, describe, expect, test } from "bun:test";
import { buildMyvaultGamesImport } from "./export-myvault-games";
import { saveOwnedGame } from "../database/owned-games-repository";
import { matchOwnedGames } from "./match-owned-games";
import { createCanonicalGamesBulk, linkGamesToCanonicalBulk, saveCanonicalGenresBulk, saveGenresBulk } from "../database/canonical-repository";
import { saveGame } from "../database/game-repository";
import { savePlatforms } from "../database/platform-repository";
import { resetDatabase } from "../database/test-helpers";
import type { Game } from "../types/game";
import { saveGameCredits } from "../database/rawg-credits-repository";

async function saveGameWithPlatforms(game: Game): Promise<bigint> {
  const gameId = await saveGame(game);
  await savePlatforms(game, gameId);
  return gameId;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("buildMyvaultGamesImport", () => {
  test("[buildMyvaultGamesImport] jeu possédé sur deux plateformes = une seule ligne avec deux PlatformLink", async () => {
    await saveOwnedGame("steam", "620", "Portal 2");
    await saveOwnedGame("gog", "gog_1207658991", "Portal 2");

    const game: Game = {
      source: "igdb",
      sourceId: "1",
      title: "Portal 2",
      releaseYear: 2011,
      platforms: ["PC (Microsoft Windows)"],
    };
    const gameId = await saveGameWithPlatforms(game);
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Portal 2", releaseYear: 2011, releaseStatus: "Released" },
    ]);
    await linkGamesToCanonicalBulk([{ gameId, canonicalId: canonicalId! }]);

    const genreId = (await saveGenresBulk(["Puzzle"])).get("Puzzle")!;
    await saveCanonicalGenresBulk([{ canonicalId: canonicalId!, genreId }]);

    await matchOwnedGames();

    const rows = await buildMyvaultGamesImport();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Portal 2");
    expect(rows[0]?.genre).toBe("Puzzle");
    expect(rows[0]?.genres).toEqual(["Puzzle"]);
    expect(rows[0]?.year).toBe(2011);
    expect(rows[0]?.archipelago).toBe(false);
    expect(rows[0]?.platforms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: "steam", externalId: "620" }),
        expect.objectContaining({ platform: "gog", externalId: "gog_1207658991" }),
      ])
    );
    expect(rows[0]?.platforms).toHaveLength(2);
  });

  test("[buildMyvaultGamesImport] jeu non matché reste sa propre ligne, titre brut", async () => {
    await saveOwnedGame("steam", "999", "Jeu Introuvable");

    await matchOwnedGames();

    const rows = await buildMyvaultGamesImport();

    expect(rows).toEqual([
      expect.objectContaining({
        title: "Jeu Introuvable",
        genre: null,
        year: null,
        archipelago: false,
        platforms: [expect.objectContaining({ platform: "steam", externalId: "999" })],
      }),
    ]);
  });

  test("[buildMyvaultGamesImport] deux jeux non matchés distincts = deux lignes distinctes", async () => {
    await saveOwnedGame("steam", "1", "Jeu A");
    await saveOwnedGame("gog", "gog_2", "Jeu B");

    await matchOwnedGames();

    const rows = await buildMyvaultGamesImport();

    expect(rows).toHaveLength(2);
  });

  test("[buildMyvaultGamesImport] exclut un ancien artefact Galaxy tiers sans refresh préalable", async () => {
    await saveOwnedGame("gog", "epic_Blowfish", "FTL: Faster Than Light");

    const rows = await buildMyvaultGamesImport();

    expect(rows).toEqual([]);
  });

  test("[buildMyvaultGamesImport] exporte l'équipe de développement RAWG du jeu canonique", async () => {
    await saveOwnedGame("steam", "1145360", "Hades");

    const gameId = await saveGameWithPlatforms({
      source: "rawg",
      sourceId: "3498",
      title: "Hades",
      releaseYear: 2020,
      platforms: ["PC"],
    });
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Hades", releaseYear: 2020, releaseStatus: "Released" },
    ]);
    await linkGamesToCanonicalBulk([{ gameId, canonicalId: canonicalId! }]);
    await saveGameCredits(gameId, [
      { id: 42, name: "Amir Rao", slug: "amir-rao" },
    ]);
    await matchOwnedGames();

    const [row] = await buildMyvaultGamesImport();

    expect(row?.people).toEqual([
      {
        source: "rawg",
        externalId: "42",
        name: "Amir Rao",
        slug: "amir-rao",
        role: "development_team",
      },
    ]);
  });

  test("[buildMyvaultGamesImport] base vide retourne []", async () => {
    expect(await buildMyvaultGamesImport()).toEqual([]);
  });
});
