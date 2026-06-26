import type { Game } from "../../types/game";
import { ProviderError, ProviderQuotaError, type GameProvider } from "../provider";

const PAGE_SIZE = 40;
const DELAY_MS = 500;
const MAX_RETRIES = 5;

/** Un statut transitoire vaut la peine d'être retenté ; un 4xx (hors 429) non. */
export function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffDelay(attempt: number): Promise<void> {
  const ms = 1000 * 2 ** (attempt - 1);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageWithRetry(url: URL, page: number): Promise<RawgResponse> {
  let lastError = "inconnu";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return (await response.json()) as RawgResponse;
      }

      if (response.status === 401 || response.status === 403) {
        throw new ProviderQuotaError(
          "rawg",
          `RAWG page ${page} : clé invalide ou quota épuisé (HTTP ${response.status})`
        );
      }

      if (!isRetriableStatus(response.status)) {
        throw new ProviderError(
          "rawg",
          `RAWG page ${page} : erreur permanente (HTTP ${response.status})`
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
    `RAWG page ${page} : échec après ${MAX_RETRIES} tentatives (${lastError})`
  );
}

interface RawgGame {
  id: number;
  slug: string;
  name: string;
  released: string | null;
  platforms?: {
    platform: {
      name: string;
    };
  }[];
}

interface RawgResponse {
  next: string | null;
  results: RawgGame[];
}

export class RawgProvider implements GameProvider {
  readonly name = "rawg";

  async fetchPage(page: number): Promise<Game[]> {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

    const url = new URL("https://api.rawg.io/api/games");
    url.searchParams.set("key", process.env.RAWG_API_KEY!);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(PAGE_SIZE));

    const data = await fetchPageWithRetry(url, page);

    if (data.results.length === 0) {
      return [];
    }

    return data.results.map((game) => ({
      source: "rawg",
      sourceId: String(game.id),
      title: game.name,
      releaseYear: game.released ? Number(game.released.slice(0, 4)) : null,
      platforms: game.platforms?.map((p) => p.platform.name) ?? [],
      slug: game.slug,
      rawData: game,
    }));
  }
}
