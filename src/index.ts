import { RawgProvider } from "./providers/rawg/rawg-provider";
import { importGames } from "./services/import-games";
import { exportJson } from "./exporters/export-json";
import { getGamesBySource } from "./database/game-repository";

const provider = new RawgProvider();
await importGames(provider, 999_999);

const games = await getGamesBySource(provider.name);

await exportJson("./exports/games.json", games);

console.log(`Export terminé : ${games.length} jeux au total.`);
