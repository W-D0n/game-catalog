import { db } from "../database/db";
import { savePlatforms } from "../database/platform-repository";
import { deduplicateGames } from "../deduplication/deduplicate-games";
import { ProviderQuotaError, type GameProvider } from "../providers/provider";
import type { Game } from "../types/game";

async function getLastPage(provider: string): Promise<number> {
  const [row] = await db<{ last_page: number }[]>`
    SELECT last_page FROM import_state WHERE provider = ${provider}
  `;
  return row?.last_page ?? 0;
}

async function saveLastPage(provider: string, page: number): Promise<void> {
  await db`
    INSERT INTO import_state (provider, last_page)
    VALUES (${provider}, ${page})
    ON CONFLICT (provider) DO UPDATE SET last_page = EXCLUDED.last_page
  `;
}

export async function importGames(
  provider: GameProvider,
  maxPages: number
): Promise<void> {
  const startPage = (await getLastPage(provider.name)) + 1;

  if (startPage > maxPages) {
    console.log(`${provider.name}: déjà importé jusqu'à la page ${maxPages}.`);
    return;
  }

  for (let page = startPage; page <= maxPages; page++) {
    console.log(`${provider.name}: import page ${page}/${maxPages}...`);

    let games: Game[];
    try {
      games = await provider.fetchPage(page);
    } catch (error) {
      if (error instanceof ProviderQuotaError) {
        console.log(
          `${provider.name}: quota épuisé — arrêt propre. Reprise à la page ${page} au prochain lancement.`
        );
        return;
      }
      throw error;
    }

    if (games.length === 0) {
      console.log(`${provider.name}: fin de la base atteinte à la page ${page}.`);
      break;
    }

    const uniqueGames = deduplicateGames(games);

    for (const game of uniqueGames) {
      const [row] = await db<{ id: bigint }[]>`
        INSERT INTO games (source, source_id, title, release_year, slug)
        VALUES (${game.source}, ${game.sourceId}, ${game.title}, ${game.releaseYear ?? null}, ${game.slug ?? null})
        ON CONFLICT (source, source_id) DO UPDATE SET title = EXCLUDED.title
        RETURNING id
      `;

      if (row !== undefined) {
        await savePlatforms(game, row.id);
      }
    }

    await saveLastPage(provider.name, page);
    console.log(`${provider.name}: page ${page} — ${uniqueGames.length} jeux sauvegardés.`);
  }
}
