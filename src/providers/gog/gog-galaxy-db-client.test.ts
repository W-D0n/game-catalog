import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync } from "node:fs";
import { fetchGogLibrary } from "./gog-galaxy-db-client";

function buildTestGalaxyDb(path: string, games: { releaseKey: string; title: string }[]): void {
  const db = new Database(path, { create: true });

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
}

describe("fetchGogLibrary", () => {
  const testDbPath = `${import.meta.dir}/gog-galaxy-db-client.test.sqlite`;

  afterEach(() => {
    try {
      unlinkSync(testDbPath);
    } catch {
      // fichier déjà absent — rien à nettoyer
    }
  });

  test("[fetchGogLibrary] lit les jeux depuis LibraryReleases + GamePieces (title)", () => {
    buildTestGalaxyDb(testDbPath, [
      { releaseKey: "gog_1359844055", title: "shapez" },
      { releaseKey: "gog_1139279216", title: "Jotun: Valhalla Edition" },
    ]);

    const games = fetchGogLibrary(testDbPath);

    expect(games).toEqual([
      { releaseKey: "gog_1359844055", title: "shapez" },
      { releaseKey: "gog_1139279216", title: "Jotun: Valhalla Edition" },
    ]);
  });

  test("[fetchGogLibrary] bibliothèque vide retourne []", () => {
    buildTestGalaxyDb(testDbPath, []);

    const games = fetchGogLibrary(testDbPath);

    expect(games).toEqual([]);
  });

  test("[fetchGogLibrary] ignore les jeux sans titre synchronisé (title: null)", () => {
    buildTestGalaxyDb(testDbPath, [{ releaseKey: "gog_1359844055", title: "shapez" }]);
    const db = new Database(testDbPath);
    db.run("INSERT INTO ReleaseKeys (key) VALUES (?)", ["epic_sans_titre"]);
    db.run("INSERT INTO LibraryReleases (releaseKey) VALUES (?)", ["epic_sans_titre"]);
    db.run("INSERT INTO GamePieces (releaseKey, gamePieceTypeId, value) VALUES (?, 182, ?)", [
      "epic_sans_titre",
      JSON.stringify({ title: null }),
    ]);
    db.close();

    const games = fetchGogLibrary(testDbPath);

    expect(games).toEqual([{ releaseKey: "gog_1359844055", title: "shapez" }]);
  });
});
