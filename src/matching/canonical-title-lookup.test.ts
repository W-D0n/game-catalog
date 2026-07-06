import { describe, expect, test } from "bun:test";
import { buildCanonicalTitleIndex, matchTitleToCanonical } from "./canonical-title-lookup";
import type { CanonicalGameExport } from "../database/canonical-repository";

function buildCanonical(overrides: Partial<CanonicalGameExport>): CanonicalGameExport {
  return {
    id: "1",
    title: "Portal 2",
    releaseYear: 2011,
    releaseStatus: "Released",
    platforms: [],
    genres: [],
    companies: [],
    sources: [],
    relationships: [],
    media: null,
    ...overrides,
  };
}

describe("matchTitleToCanonical", () => {
  test("[matchTitleToCanonical] aucun candidat retourne matched=false", () => {
    const index = buildCanonicalTitleIndex([]);

    const result = matchTitleToCanonical(index, "Jeu Inconnu");

    expect(result).toEqual({ matched: false, canonicalGame: null, ambiguousCandidates: 0 });
  });

  test("[matchTitleToCanonical] un seul candidat, matched=true, ambiguousCandidates=0", () => {
    const game = buildCanonical({ id: "1", title: "Portal 2" });
    const index = buildCanonicalTitleIndex([game]);

    const result = matchTitleToCanonical(index, "Portal 2");

    expect(result).toEqual({ matched: true, canonicalGame: game, ambiguousCandidates: 0 });
  });

  test("[matchTitleToCanonical] plusieurs candidats, priorité au canonical avec plateforme PC", () => {
    const consoleGame = buildCanonical({ id: "1", title: "Chess", platforms: ["Nintendo Entertainment System"] });
    const pcGame = buildCanonical({ id: "2", title: "Chess", platforms: ["PC (Microsoft Windows)"] });
    const index = buildCanonicalTitleIndex([consoleGame, pcGame]);

    const result = matchTitleToCanonical(index, "Chess");

    expect(result.matched).toBe(true);
    expect(result.canonicalGame?.id).toBe("2");
    expect(result.ambiguousCandidates).toBe(1);
  });

  test("[matchTitleToCanonical] plusieurs candidats sans plateforme PC retient le premier", () => {
    const a = buildCanonical({ id: "1", title: "Chess", platforms: ["NES"] });
    const b = buildCanonical({ id: "2", title: "Chess", platforms: ["SNES"] });
    const index = buildCanonicalTitleIndex([a, b]);

    const result = matchTitleToCanonical(index, "Chess");

    expect(result.canonicalGame?.id).toBe("1");
    expect(result.ambiguousCandidates).toBe(1);
  });
});
