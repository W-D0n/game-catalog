import { describe, expect, test } from "bun:test";
import { decideMatch, type MatchableGame } from "./decide-match";

function buildGame(overrides: Partial<MatchableGame>): MatchableGame {
  return {
    title: "The Witcher 3",
    releaseYear: 2015,
    platforms: ["PC"],
    ...overrides,
  };
}

describe("decideMatch", () => {
  test("[decideMatch] année exacte + recouvrement plateforme → merge", () => {
    const result = decideMatch(
      buildGame({ releaseYear: 2015, platforms: ["PC"] }),
      buildGame({ releaseYear: 2015, platforms: ["PC (Microsoft Windows)"] })
    );

    expect(result.decision).toBe("merge");
    expect(result.yearDiff).toBe(0);
  });

  test("[decideMatch] année ±1 + recouvrement plateforme → merge", () => {
    const result = decideMatch(
      buildGame({ releaseYear: 2015, platforms: ["PC"] }),
      buildGame({ releaseYear: 2016, platforms: ["PC (Microsoft Windows)"] })
    );

    expect(result.decision).toBe("merge");
    expect(result.yearDiff).toBe(1);
  });

  test("[decideMatch] année absente d'un côté → pending_review", () => {
    const result = decideMatch(
      buildGame({ releaseYear: 2015, platforms: ["PC"] }),
      buildGame({ releaseYear: null, platforms: ["PC (Microsoft Windows)"] })
    );

    expect(result.decision).toBe("pending_review");
    expect(result.yearDiff).toBeNull();
  });

  test("[decideMatch] aucun recouvrement de plateformes → pending_review", () => {
    const result = decideMatch(
      buildGame({ releaseYear: 2015, platforms: ["PlayStation 5"] }),
      buildGame({ releaseYear: 2015, platforms: ["Xbox One"] })
    );

    expect(result.decision).toBe("pending_review");
    expect(result.platformOverlap).toBe(0);
  });

  test("[decideMatch] écart d'année > 1 an → pending_review (remake potentiel)", () => {
    const result = decideMatch(
      buildGame({ releaseYear: 2009, platforms: ["PlayStation 3"] }),
      buildGame({ releaseYear: 2020, platforms: ["PlayStation 3"] })
    );

    expect(result.decision).toBe("pending_review");
    expect(result.yearDiff).toBe(11);
  });

  test("[decideMatch] listes de plateformes vides des deux côtés → pending_review", () => {
    const result = decideMatch(
      buildGame({ releaseYear: 2015, platforms: [] }),
      buildGame({ releaseYear: 2015, platforms: [] })
    );

    expect(result.decision).toBe("pending_review");
    expect(result.platformOverlap).toBe(0);
  });
});
