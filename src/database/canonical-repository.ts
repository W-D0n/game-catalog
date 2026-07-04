import { db } from "./db";
import type { GameCompanyCredit } from "../types/game";

export interface CanonicalGameData {
  title: string;
  releaseYear: number | null;
  releaseStatus: string | null;
}

export async function createCanonicalGame(data: CanonicalGameData): Promise<bigint> {
  const [row] = await db<{ id: string }[]>`
    INSERT INTO canonical_games (title, release_year, release_status)
    VALUES (${data.title}, ${data.releaseYear}, ${data.releaseStatus})
    RETURNING id
  `;

  if (row === undefined) {
    throw new Error("createCanonicalGame : aucune ligne retournée");
  }

  return BigInt(row.id);
}

export async function linkGameToCanonical(gameId: bigint, canonicalId: bigint): Promise<void> {
  await db`UPDATE games SET canonical_id = ${canonicalId} WHERE id = ${gameId}`;
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

export async function saveCompany(name: string): Promise<bigint> {
  const [row] = await db<{ id: string }[]>`
    INSERT INTO companies (name)
    VALUES (${name})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  if (row === undefined) {
    throw new Error(`saveCompany : aucune ligne retournée pour "${name}"`);
  }

  return BigInt(row.id);
}

/** Upsert : les rôles sont fusionnés en OR (un rôle déjà vrai le reste). */
export async function saveGameCompany(
  canonicalId: bigint,
  companyId: bigint,
  roles: GameCompanyCredit
): Promise<void> {
  await db`
    INSERT INTO game_companies (canonical_id, company_id, is_developer, is_publisher, is_porting, is_supporting)
    VALUES (${canonicalId}, ${companyId}, ${roles.isDeveloper}, ${roles.isPublisher}, ${roles.isPorting}, ${roles.isSupporting})
    ON CONFLICT (canonical_id, company_id) DO UPDATE SET
      is_developer = game_companies.is_developer OR EXCLUDED.is_developer,
      is_publisher = game_companies.is_publisher OR EXCLUDED.is_publisher,
      is_porting = game_companies.is_porting OR EXCLUDED.is_porting,
      is_supporting = game_companies.is_supporting OR EXCLUDED.is_supporting
  `;
}

export async function saveGenre(name: string): Promise<bigint> {
  const [row] = await db<{ id: string }[]>`
    INSERT INTO genres (name)
    VALUES (${name})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  if (row === undefined) {
    throw new Error(`saveGenre : aucune ligne retournée pour "${name}"`);
  }

  return BigInt(row.id);
}

export async function saveCanonicalGenre(canonicalId: bigint, genreId: bigint): Promise<void> {
  await db`
    INSERT INTO canonical_game_genres (canonical_id, genre_id)
    VALUES (${canonicalId}, ${genreId})
    ON CONFLICT DO NOTHING
  `;
}

export type RelationshipType = "remake_of" | "remaster_of" | "dlc_of" | "edition_of" | "parent";

export async function saveGameRelationship(
  fromCanonicalId: bigint,
  toCanonicalId: bigint,
  type: RelationshipType
): Promise<void> {
  await db`
    INSERT INTO game_relationships (from_canonical_id, to_canonical_id, type)
    VALUES (${fromCanonicalId}, ${toCanonicalId}, ${type})
    ON CONFLICT (from_canonical_id, to_canonical_id, type) DO NOTHING
  `;
}

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
