import type { Game } from "../../types/game";
import type { GameProvider } from "../provider";

const PAGE_SIZE = 40;
const DELAY_MS = 500;
const MAX_RETRIES = 5;

function backoffDelay(attempt: number): Promise<void> {
  const ms = 1000 * 2 ** (attempt - 1);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageWithRetry(url: URL, page: number): Promise<RawgResponse> {
  let lastError = "inconnu";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        await backoffDelay(attempt);
        continue;
      }

      return (await response.json()) as RawgResponse;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await backoffDelay(attempt);
    }
  }

  throw new Error(
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
