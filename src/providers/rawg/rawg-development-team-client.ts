import { z } from "zod";
import { ProviderError, ProviderQuotaError } from "../provider";
import { isRetriableStatus } from "./rawg-provider";
import { requireEnv } from "../../config";

const MAX_RETRIES = 5;

const RawgPersonSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().optional(),
});

const RawgDevelopmentTeamResponseSchema = z.object({
  results: z.array(RawgPersonSchema),
});

export interface RawgPerson {
  id: number;
  name: string;
  slug: string | null;
}

function backoffDelay(attempt: number): Promise<void> {
  const ms = 1000 * 2 ** (attempt - 1);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Crédits individuels d'un jeu RAWG (development-team) — des personnes, pas
 * des studios. Non vérifié en conditions réelles : quota RAWG épuisé au
 * moment de l'écriture, forme déduite du schéma OpenAPI officiel.
 */
export async function fetchDevelopmentTeam(rawgGameId: string): Promise<RawgPerson[]> {
  const url = new URL(
    `https://api.rawg.io/api/games/${rawgGameId}/development-team`
  );
  url.searchParams.set("key", requireEnv("RAWG_API_KEY"));

  let lastError = "inconnu";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        const body: unknown = await response.json();
        const parsed = RawgDevelopmentTeamResponseSchema.safeParse(body);

        if (!parsed.success) {
          throw new ProviderError(
            "rawg",
            `development-team ${rawgGameId} : réponse invalide (${parsed.error.message})`
          );
        }

        return parsed.data.results.map((person) => ({
          id: person.id,
          name: person.name,
          slug: person.slug ?? null,
        }));
      }

      if (response.status === 401 || response.status === 403) {
        throw new ProviderQuotaError(
          "rawg",
          `development-team ${rawgGameId} : clé invalide ou quota épuisé (HTTP ${response.status})`
        );
      }

      if (!isRetriableStatus(response.status)) {
        throw new ProviderError(
          "rawg",
          `development-team ${rawgGameId} : erreur permanente (HTTP ${response.status})`
        );
      }

      lastError = `HTTP ${response.status}`;
      await backoffDelay(attempt);
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      lastError = error instanceof Error ? error.message : String(error);
      await backoffDelay(attempt);
    }
  }

  throw new ProviderError(
    "rawg",
    `development-team ${rawgGameId} : échec après ${MAX_RETRIES} tentatives (${lastError})`
  );
}
