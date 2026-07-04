import { describe, expect, test } from "bun:test";
import { computePlatformOverlap, normalizePlatformName } from "./platform-normalizer";

describe("normalizePlatformName", () => {
  test("[normalizePlatformName] nom RAWG déjà canonique retourné tel quel", () => {
    expect(normalizePlatformName("PC")).toBe("PC");
  });

  test("[normalizePlatformName] nom IGDB traduit vers son équivalent RAWG", () => {
    expect(normalizePlatformName("PC (Microsoft Windows)")).toBe("PC");
  });

  test("[normalizePlatformName] plusieurs plateformes IGDB convergent vers la même clé RAWG", () => {
    expect(normalizePlatformName("Amiga")).toBe("Commodore / Amiga");
    expect(normalizePlatformName("Commodore VIC-20")).toBe("Commodore / Amiga");
  });

  test("[normalizePlatformName] macOS/Mac alignés", () => {
    expect(normalizePlatformName("Mac")).toBe("macOS");
  });

  test("[normalizePlatformName] nom inconnu retourné tel quel (pas d'exclusion silencieuse)", () => {
    expect(normalizePlatformName("Plateforme Inexistante")).toBe("Plateforme Inexistante");
  });
});

describe("computePlatformOverlap", () => {
  test("[computePlatformOverlap] plateformes identiques après normalisation → 1", () => {
    expect(computePlatformOverlap(["PC"], ["PC (Microsoft Windows)"])).toBe(1);
  });

  test("[computePlatformOverlap] aucune plateforme commune → 0", () => {
    expect(computePlatformOverlap(["PlayStation 5"], ["Xbox One"])).toBe(0);
  });

  test("[computePlatformOverlap] recouvrement partiel calculé en Jaccard", () => {
    expect(
      computePlatformOverlap(["PC", "PlayStation 5"], ["PC (Microsoft Windows)", "Xbox One"])
    ).toBeCloseTo(1 / 3);
  });

  test("[computePlatformOverlap] listes vides des deux côtés → 0 (pas de division par zéro)", () => {
    expect(computePlatformOverlap([], [])).toBe(0);
  });

  test("[computePlatformOverlap] une liste vide, l'autre non → 0", () => {
    expect(computePlatformOverlap([], ["PC"])).toBe(0);
  });
});
