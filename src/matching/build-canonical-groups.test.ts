import { describe, expect, test } from "bun:test";
import { buildCanonicalGroups, type MatchableIdentity } from "./build-canonical-groups";

function buildGame(overrides: Partial<MatchableIdentity>): MatchableIdentity {
  return {
    id: 1n,
    source: "rawg",
    sourceId: "1",
    title: "The Witcher 3",
    releaseYear: 2015,
    platforms: ["PC"],
    ...overrides,
  };
}

describe("buildCanonicalGroups", () => {
  test("[buildCanonicalGroups] jeu unique forme son propre groupe", () => {
    const groups = buildCanonicalGroups([buildGame({ id: 1n })]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(1);
  });

  test("[buildCanonicalGroups] deux jeux qui matchent (merge) fusionnent en un groupe", () => {
    const games = [
      buildGame({ id: 1n, source: "rawg", releaseYear: 2015, platforms: ["PC"] }),
      buildGame({ id: 2n, source: "igdb", releaseYear: 2015, platforms: ["PC (Microsoft Windows)"] }),
    ];

    const groups = buildCanonicalGroups(games);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  test("[buildCanonicalGroups] deux jeux en pending_review restent des groupes séparés", () => {
    const games = [
      buildGame({ id: 1n, source: "rawg", releaseYear: 2015, platforms: ["PlayStation 5"] }),
      buildGame({ id: 2n, source: "igdb", releaseYear: 2015, platforms: ["Xbox One"] }),
    ];

    const groups = buildCanonicalGroups(games);

    expect(groups).toHaveLength(2);
  });

  test("[buildCanonicalGroups] titres différents ne sont jamais comparés", () => {
    const games = [
      buildGame({ id: 1n, title: "Portal" }),
      buildGame({ id: 2n, title: "Portal 2" }),
    ];

    const groups = buildCanonicalGroups(games);

    expect(groups).toHaveLength(2);
  });

  test("[buildCanonicalGroups] transitivité : A~B et B~C fusionnent A, B et C ensemble", () => {
    const games = [
      buildGame({ id: 1n, releaseYear: 2015, platforms: ["PC"] }),
      buildGame({ id: 2n, releaseYear: 2015, platforms: ["PC"] }),
      buildGame({ id: 3n, releaseYear: 2016, platforms: ["PC"] }),
    ];

    const groups = buildCanonicalGroups(games);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  test("[buildCanonicalGroups] édition GOTY de la même source collapse avec le jeu de base", () => {
    const games = [
      buildGame({
        id: 1n,
        title: "The Witcher 3: Wild Hunt",
        releaseYear: 2015,
        platforms: ["PC"],
      }),
      buildGame({
        id: 2n,
        title: "The Witcher 3: Wild Hunt - Game of the Year Edition",
        releaseYear: 2016,
        platforms: ["PC"],
      }),
    ];

    const groups = buildCanonicalGroups(games);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  test("[buildCanonicalGroups] tableau vide retourne []", () => {
    expect(buildCanonicalGroups([])).toEqual([]);
  });

  test("[buildCanonicalGroups] groupe surdimensionné (> 200) n'est jamais fusionné", () => {
    const games = Array.from({ length: 201 }, (_, i) =>
      buildGame({ id: BigInt(i + 1), releaseYear: 2015, platforms: ["PC"] })
    );

    const groups = buildCanonicalGroups(games);

    expect(groups).toHaveLength(201);
  });
});
