import { RawgProvider } from "./providers/rawg/rawg-provider";
import { importGames } from "./services/import-games";
import { exportJson } from "./exporters/export-json";
import { db } from "./database/db";
import type { Game } from "./types/game";

const provider = new RawgProvider();
await importGames(provider, 999_999);

const games = await db<Game[]>`
  SELECT source, source_id AS "sourceId", title, release_year AS "releaseYear", slug
  FROM games
  WHERE source = 'rawg'
  ORDER BY title
`;

await exportJson("./exports/games.json", games);

console.log(`Export terminé : ${games.length} jeux au total.`);
