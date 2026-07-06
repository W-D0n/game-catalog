import { IgdbProvider } from "../providers/igdb/igdb-provider";
import { importGames } from "./import-games";
import { getLastUpdateCheck, saveLastUpdateCheck } from "../database/import-state-repository";
import { saveGame, resetCanonicalLinkBulk } from "../database/game-repository";
import { savePlatforms } from "../database/platform-repository";
import { ProviderQuotaError } from "../providers/provider";

const PROVIDER = "igdb";

/**
 * Sweep incrémental IGDB (voir docs/specs/catalog-update-pipeline.md) :
 * (1) nouveaux jeux — réutilise `importGames`/`fetchPage` tel quel, aucun
 * nouveau code (le curseur d'id capte déjà tout nouvel id publié) ;
 * (2) jeux modifiés — `fetchUpdatedSince`, remet leur `canonical_id` à NULL
 * pour forcer leur ré-enrichissement par build-canonical-projection.ts.
 *
 * `last_update_check` n'avance que si le sweep des jeux modifiés se termine
 * sans erreur — un échec préserve la progression, comme le pattern retry
 * existant pour le backfill.
 */
export async function runIgdbUpdateSweep(maxNewGamesIterations: number): Promise<void> {
  const provider = new IgdbProvider();

  console.log("igdb sweep : récupération des nouveaux jeux...");
  await importGames(provider, maxNewGamesIterations);

  const since = await getLastUpdateCheck(PROVIDER);
  const sweepStartedAt = Math.floor(Date.now() / 1000);

  console.log(`igdb sweep : recherche des jeux modifiés depuis ${since ?? "jamais (premier sweep)"}...`);

  let lastSeenId = 0;
  let totalUpdated = 0;

  for (;;) {
    let result;
    try {
      result = await provider.fetchUpdatedSince(since ?? 0, lastSeenId);
    } catch (error) {
      if (error instanceof ProviderQuotaError) {
        console.log("igdb sweep : quota épuisé — arrêt propre, last_update_check non avancé.");
        return;
      }
      throw error;
    }

    if (result.games.length === 0) break;

    const gameIds: bigint[] = [];
    for (const game of result.games) {
      const gameId = await saveGame(game);
      await savePlatforms(game, gameId);
      gameIds.push(gameId);
    }
    await resetCanonicalLinkBulk(gameIds);

    totalUpdated += result.games.length;
    lastSeenId = result.nextCursor;
    console.log(`igdb sweep : ${result.games.length} jeux modifiés traités (curseur ${lastSeenId}).`);
  }

  await saveLastUpdateCheck(PROVIDER, sweepStartedAt);
  console.log(`igdb sweep terminé : ${totalUpdated} jeux modifiés détectés et ré-enrichis.`);
}
