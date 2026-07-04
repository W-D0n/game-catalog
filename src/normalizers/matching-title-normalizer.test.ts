import { describe, expect, test } from "bun:test";
import { normalizeMatchingTitle } from "./matching-title-normalizer";

describe("normalizeMatchingTitle", () => {
  test("[normalizeMatchingTitle] lowercase et trim", () => {
    expect(normalizeMatchingTitle("  Half-Life 2  ")).toBe("half-life 2");
  });

  test("[normalizeMatchingTitle] ponctuation conservée (contrairement à normalizeTitle)", () => {
    expect(normalizeMatchingTitle("Half-Life 2")).toBe("half-life 2");
  });

  test("[normalizeMatchingTitle] diacritiques supprimés", () => {
    expect(normalizeMatchingTitle("Pokémon")).toBe("pokemon");
  });

  test("[normalizeMatchingTitle] symboles ™ et ® supprimés", () => {
    expect(normalizeMatchingTitle("Cyberpunk 2077™")).toBe("cyberpunk 2077");
    expect(normalizeMatchingTitle("Diablo®")).toBe("diablo");
  });

  test("[normalizeMatchingTitle] suffixe Game of the Year Edition retiré", () => {
    expect(normalizeMatchingTitle("The Witcher 3: Game of the Year Edition")).toBe(
      "the witcher 3"
    );
  });

  test("[normalizeMatchingTitle] suffixe GOTY retiré", () => {
    expect(normalizeMatchingTitle("Fallout 4 GOTY")).toBe("fallout 4");
  });

  test("[normalizeMatchingTitle] suffixe Definitive Edition retiré", () => {
    expect(normalizeMatchingTitle("Divinity: Original Sin 2 - Definitive Edition")).toBe(
      "divinity: original sin 2"
    );
  });

  test("[normalizeMatchingTitle] suffixe Remastered retiré", () => {
    expect(normalizeMatchingTitle("Dark Souls Remastered")).toBe("dark souls");
  });

  test("[normalizeMatchingTitle] sous-titre après deux-points préservé", () => {
    expect(normalizeMatchingTitle("Final Fantasy VII: Remake")).toBe(
      "final fantasy vii: remake"
    );
  });

  test("[normalizeMatchingTitle] titre vide retourne vide", () => {
    expect(normalizeMatchingTitle("")).toBe("");
  });

  test("[normalizeMatchingTitle] espaces multiples collassés", () => {
    expect(normalizeMatchingTitle("Half-Life    2")).toBe("half-life 2");
  });
});
