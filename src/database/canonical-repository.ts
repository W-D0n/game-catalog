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

export interface GameMedia {
  coverUrl: string | null;
  screenshotUrls: string[];
  videoIds: string[];
  summary: string | null;
  storyline: string | null;
}

export interface CanonicalGameExport {
  id: string;
  title: string;
  releaseYear: number | null;
  releaseStatus: string | null;
  platforms: string[];
  genres: string[];
  companies: GameCompanyCredit[];
  sources: { source: string; sourceId: string; title: string }[];
  relationships: { type: RelationshipType; toId: string; toTitle: string }[];
  media: GameMedia | null;
  archipelago: boolean;
}

/** Projection canonique complète pour export — un objet par canonical game, provenance et relations incluses. */
export async function getCanonicalGamesForExport(): Promise<CanonicalGameExport[]> {
  const rows = await db<
    (Omit<CanonicalGameExport, "companies" | "sources" | "relationships" | "media"> & {
      companies: GameCompanyCredit[] | null;
      sources: { source: string; sourceId: string; title: string }[] | null;
      relationships: { type: RelationshipType; toId: string; toTitle: string }[] | null;
      media: GameMedia | null;
    })[]
  >`
    SELECT
      cg.id,
      cg.title,
      cg.release_year AS "releaseYear",
      cg.release_status AS "releaseStatus",
      COALESCE(platforms.list, '{}') AS platforms,
      COALESCE(genres.list, '{}') AS genres,
      companies.list AS companies,
      sources.list AS sources,
      relationships.list AS relationships,
      media.data AS media,
      EXISTS (
        SELECT 1 FROM archipelago_games ag WHERE ag.canonical_id = cg.id
      ) AS archipelago
    FROM canonical_games cg
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT p.name) AS list
      FROM games g
      JOIN game_platforms gp ON gp.game_id = g.id
      JOIN platforms p ON p.id = gp.platform_id
      WHERE g.canonical_id = cg.id
    ) platforms ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(gn.name) AS list
      FROM canonical_game_genres cgg
      JOIN genres gn ON gn.id = cgg.genre_id
      WHERE cgg.canonical_id = cg.id
    ) genres ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
        'name', c.name,
        'isDeveloper', gc.is_developer,
        'isPublisher', gc.is_publisher,
        'isPorting', gc.is_porting,
        'isSupporting', gc.is_supporting
      )) AS list
      FROM game_companies gc
      JOIN companies c ON c.id = gc.company_id
      WHERE gc.canonical_id = cg.id
    ) companies ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
        'source', g2.source,
        'sourceId', g2.source_id,
        'title', g2.title
      )) AS list
      FROM games g2
      WHERE g2.canonical_id = cg.id
    ) sources ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
        'type', gr.type,
        'toId', gr.to_canonical_id::text,
        'toTitle', cg2.title
      )) AS list
      FROM game_relationships gr
      JOIN canonical_games cg2 ON cg2.id = gr.to_canonical_id
      WHERE gr.from_canonical_id = cg.id
    ) relationships ON true
    LEFT JOIN LATERAL (
      SELECT json_build_object(
        'coverUrl', src.raw_metadata->>'coverUrl',
        'screenshotUrls', COALESCE(src.raw_metadata->'screenshotUrls', '[]'::jsonb),
        'videoIds', COALESCE(src.raw_metadata->'videoIds', '[]'::jsonb),
        'summary', src.raw_metadata->>'summary',
        'storyline', src.raw_metadata->>'storyline'
      ) AS data
      FROM games src
      WHERE src.canonical_id = cg.id AND src.raw_metadata IS NOT NULL
      ORDER BY (src.source = 'igdb') DESC, src.id
      LIMIT 1
    ) media ON true
    ORDER BY cg.id
  `;

  return rows.map((row) => ({
    ...row,
    companies: row.companies ?? [],
    sources: row.sources ?? [],
    relationships: row.relationships ?? [],
    media: row.media ?? null,
  }));
}
