import { db } from "./db";

export async function getLastPage(provider: string): Promise<number> {
  const [row] = await db<{ last_page: number }[]>`
    SELECT last_page FROM import_state WHERE provider = ${provider}
  `;
  return row?.last_page ?? 0;
}

export async function saveLastPage(provider: string, page: number): Promise<void> {
  await db`
    INSERT INTO import_state (provider, last_page)
    VALUES (${provider}, ${page})
    ON CONFLICT (provider) DO UPDATE SET last_page = EXCLUDED.last_page
  `;
}
