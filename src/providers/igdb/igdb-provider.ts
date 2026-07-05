import { z } from "zod";
import type { Game } from "../../types/game";
import { ProviderError, ProviderQuotaError, type GameProvider } from "../provider";
import { requireEnv } from "../../config";

const PAGE_SIZE = 500;
const DELAY_MS = 500;
const MAX_RETRIES = 5;

const IGDB_FIELDS = [
  "id",
  "slug",
  "name",
  "first_release_date",
  "platforms.name",
  "genres.name",
  "involved_companies.company.name",
  "involved_companies.developer",
  "involved_companies.publisher",
  "involved_companies.porting",
  "involved_companies.supporting",
  "game_type",
  "game_status",
  "parent_game",
  "version_parent",
].join(",");

const IgdbGameSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  first_release_date: z.number().optional(),
  platforms: z.array(z.object({ name: z.string() })).optional(),
  genres: z.array(z.object({ name: z.string() })).optional(),
  involved_companies: z
    .array(
      z.object({
        company: z.object({ name: z.string() }).optional(),
        developer: z.boolean().optional(),
        publisher: z.boolean().optional(),
        porting: z.boolean().optional(),
        supporting: z.boolean().optional(),
      })
    )
    .optional(),
  game_type: z.number().nullable().optional(),
  game_status: z.number().nullable().optional(),
  parent_game: z.number().nullable().optional(),
  version_parent: z.number().nullable().optional(),
});

const IgdbResponseSchema = z.array(IgdbGameSchema);

type IgdbGame = z.infer<typeof IgdbGameSchema>;

function backoffDelay(attempt: number): Promise<void> {
  const ms = 1000 * 2 ** (attempt - 1);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAccessToken(): Promise<string> {
  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", requireEnv("IGDB_CLIENT_ID"));
  url.searchParams.set("client_secret", requireEnv("IGDB_CLIENT_SECRET"));
  url.searchParams.set("grant_type", "client_credentials");

  const response = await fetch(url, { method: "POST" });

  if (!response.ok) {
    throw new ProviderError(
      "igdb",
      `Authentification Twitch échouée (HTTP ${response.status})`
    );
  }

  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

async function fetchPageWithRetry(
  token: string,
  offset: number,
  page: number
): Promise<IgdbGame[]> {
  let lastError = "inconnu";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": requireEnv("IGDB_CLIENT_ID"),
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: `fields ${IGDB_FIELDS}; sort id asc; limit ${PAGE_SIZE}; offset ${offset};`,
      });

      if (response.ok) {
        const body: unknown = await response.json();
        const parsed = IgdbResponseSchema.safeParse(body);

        if (!parsed.success) {
          throw new ProviderError(
            "igdb",
            `IGDB page ${page} : réponse invalide (${parsed.error.message})`
          );
        }

        return parsed.data;
      }

      if (response.status === 401) {
        throw new ProviderQuotaError(
          "igdb",
          `IGDB page ${page} : token invalide ou expiré (HTTP 401)`
        );
      }

      if (response.status !== 429 && response.status < 500) {
        throw new ProviderError(
          "igdb",
          `IGDB page ${page} : erreur permanente (HTTP ${response.status})`
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
    "igdb",
    `IGDB page ${page} : échec après ${MAX_RETRIES} tentatives (${lastError})`
  );
}

export class IgdbProvider implements GameProvider {
  readonly name = "igdb";
  private tokenPromise: Promise<string> | null = null;

  private getToken(): Promise<string> {
    this.tokenPromise ??= fetchAccessToken();
    return this.tokenPromise;
  }

  async fetchPage(page: number): Promise<Game[]> {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

    const token = await this.getToken();
    const offset = (page - 1) * PAGE_SIZE;
    const games = await fetchPageWithRetry(token, offset, page);

    return games.map((game) => ({
      source: "igdb",
      sourceId: String(game.id),
      title: game.name,
      releaseYear: game.first_release_date
        ? new Date(game.first_release_date * 1000).getUTCFullYear()
        : null,
      platforms: game.platforms?.map((p) => p.name) ?? [],
      slug: game.slug,
      rawMetadata: {
        genres: game.genres?.map((g) => g.name),
        companies: game.involved_companies
          ?.filter((ic) => ic.company !== undefined)
          .map((ic) => ({
            name: ic.company!.name,
            isDeveloper: ic.developer ?? false,
            isPublisher: ic.publisher ?? false,
            isPorting: ic.porting ?? false,
            isSupporting: ic.supporting ?? false,
          })),
        gameType: game.game_type ?? null,
        gameStatus: game.game_status ?? null,
        parentGame: game.parent_game ?? null,
        versionParent: game.version_parent ?? null,
      },
    }));
  }
}
