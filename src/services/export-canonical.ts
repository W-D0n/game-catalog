import { getCanonicalGamesForExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";

/** Exporte la projection canonique complète (jeux dédupliqués, sociétés, genres, relations, provenance). */
export async function exportCanonical(): Promise<void> {
  const games = await getCanonicalGamesForExport();
  await exportJson("./exports/canonical-games.json", games);
  console.log(`Export canonique terminé : ${games.length} jeux.`);
}
