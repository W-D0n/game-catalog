import { z } from "zod";
import {
  ProviderError,
  ProviderQuotaError,
  type FetchPageResult,
  type GameProvider,
} from "../provider";
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
  "cover.url",
  "screenshots.url",
  "videos.video_id",
  "summary",
  "storyline",
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
  cover: z.object({ url: z.string() }).optional(),
  screenshots: z.array(z.object({ url: z.string() })).optional(),
  videos: z.array(z.object({ video_id: z.string() })).optional(),
  summary: z.string().optional(),
  storyline: z.string().optional(),
});

const IgdbResponseSchema = z.array(IgdbGameSchema);

type IgdbGame = z.infer<typeof IgdbGameSchema>;

/**
 * IGDB renvoie des URLs d'image relatives au protocole, taille "t_thumb" par
 * défaut (`//images.igdb.com/igdb/image/upload/t_thumb/co1wyy.jpg`) — trop
 * petite pour un affichage catalogue. On force le protocole et la taille.
 */
function toIgdbImageUrl(url: string, size: string): string {
  const withProtocol = url.startsWith("//") ? `https:${url}` : url;
  return withProtocol.replace(/\/t_[a-z0-9_]+\//, `/${size}/`);
}

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

/**
 * Pagination par curseur d'id (`where id > lastId`), pas offset/limit.
 * offset/limit suppose que le tri "id asc" est stable entre deux requêtes —
 * faux sur IGDB, base communautaire modifiée en continu : une suppression
 * survenue avant l'offset courant décale silencieusement toutes les lignes
 * suivantes d'un cran, sautant des jeux sans jamais lever d'erreur (bug
 * confirmé le 2026-07-05, voir docs/inbox.md). `where id > lastId` est
 * immunisé par construction contre ce décalage : peu importe ce qui change
 * avant lastId, tout ce qui a un id strictement supérieur reste inclus.
 */
async function fetchPageWithRetry(
  token: string,
  whereClause: string,
  attemptLabel: string
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
        body: `fields ${IGDB_FIELDS}; ${whereClause}; sort id asc; limit ${PAGE_SIZE};`,
      });

      if (response.ok) {
        const body: unknown = await response.json();
        const parsed = IgdbResponseSchema.safeParse(body);

        if (!parsed.success) {
          throw new ProviderError(
            "igdb",
            `IGDB ${attemptLabel} : réponse invalide (${parsed.error.message})`
          );
        }

        return parsed.data;
      }

      if (response.status === 401) {
        throw new ProviderQuotaError(
          "igdb",
          `IGDB ${attemptLabel} : token invalide ou expiré (HTTP 401)`
        );
      }

      if (response.status !== 429 && response.status < 500) {
        throw new ProviderError(
          "igdb",
          `IGDB ${attemptLabel} : erreur permanente (HTTP ${response.status})`
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
    `IGDB ${attemptLabel} : échec après ${MAX_RETRIES} tentatives (${lastError})`
  );
}

function mapIgdbGames(games: IgdbGame[]): FetchPageResult["games"] {
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
      coverUrl: game.cover ? toIgdbImageUrl(game.cover.url, "t_cover_big") : null,
      screenshotUrls: game.screenshots?.map((s) => toIgdbImageUrl(s.url, "t_screenshot_big")),
      videoIds: game.videos?.map((v) => v.video_id),
      summary: game.summary ?? null,
      storyline: game.storyline ?? null,
    },
  }));
}

export class IgdbProvider implements GameProvider {
  readonly name = "igdb";
  private tokenPromise: Promise<string> | null = null;

  private getToken(): Promise<string> {
    this.tokenPromise ??= fetchAccessToken();
    return this.tokenPromise;
  }

  /** `cursor` = dernier id IGDB vu (0 = aucun) — fetch tout ce qui a un id strictement supérieur. */
  async fetchPage(cursor: number): Promise<FetchPageResult> {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

    const token = await this.getToken();
    const games = await fetchPageWithRetry(token, `where id > ${cursor}`, `curseur ${cursor}`);

    if (games.length === 0) {
      return { games: [], nextCursor: cursor };
    }

    const nextCursor = Math.max(...games.map((g) => g.id));
    return { games: mapIgdbGames(games), nextCursor };
  }

  /**
   * Jeux modifiés côté IGDB depuis `sinceTimestamp` (unix seconds), paginés
   * par id (`lastSeenId`) — voir docs/specs/catalog-update-pipeline.md.
   * Distinct de `fetchPage` : capte les jeux déjà connus dont les métadonnées
   * ont changé, pas les nouveaux jeux (déjà couverts par `fetchPage`).
   */
  async fetchUpdatedSince(sinceTimestamp: number, lastSeenId: number): Promise<FetchPageResult> {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

    const token = await this.getToken();
    const whereClause = `where updated_at > ${sinceTimestamp} & id > ${lastSeenId}`;
    const games = await fetchPageWithRetry(token, whereClause, `sweep depuis ${sinceTimestamp}, curseur ${lastSeenId}`);

    if (games.length === 0) {
      return { games: [], nextCursor: lastSeenId };
    }

    const nextCursor = Math.max(...games.map((g) => g.id));
    return { games: mapIgdbGames(games), nextCursor };
  }
}
