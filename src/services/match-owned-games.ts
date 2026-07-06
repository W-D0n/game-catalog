import { getUnmatchedOwnedGames, linkOwnedGamesToCanonicalBulk } from "../database/owned-games-repository";
import { getCanonicalGamesForExport } from "../database/canonical-repository";
import { buildCanonicalTitleIndex, matchTitleToCanonical } from "../matching/canonical-title-lookup";

/**
 * Lie les jeux possédés (`owned_games`) à leur canonical game par titre
 * normalisé, une fois pour toutes — incrémental, ne retraite jamais un jeu
 * déjà lié (`canonical_id IS NULL` uniquement), comme
 * `build-canonical-projection.ts` pour le catalogue principal. Remplace le
 * recalcul en mémoire fait auparavant à chaque export.
 */
export async function matchOwnedGames(): Promise<void> {
  const unmatched = await getUnmatchedOwnedGames();

  if (unmatched.length === 0) {
    console.log("Aucun jeu possédé à matcher.");
    return;
  }

  const canonicalGames = await getCanonicalGamesForExport();
  const titleIndex = buildCanonicalTitleIndex(canonicalGames);

  const links = [];
  for (const owned of unmatched) {
    const result = matchTitleToCanonical(titleIndex, owned.rawTitle);
    if (result.matched && result.canonicalGame) {
      links.push({ ownedGameId: owned.id, canonicalId: BigInt(result.canonicalGame.id) });
    }
  }

  await linkOwnedGamesToCanonicalBulk(links);

  console.log(
    `Matching bibliothèque possédée : ${links.length}/${unmatched.length} jeux liés à un canonical game.`
  );
}
