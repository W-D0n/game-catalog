import { describe, expect, test } from "bun:test";
import { normalizeTitle } from "./game-normalizer";

describe("normalizeTitle", () => {
  test("[normalizeTitle] titre nominal supprime espaces et casse", () => {
    expect(normalizeTitle("The Witcher 3")).toBe("thewitcher3");
  });

  test("[normalizeTitle] espaces de bord supprimés", () => {
    expect(normalizeTitle("  Portal 2  ")).toBe("portal2");
  });

  test("[normalizeTitle] ponctuation et deux-points retirés", () => {
    expect(normalizeTitle("Counter-Strike: Global Offensive")).toBe(
      "counterstrikeglobaloffensive"
    );
  });

  test("[normalizeTitle] chiffres conservés", () => {
    expect(normalizeTitle("Half-Life 2")).toBe("halflife2");
  });

  test("[normalizeTitle] chaîne vide retourne vide", () => {
    expect(normalizeTitle("")).toBe("");
  });

  test("[normalizeTitle] titre uniquement symboles retourne vide", () => {
    expect(normalizeTitle("!!! ??? ...")).toBe("");
  });

  test("[normalizeTitle] accents non normalisés sont retirés (limite connue)", () => {
    expect(normalizeTitle("Pokémon")).toBe("pokmon");
  });
});
