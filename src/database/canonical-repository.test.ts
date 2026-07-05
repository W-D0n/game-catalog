import { beforeEach, describe, expect, test } from "bun:test";
import {
  createCanonicalGamesBulk,
  linkGamesToCanonicalBulk,
  saveCanonicalGenresBulk,
  saveCompaniesBulk,
  saveGameCompaniesBulk,
  saveGameRelationshipsBulk,
  saveGenresBulk,
} from "./canonical-repository";
import { saveGame } from "./game-repository";
import { resetDatabase } from "./test-helpers";
import { db } from "./db";
import type { Game } from "../types/game";

function buildGame(overrides: Partial<Game>): Game {
  return {
    source: "rawg",
    sourceId: "3498",
    title: "Grand Theft Auto V",
    releaseYear: 2013,
    platforms: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("createCanonicalGamesBulk / linkGamesToCanonicalBulk", () => {
  test("[createCanonicalGamesBulk] insertion nominale retourne les ids dans l'ordre", async () => {
    const ids = await createCanonicalGamesBulk([
      { title: "The Witcher 3", releaseYear: 2015, releaseStatus: "Released" },
      { title: "GTA V", releaseYear: 2013, releaseStatus: null },
    ]);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeGreaterThan(0n);
    expect(ids[1]).toBeGreaterThan(ids[0]!);
  });

  test("[createCanonicalGamesBulk] tableau vide retourne []", async () => {
    expect(await createCanonicalGamesBulk([])).toEqual([]);
  });

  test("[linkGamesToCanonicalBulk] met à jour games.canonical_id pour plusieurs jeux", async () => {
    const gameIdA = await saveGame(buildGame({ sourceId: "1" }));
    const gameIdB = await saveGame(buildGame({ sourceId: "2" }));
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "GTA V", releaseYear: 2013, releaseStatus: null },
    ]);

    await linkGamesToCanonicalBulk([
      { gameId: gameIdA, canonicalId: canonicalId! },
      { gameId: gameIdB, canonicalId: canonicalId! },
    ]);

    const rows = await db<{ canonical_id: string }[]>`
      SELECT canonical_id FROM games WHERE id IN (${gameIdA}, ${gameIdB})
    `;
    expect(rows.every((row) => BigInt(row.canonical_id) === canonicalId)).toBe(true);
  });

  test("[linkGamesToCanonicalBulk] tableau vide ne fait rien", async () => {
    await expect(linkGamesToCanonicalBulk([])).resolves.toBeUndefined();
  });
});

describe("saveCompaniesBulk / saveGameCompaniesBulk", () => {
  test("[saveCompaniesBulk] insertion nominale, retourne la map nom -> id", async () => {
    const map = await saveCompaniesBulk(["CD Projekt Red", "GOG"]);

    expect(map.size).toBe(2);
    expect(map.get("CD Projekt Red")).toBeGreaterThan(0n);
  });

  test("[saveCompaniesBulk] même nom fait un upsert, pas un doublon", async () => {
    const map1 = await saveCompaniesBulk(["CD Projekt Red"]);
    const map2 = await saveCompaniesBulk(["CD Projekt Red"]);

    expect(map1.get("CD Projekt Red")).toBe(map2.get("CD Projekt Red")!);
  });

  test("[saveGameCompaniesBulk] insertion nominale et relecture", async () => {
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "The Witcher 3", releaseYear: 2015, releaseStatus: null },
    ]);
    const companyId = (await saveCompaniesBulk(["CD Projekt Red"])).get("CD Projekt Red")!;

    await saveGameCompaniesBulk([
      {
        canonicalId: canonicalId!,
        companyId,
        name: "CD Projekt Red",
        isDeveloper: true,
        isPublisher: false,
        isPorting: false,
        isSupporting: false,
      },
    ]);

    const [row] = await db<
      { is_developer: boolean; is_publisher: boolean }[]
    >`SELECT is_developer, is_publisher FROM game_companies WHERE canonical_id = ${canonicalId} AND company_id = ${companyId}`;

    expect(row).toEqual({ is_developer: true, is_publisher: false });
  });

  test("[saveGameCompaniesBulk] upsert fusionne les rôles en OR", async () => {
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "The Witcher 3", releaseYear: 2015, releaseStatus: null },
    ]);
    const companyId = (await saveCompaniesBulk(["CD Projekt Red"])).get("CD Projekt Red")!;

    await saveGameCompaniesBulk([
      {
        canonicalId: canonicalId!,
        companyId,
        name: "CD Projekt Red",
        isDeveloper: true,
        isPublisher: false,
        isPorting: false,
        isSupporting: false,
      },
    ]);
    await saveGameCompaniesBulk([
      {
        canonicalId: canonicalId!,
        companyId,
        name: "CD Projekt Red",
        isDeveloper: false,
        isPublisher: true,
        isPorting: false,
        isSupporting: false,
      },
    ]);

    const [row] = await db<
      { is_developer: boolean; is_publisher: boolean }[]
    >`SELECT is_developer, is_publisher FROM game_companies WHERE canonical_id = ${canonicalId} AND company_id = ${companyId}`;

    expect(row).toEqual({ is_developer: true, is_publisher: true });
  });
});

describe("saveGenresBulk / saveCanonicalGenresBulk", () => {
  test("[saveCanonicalGenresBulk] insertion nominale, idempotente", async () => {
    const [canonicalId] = await createCanonicalGamesBulk([
      { title: "The Witcher 3", releaseYear: 2015, releaseStatus: null },
    ]);
    const genreId = (await saveGenresBulk(["RPG"])).get("RPG")!;

    await saveCanonicalGenresBulk([{ canonicalId: canonicalId!, genreId }]);
    await saveCanonicalGenresBulk([{ canonicalId: canonicalId!, genreId }]);

    const rows = await db<{ genre_id: string }[]>`
      SELECT genre_id FROM canonical_game_genres WHERE canonical_id = ${canonicalId}
    `;
    expect(rows).toHaveLength(1);
  });
});

describe("saveGameRelationshipsBulk", () => {
  test("[saveGameRelationshipsBulk] insertion nominale, idempotente", async () => {
    const [fromId, toId] = await createCanonicalGamesBulk([
      { title: "Demon's Souls", releaseYear: 2020, releaseStatus: null },
      { title: "Demon's Souls", releaseYear: 2009, releaseStatus: null },
    ]);

    await saveGameRelationshipsBulk([{ fromCanonicalId: fromId!, toCanonicalId: toId!, type: "remake_of" }]);
    await saveGameRelationshipsBulk([{ fromCanonicalId: fromId!, toCanonicalId: toId!, type: "remake_of" }]);

    const rows = await db<{ type: string }[]>`
      SELECT type FROM game_relationships WHERE from_canonical_id = ${fromId} AND to_canonical_id = ${toId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("remake_of");
  });

  test("[saveGameRelationshipsBulk] rejette une auto-référence via la contrainte DB", async () => {
    const [id] = await createCanonicalGamesBulk([
      { title: "Solo Game", releaseYear: 2020, releaseStatus: null },
    ]);

    let thrown: unknown;
    try {
      await saveGameRelationshipsBulk([{ fromCanonicalId: id!, toCanonicalId: id!, type: "parent" }]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("no_self_reference");
  });
});
