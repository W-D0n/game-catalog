import { describe, expect, test } from "bun:test";
import { normalizePlatformName } from "./platform-normalizer";

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
