import { describe, expect, test } from "bun:test";
import { deduplicateGames } from "./deduplicate-games";
import type { Game } from "../types/game";

function buildGame(overrides: Partial<Game>): Game {
  return {
    source: "rawg",
    sourceId: "1",
    title: "The Witcher 3",
    releaseYear: 2015,
    platforms: ["PC"],
    slug: "the-witcher-3",
    ...overrides,
  };
}

describe("deduplicateGames", () => {
  test("[deduplicateGames] tableau vide retourne vide", () => {
    expect(deduplicateGames([])).toEqual([]);
  });

  test("[deduplicateGames] même titre normalisé et même année fusionnés", () => {
    const games = [
      buildGame({ sourceId: "1", title: "The Witcher 3", releaseYear: 2015 }),
      buildGame({ sourceId: "2", title: "the witcher 3", releaseYear: 2015 }),
    ];

    expect(deduplicateGames(games)).toHaveLength(1);
  });

  test("[deduplicateGames] première occurrence conservée", () => {
    const games = [
      buildGame({ sourceId: "first", title: "Portal", releaseYear: 2007 }),
      buildGame({ sourceId: "second", title: "Portal", releaseYear: 2007 }),
    ];

    const result = deduplicateGames(games);

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceId).toBe("first");
  });

  test("[deduplicateGames] même titre années différentes non fusionnés", () => {
    const games = [
      buildGame({ sourceId: "1", title: "Demon's Souls", releaseYear: 2009 }),
      buildGame({ sourceId: "2", title: "Demon's Souls", releaseYear: 2020 }),
    ];

    expect(deduplicateGames(games)).toHaveLength(2);
  });

  test("[deduplicateGames] titres différents non fusionnés", () => {
    const games = [
      buildGame({ sourceId: "1", title: "Portal", releaseYear: 2007 }),
      buildGame({ sourceId: "2", title: "Portal 2", releaseYear: 2011 }),
    ];

    expect(deduplicateGames(games)).toHaveLength(2);
  });

  test("[deduplicateGames] années null même titre fusionnées (bucket unknown)", () => {
    const games = [
      buildGame({ sourceId: "1", title: "Unreleased Game", releaseYear: null }),
      buildGame({ sourceId: "2", title: "Unreleased Game", releaseYear: null }),
    ];

    expect(deduplicateGames(games)).toHaveLength(1);
  });

  test("[deduplicateGames] année null distincte d'une année connue", () => {
    const games = [
      buildGame({ sourceId: "1", title: "Some Game", releaseYear: null }),
      buildGame({ sourceId: "2", title: "Some Game", releaseYear: 2020 }),
    ];

    expect(deduplicateGames(games)).toHaveLength(2);
  });

  test("[deduplicateGames] entrée non mutée", () => {
    const games = [
      buildGame({ sourceId: "1", title: "Portal", releaseYear: 2007 }),
      buildGame({ sourceId: "2", title: "Portal", releaseYear: 2007 }),
    ];

    deduplicateGames(games);

    expect(games).toHaveLength(2);
  });
});
