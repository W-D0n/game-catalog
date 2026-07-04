import { beforeEach, describe, expect, test } from "bun:test";
import {
  createCanonicalGame,
  linkGameToCanonical,
  saveCanonicalGenre,
  saveCompany,
  saveGameCompany,
  saveGameRelationship,
  saveGenre,
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

describe("createCanonicalGame / linkGameToCanonical", () => {
  test("[createCanonicalGame] insertion nominale retourne un id", async () => {
    const id = await createCanonicalGame({
      title: "The Witcher 3",
      releaseYear: 2015,
      releaseStatus: "Released",
    });

    expect(id).toBeGreaterThan(0n);
  });

  test("[linkGameToCanonical] met à jour games.canonical_id", async () => {
    const gameId = await saveGame(buildGame({}));
    const canonicalId = await createCanonicalGame({
      title: "GTA V",
      releaseYear: 2013,
      releaseStatus: null,
    });

    await linkGameToCanonical(gameId, canonicalId);

    const [row] = await db<{ canonical_id: string }[]>`
      SELECT canonical_id FROM games WHERE id = ${gameId}
    `;
    expect(BigInt(row!.canonical_id)).toBe(canonicalId);
  });
});

describe("saveCompany / saveGameCompany", () => {
  test("[saveGameCompany] insertion nominale et relecture", async () => {
    const canonicalId = await createCanonicalGame({
      title: "The Witcher 3",
      releaseYear: 2015,
      releaseStatus: null,
    });
    const companyId = await saveCompany("CD Projekt Red");

    await saveGameCompany(canonicalId, companyId, {
      name: "CD Projekt Red",
      isDeveloper: true,
      isPublisher: false,
      isPorting: false,
      isSupporting: false,
    });

    const [row] = await db<
      { is_developer: boolean; is_publisher: boolean }[]
    >`SELECT is_developer, is_publisher FROM game_companies WHERE canonical_id = ${canonicalId} AND company_id = ${companyId}`;

    expect(row).toEqual({ is_developer: true, is_publisher: false });
  });

  test("[saveGameCompany] upsert fusionne les rôles en OR", async () => {
    const canonicalId = await createCanonicalGame({
      title: "The Witcher 3",
      releaseYear: 2015,
      releaseStatus: null,
    });
    const companyId = await saveCompany("CD Projekt Red");

    await saveGameCompany(canonicalId, companyId, {
      name: "CD Projekt Red",
      isDeveloper: true,
      isPublisher: false,
      isPorting: false,
      isSupporting: false,
    });
    await saveGameCompany(canonicalId, companyId, {
      name: "CD Projekt Red",
      isDeveloper: false,
      isPublisher: true,
      isPorting: false,
      isSupporting: false,
    });

    const [row] = await db<
      { is_developer: boolean; is_publisher: boolean }[]
    >`SELECT is_developer, is_publisher FROM game_companies WHERE canonical_id = ${canonicalId} AND company_id = ${companyId}`;

    expect(row).toEqual({ is_developer: true, is_publisher: true });
  });

  test("[saveCompany] même nom fait un upsert, pas un doublon", async () => {
    const id1 = await saveCompany("CD Projekt Red");
    const id2 = await saveCompany("CD Projekt Red");

    expect(id1).toBe(id2);
  });
});

describe("saveGenre / saveCanonicalGenre", () => {
  test("[saveCanonicalGenre] insertion nominale, idempotente", async () => {
    const canonicalId = await createCanonicalGame({
      title: "The Witcher 3",
      releaseYear: 2015,
      releaseStatus: null,
    });
    const genreId = await saveGenre("RPG");

    await saveCanonicalGenre(canonicalId, genreId);
    await saveCanonicalGenre(canonicalId, genreId);

    const rows = await db<{ genre_id: string }[]>`
      SELECT genre_id FROM canonical_game_genres WHERE canonical_id = ${canonicalId}
    `;
    expect(rows).toHaveLength(1);
  });
});

describe("saveGameRelationship", () => {
  test("[saveGameRelationship] insertion nominale, idempotente", async () => {
    const fromId = await createCanonicalGame({
      title: "Demon's Souls",
      releaseYear: 2020,
      releaseStatus: null,
    });
    const toId = await createCanonicalGame({
      title: "Demon's Souls",
      releaseYear: 2009,
      releaseStatus: null,
    });

    await saveGameRelationship(fromId, toId, "remake_of");
    await saveGameRelationship(fromId, toId, "remake_of");

    const rows = await db<{ type: string }[]>`
      SELECT type FROM game_relationships WHERE from_canonical_id = ${fromId} AND to_canonical_id = ${toId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("remake_of");
  });
});
