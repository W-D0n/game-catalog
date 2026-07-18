import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync } from "node:fs";
import { exportGogLibrary } from "./export-gog-library";
import { createCanonicalGamesBulk, linkGamesToCanonicalBulk } from "../database/canonical-repository";
import { saveGame } from "../database/game-repository";
import { savePlatforms } from "../database/platform-repository";
import { saveOwnedGame } from "../database/owned-games-repository";
import { resetDatabase } from "../database/test-helpers";
import type { Game } from "../types/game";

async function saveGameWithPlatforms(game: Game): Promise<bigint> {
  const gameId = await saveGame(game);
  await savePlatforms(game, gameId);
  return gameId;
}

const testDbPath = `${import.meta.dir}/export-gog-library.test.sqlite`;
const originalDbPathEnv = process.env.GOG_GALAXY_DB_PATH;

function buildTestGalaxyDb(games: { releaseKey: string; title: string }[]): void {
  const db = new Database(testDbPath, { create: true });

  db.run("CREATE TABLE ReleaseKeys (key TEXT PRIMARY KEY)");
  db.run("CREATE TABLE LibraryReleases (id INTEGER PRIMARY KEY, releaseKey TEXT NOT NULL)");
  db.run("CREATE TABLE GamePieceTypes (id INTEGER PRIMARY KEY, type TEXT NOT NULL)");
  db.run("CREATE TABLE GamePieces (releaseKey TEXT NOT NULL, gamePieceTypeId INTEGER NOT NULL, value TEXT NOT NULL)");
  db.run("INSERT INTO GamePieceTypes (id, type) VALUES (182, 'title')");

  for (const game of games) {
    db.run("INSERT INTO ReleaseKeys (key) VALUES (?)", [game.releaseKey]);
    db.run("INSERT INTO LibraryReleases (releaseKey) VALUES (?)", [game.releaseKey]);
    db.run("INSERT INTO GamePieces (releaseKey, gamePieceTypeId, value) VALUES (?, 182, ?)", [
      game.releaseKey,
      JSON.stringify({ title: game.title }),
    ]);
  }

  db.close();
  process.env.GOG_GALAXY_DB_PATH = testDbPath;
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  process.env.GOG_GALAXY_DB_PATH = originalDbPathEnv;
  try {
    unlinkSync(testDbPath);
  } catch {
    // fichier déjà absent — rien à nettoyer
  }
});

describe("exportGogLibrary", () => {
  test("[exportGogLibrary] jeu GOG matché avec le catalogue canonique", async () => {
    buildTestGalaxyDb([{ releaseKey: "gog_1139279216", title: "Jotun: Valhalla Edition" }]);

    const game: Game = {
      source: "igdb",
      sourceId: "1",
      title: "Jotun: Valhalla Edition",
      releaseYear: 2018,
      platforms: ["PC (Microsoft Windows)"],
    };
    const gameId = await saveGameWithPlatforms(game);
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "Jotun: Valhalla Edition", releaseYear: 2018, releaseStatus: "Released" },
    ]);
    await linkGamesToCanonicalBulk([{ gameId, canonicalId: canonicalId! }]);

    await exportGogLibrary();

    const fs = await import("node:fs/promises");
    const exported = JSON.parse(await fs.readFile("./exports/gog-library-enriched.json", "utf-8"));

    expect(exported).toEqual([
      {
        releaseKey: "gog_1139279216",
        gogTitle: "Jotun: Valhalla Edition",
        matched: true,
        ambiguousCandidates: 0,
        canonicalGame: expect.objectContaining({ title: "Jotun: Valhalla Edition" }),
      },
    ]);
  });

  test("[exportGogLibrary] jeu GOG absent du catalogue reste non matché", async () => {
    buildTestGalaxyDb([{ releaseKey: "gog_999", title: "Jeu Inconnu Introuvable" }]);

    await exportGogLibrary();

    const fs = await import("node:fs/promises");
    const exported = JSON.parse(await fs.readFile("./exports/gog-library-enriched.json", "utf-8"));

    expect(exported).toEqual([
      {
        releaseKey: "gog_999",
        gogTitle: "Jeu Inconnu Introuvable",
        matched: false,
        ambiguousCandidates: 0,
        canonicalGame: null,
      },
    ]);
  });

  test("[exportGogLibrary] purge les anciennes entrées tierces Galaxy du snapshot GOG", async () => {
    buildTestGalaxyDb([
      { releaseKey: "gog_1139279216", title: "Jotun: Valhalla Edition" },
      { releaseKey: "epic_Blowfish", title: "FTL: Faster Than Light" },
    ]);
    await saveOwnedGame("gog", "epic_Blowfish", "FTL: Faster Than Light");

    await exportGogLibrary();

    const fs = await import("node:fs/promises");
    const exported = JSON.parse(await fs.readFile("./exports/gog-library-enriched.json", "utf-8"));

    expect(exported).toEqual([
      {
        releaseKey: "gog_1139279216",
        gogTitle: "Jotun: Valhalla Edition",
        matched: false,
        ambiguousCandidates: 0,
        canonicalGame: null,
      },
    ]);
  });
});
