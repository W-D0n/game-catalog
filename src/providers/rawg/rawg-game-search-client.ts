import { z } from "zod";
import { requireEnv } from "../../config";
import { normalizeMatchingTitle } from "../../normalizers/matching-title-normalizer";
import { ProviderError, ProviderQuotaError } from "../provider";
import { isRetriableStatus } from "./rawg-provider";
import type { Game } from "../../types/game";

const MAX_RETRIES = 5;

const RawgSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      slug: z.string(),
      name: z.string(),
      released: z.string().nullable(),
      platforms: z
        .array(z.object({ platform: z.object({ name: z.string() }) }))
        .optional(),
      background_image: z.string().nullable().optional(),
      short_screenshots: z.array(z.object({ image: z.string() })).optional(),
    })
  ),
});

function backoffDelay(attempt: number): Promise<void> {
  const ms = 1000 * 2 ** (attempt - 1);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Recherche RAWG bornée à un titre possédé, sans parcourir le catalogue complet. */
export async function searchRawgGameByTitle(
  title: string,
  releaseYear: number | null
): Promise<Game | null> {
  const url = new URL("https://api.rawg.io/api/games");
  url.searchParams.set("key", requireEnv("RAWG_API_KEY"));
  url.searchParams.set("search", title);
  url.searchParams.set("search_exact", "true");
  url.searchParams.set("page_size", "40");

  let lastError = "inconnu";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body: unknown = await response.json();
        const parsed = RawgSearchResponseSchema.safeParse(body);
        if (!parsed.success) {
          throw new ProviderError(
            "rawg",
            `recherche \"${title}\" : réponse invalide (${parsed.error.message})`
          );
        }

        const normalizedTitle = normalizeMatchingTitle(title);
        const exactTitleMatches = parsed.data.results.filter(
          (game) => normalizeMatchingTitle(game.name) === normalizedTitle
        );
        const eligibleMatches =
          releaseYear === null
            ? exactTitleMatches
            : exactTitleMatches.filter(
                (game) =>
                  game.released !== null &&
                  Number(game.released.slice(0, 4)) === releaseYear
              );
        if (eligibleMatches.length !== 1) return null;
        const [match] = eligibleMatches;
        if (match === undefined) return null;

        return {
          source: "rawg",
          sourceId: String(match.id),
          title: match.name,
          releaseYear: match.released ? Number(match.released.slice(0, 4)) : null,
          platforms: match.platforms?.map((entry) => entry.platform.name) ?? [],
          slug: match.slug,
          rawMetadata: {
            coverUrl: match.background_image ?? null,
            screenshotUrls: match.short_screenshots?.map((screenshot) => screenshot.image),
          },
        };
      }

      if (response.status === 401) {
        throw new ProviderQuotaError(
          "rawg",
          `recherche \"${title}\" : authentification ou quota (HTTP 401)`
        );
      }
      if (response.status === 403 || response.status === 429) {
        throw new ProviderQuotaError(
          "rawg",
          `recherche \"${title}\" : quota épuisé ou accès refusé (HTTP ${response.status})`
        );
      }
      if (!isRetriableStatus(response.status)) {
        throw new ProviderError(
          "rawg",
          `recherche \"${title}\" : erreur permanente (HTTP ${response.status})`
        );
      }

      lastError = `HTTP ${response.status}`;
      if (attempt < MAX_RETRIES) await backoffDelay(attempt);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_RETRIES) await backoffDelay(attempt);
    }
  }

  throw new ProviderError(
    "rawg",
    `recherche \"${title}\" : échec après ${MAX_RETRIES} tentatives (${lastError})`
  );
}
