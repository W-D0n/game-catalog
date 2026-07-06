import { db } from "./db";

/** Sémantique définie par chaque provider (RAWG : dernier numéro de page complété ; IGDB : dernier id vu). */
export async function getLastCursor(provider: string): Promise<number> {
  const [row] = await db<{ last_cursor: string }[]>`
    SELECT last_cursor FROM import_state WHERE provider = ${provider}
  `;
  return row ? Number(row.last_cursor) : 0;
}

export async function saveLastCursor(provider: string, cursor: number): Promise<void> {
  await db`
    INSERT INTO import_state (provider, last_cursor)
    VALUES (${provider}, ${cursor})
    ON CONFLICT (provider) DO UPDATE SET last_cursor = EXCLUDED.last_cursor
  `;
}

/** Timestamp unix du dernier sweep incrémental réussi — `null` si jamais exécuté (voir catalog-update-pipeline). */
export async function getLastUpdateCheck(provider: string): Promise<number | null> {
  const [row] = await db<{ last_update_check: string | null }[]>`
    SELECT last_update_check FROM import_state WHERE provider = ${provider}
  `;
  return row?.last_update_check ? Number(row.last_update_check) : null;
}

export async function saveLastUpdateCheck(provider: string, timestamp: number): Promise<void> {
  await db`
    INSERT INTO import_state (provider, last_update_check)
    VALUES (${provider}, ${timestamp})
    ON CONFLICT (provider) DO UPDATE SET last_update_check = EXCLUDED.last_update_check
  `;
}

export interface ImportState {
  provider: string;
  lastCursor: number;
}

export async function getAllImportStates(): Promise<ImportState[]> {
  const rows = await db<{ provider: string; last_cursor: string }[]>`
    SELECT provider, last_cursor FROM import_state ORDER BY provider
  `;
  return rows.map((row) => ({ provider: row.provider, lastCursor: Number(row.last_cursor) }));
}
