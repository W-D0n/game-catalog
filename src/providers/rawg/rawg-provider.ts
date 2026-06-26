import type { Game } from "../../types/game";
import type { GameProvider } from "../provider";

const PAGE_SIZE = 40;
const DELAY_MS = 500;

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

    const response = await fetch(url);
    const data = (await response.json()) as RawgResponse;

    if (data.next === null) {
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
