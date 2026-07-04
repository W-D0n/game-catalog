import { RawgProvider } from "./providers/rawg/rawg-provider";
import { IgdbProvider } from "./providers/igdb/igdb-provider";
import { importGames } from "./services/import-games";
import { exportJson } from "./exporters/export-json";
import { getGamesBySource } from "./database/game-repository";
import type { GameProvider } from "./providers/provider";

async function importAndExport(provider: GameProvider): Promise<void> {
  await importGames(provider, 999_999);

  const games = await getGamesBySource(provider.name);
  await exportJson(`./exports/games-${provider.name}.json`, games);

  console.log(`Export ${provider.name} terminé : ${games.length} jeux.`);
}

await importAndExport(new RawgProvider());
await importAndExport(new IgdbProvider());
