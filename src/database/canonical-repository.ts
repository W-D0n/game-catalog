import { db } from "./db";
import type { GameCompanyCredit } from "../types/game";

export interface CanonicalGameData {
  title: string;
  releaseYear: number | null;
  releaseStatus: string | null;
}

/** Insertion multi-lignes : un seul aller-retour pour tout un lot. Ordre RETURNING garanti = ordre VALUES (INSERT simple, une seule table). */
export async function createCanonicalGamesBulk(rows: CanonicalGameData[]): Promise<bigint[]> {
  if (rows.length === 0) return [];

  const values = rows.map((r) => ({
    title: r.title,
    release_year: r.releaseYear,
    release_status: r.releaseStatus,
  }));

  const inserted = await db<{ id: string }[]>`
    INSERT INTO canonical_games ${db(values)}
    RETURNING id
  `;

  return inserted.map((row) => BigInt(row.id));
}

export interface GameCanonicalLink {
  gameId: bigint;
  canonicalId: bigint;
}

export async function linkGamesToCanonicalBulk(links: GameCanonicalLink[]): Promise<void> {
  if (links.length === 0) return;

  const gameIds = db.array(links.map((l) => l.gameId.toString()), "BIGINT");
  const canonicalIds = db.array(links.map((l) => l.canonicalId.toString()), "BIGINT");

  await db`
    UPDATE games AS g
    SET canonical_id = v.canonical_id
    FROM (SELECT unnest(${gameIds}) AS game_id, unnest(${canonicalIds}) AS canonical_id) AS v
    WHERE g.id = v.game_id
  `;
}

/** Upsert en masse par nom, retourne la map nom -> id. */
export async function saveCompaniesBulk(names: string[]): Promise<Map<string, bigint>> {
  const map = new Map<string, bigint>();
  if (names.length === 0) return map;

  const rows = await db<{ id: string; name: string }[]>`
    INSERT INTO companies ${db(names.map((name) => ({ name })))}
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name
  `;

  for (const row of rows) map.set(row.name, BigInt(row.id));
  return map;
}

export async function saveGenresBulk(names: string[]): Promise<Map<string, bigint>> {
  const map = new Map<string, bigint>();
  if (names.length === 0) return map;

  const rows = await db<{ id: string; name: string }[]>`
    INSERT INTO genres ${db(names.map((name) => ({ name })))}
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name
  `;

  for (const row of rows) map.set(row.name, BigInt(row.id));
  return map;
}

export interface GameCompanyLink extends GameCompanyCredit {
  canonicalId: bigint;
  companyId: bigint;
}

/** Les paires (canonicalId, companyId) doivent déjà être dédupliquées côté appelant (fusion OR faite en amont). */
export async function saveGameCompaniesBulk(links: GameCompanyLink[]): Promise<void> {
  if (links.length === 0) return;

  const values = links.map((l) => ({
    canonical_id: l.canonicalId,
    company_id: l.companyId,
    is_developer: l.isDeveloper,
    is_publisher: l.isPublisher,
    is_porting: l.isPorting,
    is_supporting: l.isSupporting,
  }));

  await db`
    INSERT INTO game_companies ${db(values)}
    ON CONFLICT (canonical_id, company_id) DO UPDATE SET
      is_developer = game_companies.is_developer OR EXCLUDED.is_developer,
      is_publisher = game_companies.is_publisher OR EXCLUDED.is_publisher,
      is_porting = game_companies.is_porting OR EXCLUDED.is_porting,
      is_supporting = game_companies.is_supporting OR EXCLUDED.is_supporting
  `;
}

export interface GenreLink {
  canonicalId: bigint;
  genreId: bigint;
}

export async function saveCanonicalGenresBulk(links: GenreLink[]): Promise<void> {
  if (links.length === 0) return;

  const values = links.map((l) => ({ canonical_id: l.canonicalId, genre_id: l.genreId }));

  await db`
    INSERT INTO canonical_game_genres ${db(values)}
    ON CONFLICT DO NOTHING
  `;
}

export type RelationshipType = "remake_of" | "remaster_of" | "dlc_of" | "edition_of" | "parent";

export interface RelationshipLink {
  fromCanonicalId: bigint;
  toCanonicalId: bigint;
  type: RelationshipType;
}

export async function saveGameRelationshipsBulk(links: RelationshipLink[]): Promise<void> {
  if (links.length === 0) return;

  const values = links.map((l) => ({
    from_canonical_id: l.fromCanonicalId,
    to_canonical_id: l.toCanonicalId,
    type: l.type,
  }));

  await db`
    INSERT INTO game_relationships ${db(values)}
    ON CONFLICT (from_canonical_id, to_canonical_id, type) DO NOTHING
  `;
}
