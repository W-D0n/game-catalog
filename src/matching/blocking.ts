import { normalizeMatchingTitle } from "../normalizers/matching-title-normalizer";

const MIN_KEY_LENGTH = 3;

/**
 * Clé de blocking par titre normalisé. Retourne null pour les titres trop
 * courts après normalisation (clé dégénérée, ex: "!!!" — vue en calibrage
 * réel le 2026-07-04, ces clés collisionnent en masse entre jeux sans
 * rapport). Les jeux à clé null ne sont jamais groupés par titre seul.
 */
export function buildBlockingKey(title: string): string | null {
  const key = normalizeMatchingTitle(title);
  return key.length >= MIN_KEY_LENGTH ? key : null;
}

export interface BlockableGame {
  title: string;
}

/** Groupe des jeux par clé de blocking (titre normalisé). Ignore les clés dégénérées. */
export function groupByBlockingKey<T extends BlockableGame>(games: T[]): Map<string, T[]> {
  const blocks = new Map<string, T[]>();

  for (const game of games) {
    const key = buildBlockingKey(game.title);
    if (key === null) continue;

    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key)!.push(game);
  }

  return blocks;
}
