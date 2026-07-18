import { Database } from "bun:sqlite";
import type { OwnedGamesClient } from "../owned-games-client";

const DEFAULT_DB_PATH = "C:/ProgramData/GOG.com/Galaxy/storage/galaxy-2.0.db";

export interface GogLibraryGame {
  releaseKey: string;
  title: string;
}

/**
 * Lit la bibliothèque GOG directement depuis la base SQLite locale du
 * client Galaxy — pas d'API distante disponible pour la bibliothèque perso
 * (voir docs/specs/owned-games-gog-epic-itchio.md §9). Ouverte en lecture
 * seule : ne modifie jamais le fichier du client Galaxy. Nécessite que
 * Galaxy soit installé sur la machine qui exécute ce script.
 */
export function fetchGogLibrary(dbPath: string = process.env.GOG_GALAXY_DB_PATH ?? DEFAULT_DB_PATH): GogLibraryGame[] {
  const db = new Database(dbPath, { readonly: true });

  try {
    const rows = db
      .query<{ releaseKey: string; titleJson: string }, []>(
        `
        SELECT lr.releaseKey AS releaseKey, gp.value AS titleJson
        FROM LibraryReleases lr
        JOIN GamePieces gp ON gp.releaseKey = lr.releaseKey
        JOIN GamePieceTypes t ON t.id = gp.gamePieceTypeId AND t.type = 'title'
        `
      )
      .all();

    const games: GogLibraryGame[] = [];
    let skippedWithoutTitle = 0;
    let skippedThirdParty = 0;

    for (const row of rows) {
      if (!row.releaseKey.startsWith("gog_")) {
        skippedThirdParty += 1;
        continue;
      }

      const parsed = JSON.parse(row.titleJson) as { title: string | null };
      // Certaines entrées GOG ont un titre jamais synchronisé côté Galaxy
      // (`{"title": null}`) — vraie lacune de données, pas une erreur de parsing.
      if (parsed.title === null) {
        skippedWithoutTitle += 1;
        continue;
      }
      games.push({ releaseKey: row.releaseKey, title: parsed.title });
    }

    if (skippedThirdParty > 0) {
      console.log(`GOG Galaxy : ${skippedThirdParty} entrée(s) tierce(s) ignorée(s).`);
    }
    if (skippedWithoutTitle > 0) {
      console.log(`GOG Galaxy : ${skippedWithoutTitle} jeu(x) sans titre synchronisé, ignorés.`);
    }

    return games;
  } finally {
    db.close();
  }
}

export const gogOwnedGamesClient: OwnedGamesClient = {
  platform: "gog",
  async fetchLibrary() {
    const games = fetchGogLibrary();
    return games.map((game) => ({
      externalId: game.releaseKey,
      rawTitle: game.title,
    }));
  },
};
