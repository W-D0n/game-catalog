import {
  getUnmatchedArchipelagoGames,
  linkArchipelagoGamesToCanonicalBulk,
} from "../database/archipelago-games-repository";
import { getCanonicalGamesForExport } from "../database/canonical-repository";
import { buildCanonicalTitleIndex, matchTitleToCanonical } from "../matching/canonical-title-lookup";

/**
 * Lie les jeux Archipelago (`archipelago_games`) à leur canonical game par
 * titre normalisé — incrémental, ne retraite jamais un jeu déjà lié
 * (`canonical_id IS NULL` uniquement), même principe que `matchOwnedGames`.
 */
export async function matchArchipelagoGames(): Promise<void> {
  const unmatched = await getUnmatchedArchipelagoGames();

  if (unmatched.length === 0) {
    console.log("Aucun jeu Archipelago à matcher.");
    return;
  }

  const canonicalGames = await getCanonicalGamesForExport();
  const titleIndex = buildCanonicalTitleIndex(canonicalGames);

  const links = [];
  for (const archipelagoGame of unmatched) {
    const result = matchTitleToCanonical(titleIndex, archipelagoGame.rawTitle);
    if (result.matched && result.canonicalGame) {
      links.push({ archipelagoGameId: archipelagoGame.id, canonicalId: BigInt(result.canonicalGame.id) });
    }
  }

  await linkArchipelagoGamesToCanonicalBulk(links);

  console.log(
    `Matching Archipelago : ${links.length}/${unmatched.length} jeux liés à un canonical game.`
  );
}
