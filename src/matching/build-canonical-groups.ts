import { groupByBlockingKey } from "./blocking";
import { decideMatch, type MatchableGame } from "./decide-match";
import type { SourceGameMetadata } from "../types/game";

export interface MatchableIdentity extends MatchableGame {
  id: bigint;
  source: string;
  sourceId: string;
  rawMetadata?: SourceGameMetadata;
}

function find(parent: Map<bigint, bigint>, x: bigint): bigint {
  let root = x;
  while (parent.get(root) !== root) {
    root = parent.get(root)!;
  }

  while (parent.get(x) !== root) {
    const next = parent.get(x)!;
    parent.set(x, root);
    x = next;
  }

  return root;
}

function union(parent: Map<bigint, bigint>, a: bigint, b: bigint): void {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA !== rootB) {
    parent.set(rootA, rootB);
  }
}

/**
 * Regroupe les source games en groupes canoniques : blocking par titre exact
 * normalisé, puis union-find sur les paires décidées `merge` par decideMatch.
 * Fonction pure, aucune écriture DB.
 */
export function buildCanonicalGroups(games: MatchableIdentity[]): MatchableIdentity[][] {
  const parent = new Map<bigint, bigint>();
  for (const game of games) {
    parent.set(game.id, game.id);
  }

  const blocks = groupByBlockingKey(games);
  for (const blockGames of blocks.values()) {
    for (let i = 0; i < blockGames.length; i++) {
      for (let j = i + 1; j < blockGames.length; j++) {
        const a = blockGames[i]!;
        const b = blockGames[j]!;
        const result = decideMatch(a, b);
        if (result.decision === "merge") {
          union(parent, a.id, b.id);
        }
      }
    }
  }

  const groups = new Map<bigint, MatchableIdentity[]>();
  for (const game of games) {
    const root = find(parent, game.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(game);
  }

  return [...groups.values()];
}
