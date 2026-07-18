import { saveGame } from "../database/game-repository";
import { fetchDevelopmentTeam } from "../providers/rawg/rawg-development-team-client";
import {
  getRawgCanonicalIdBySourceId,
  getOwnedLinkedRawgGames,
  getOwnedRawgEnrichmentCandidates,
  getRawgEnrichmentStates,
  markRawgGameNotFound,
  saveRawgCreditsAndMarkCompleted,
} from "../database/rawg-enrichment-repository";
import { ProviderError, ProviderQuotaError } from "../providers/provider";
import { searchRawgGameByTitle } from "../providers/rawg/rawg-game-search-client";
import type { Game } from "../types/game";
import type { RawgPerson } from "../providers/rawg/rawg-development-team-client";
import { linkGamesToCanonicalBulk } from "../database/canonical-repository";
import { savePlatforms } from "../database/platform-repository";

const DELAY_MS = 500;

export interface RawgEnrichmentClient {
  searchGameByTitle(title: string, releaseYear: number | null): Promise<Game | null>;
  fetchDevelopmentTeam(rawgGameId: string): Promise<RawgPerson[]>;
}

export interface RawgEnrichmentOptions {
  delayMs?: number;
}

export interface RawgEnrichmentSummary {
  candidates: number;
  enriched: number;
  alreadyEnriched: number;
  notFound: number;
  alreadySearched: number;
}

const defaultClient: RawgEnrichmentClient = {
  searchGameByTitle: searchRawgGameByTitle,
  fetchDevelopmentTeam,
};

/**
 * Enrichit les jeux réellement possédés avec leurs crédits RAWG individuels.
 * Chaque titre canonique possédé provoque au plus une recherche ciblée : le
 * catalogue RAWG complet n'est jamais parcouru.
 */
export async function enrichRawgLibrary(
  client: RawgEnrichmentClient = defaultClient,
  options: RawgEnrichmentOptions = {}
): Promise<RawgEnrichmentSummary> {
  const candidates = await getOwnedRawgEnrichmentCandidates();
  const rawgGames = await getOwnedLinkedRawgGames();
  const rawgByCanonicalId = new Map(
    rawgGames.flatMap((game) =>
      game.canonicalId === null ? [] : [[game.canonicalId.toString(), game] as const]
    )
  );
  const enrichmentStates = await getRawgEnrichmentStates();
  const summary: RawgEnrichmentSummary = {
    candidates: candidates.length,
    enriched: 0,
    alreadyEnriched: 0,
    notFound: 0,
    alreadySearched: 0,
  };

  for (const [index, candidate] of candidates.entries()) {
    const state = enrichmentStates.get(candidate.id);
    if (state === "completed") {
      summary.alreadyEnriched += 1;
      continue;
    }
    if (state === "not_found") {
      summary.alreadySearched += 1;
      continue;
    }

    let rawgGame = rawgByCanonicalId.get(candidate.id);

    console.log(`[${index + 1}/${candidates.length}] ${candidate.title}...`);

    try {
      if (!rawgGame) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? DELAY_MS));
        const found = await client.searchGameByTitle(
          candidate.title,
          candidate.releaseYear
        );
        if (!found) {
          await markRawgGameNotFound(BigInt(candidate.id));
          enrichmentStates.set(candidate.id, "not_found");
          summary.notFound += 1;
          console.log("  aucun match RAWG exact.");
          continue;
        }
        const persistedCanonicalId = await getRawgCanonicalIdBySourceId(found.sourceId);
        if (
          persistedCanonicalId !== undefined &&
          persistedCanonicalId !== null &&
          persistedCanonicalId.toString() !== candidate.id
        ) {
          throw new ProviderError(
            "rawg",
            `rawg:${found.sourceId} est déjà lié au canonical ${persistedCanonicalId.toString()}, pas ${candidate.id}`
          );
        }
        const gameId = await saveGame(found);
        await savePlatforms(found, gameId);
        if (persistedCanonicalId === undefined || persistedCanonicalId === null) {
          await linkGamesToCanonicalBulk([
            { gameId, canonicalId: BigInt(candidate.id) },
          ]);
        }
        rawgGame = {
          id: gameId,
          source: "rawg",
          sourceId: found.sourceId,
          title: found.title,
          releaseYear: found.releaseYear,
          platforms: found.platforms,
          rawMetadata: found.rawMetadata,
          canonicalId: BigInt(candidate.id),
        };
        rawgByCanonicalId.set(candidate.id, rawgGame);
      }

      await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? DELAY_MS));
      const people = await client.fetchDevelopmentTeam(rawgGame.sourceId);
      await saveRawgCreditsAndMarkCompleted(
        BigInt(candidate.id),
        rawgGame.id,
        people
      );
      enrichmentStates.set(candidate.id, "completed");
      summary.enriched += 1;
      console.log(`  ${people.length} crédit(s) sauvegardé(s).`);
    } catch (error) {
      if (error instanceof ProviderQuotaError) {
        console.log(`  quota épuisé — arrêt propre à "${candidate.title}".`);
        return summary;
      }
      throw error;
    }
  }

  console.log(
    `Enrichissement terminé : ${summary.enriched} enrichi(s), ${summary.alreadyEnriched} déjà fait(s), ${summary.notFound} introuvable(s), ${summary.alreadySearched} recherche(s) déjà conclue(s).`
  );
  return summary;
}
