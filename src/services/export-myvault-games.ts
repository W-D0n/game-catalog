import { getAllOwnedGames, type OwnedGameAcrossPlatforms } from "../database/owned-games-repository";
import { getCanonicalGamesForExport, type CanonicalGameExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";
import type { GameCompanyCredit } from "../types/game";

/** Forme exacte de myvault.games.platforms (src/lib/domain/library/types.ts, PlatformLink) — playtimeMinutes/lastPlayedAt/storeUrl inconnus depuis game-catalog, laissés à leur valeur neutre. */
export interface MyvaultPlatformLink {
  platform: string;
  externalId: string;
  playtimeMinutes: number;
  lastPlayedAt: string | null;
  storeUrl: string | null;
}

/**
 * Une ligne = un futur `myvault.games`. Les 5 premiers champs correspondent
 * exactement au schéma actuel de MyVault ; les suivants sont les champs
 * d'extension proposés (docs/specs/myvault-integration.md) — à ajouter côté
 * MyVault avant de pouvoir les importer.
 */
export interface MyvaultGameImportRow {
  title: string;
  coverUrl: string | null;
  platforms: MyvaultPlatformLink[];
  genre: string | null;
  year: number | null;
  description: string | null;
  archipelago: boolean;
  genres: string[];
  companies: GameCompanyCredit[];
  screenshotUrls: string[];
  videoIds: string[];
  storyline: string | null;
}

function toPlatformLink(owned: OwnedGameAcrossPlatforms): MyvaultPlatformLink {
  return {
    platform: owned.platform,
    externalId: owned.externalId,
    playtimeMinutes: 0,
    lastPlayedAt: null,
    storeUrl: null,
  };
}

function toImportRow(canonicalGame: CanonicalGameExport | null, group: OwnedGameAcrossPlatforms[]): MyvaultGameImportRow {
  return {
    title: canonicalGame?.title ?? group[0]!.rawTitle,
    coverUrl: canonicalGame?.media?.coverUrl ?? null,
    platforms: group.map(toPlatformLink),
    genre: canonicalGame?.genres[0] ?? null,
    year: canonicalGame?.releaseYear ?? null,
    description: canonicalGame?.media?.summary ?? null,
    archipelago: canonicalGame?.archipelago ?? false,
    genres: canonicalGame?.genres ?? [],
    companies: canonicalGame?.companies ?? [],
    screenshotUrls: canonicalGame?.media?.screenshotUrls ?? [],
    videoIds: canonicalGame?.media?.videoIds ?? [],
    storyline: canonicalGame?.media?.storyline ?? null,
  };
}

/**
 * Regroupe la bibliothèque possédée (toutes plateformes) par canonical_id —
 * un jeu possédé sur plusieurs plateformes devient UNE seule ligne avec
 * plusieurs `platforms[]`, comme l'exige le modèle `Game` de MyVault. Les
 * jeux non matchés (canonical_id NULL) restent chacun leur propre ligne
 * (aucun regroupement possible sans identité commune).
 */
export async function buildMyvaultGamesImport(): Promise<MyvaultGameImportRow[]> {
  const ownedGames = await getAllOwnedGames();
  const canonicalGames = await getCanonicalGamesForExport();
  const canonicalById = new Map(canonicalGames.map((g) => [g.id, g]));

  const groups = new Map<string, { canonicalGame: CanonicalGameExport | null; ownedGames: OwnedGameAcrossPlatforms[] }>();

  for (const owned of ownedGames) {
    const groupKey = owned.canonicalId ? `canonical:${owned.canonicalId}` : `unmatched:${owned.platform}:${owned.externalId}`;
    const canonicalGame = owned.canonicalId ? (canonicalById.get(owned.canonicalId.toString()) ?? null) : null;

    const existing = groups.get(groupKey);
    if (existing) {
      existing.ownedGames.push(owned);
    } else {
      groups.set(groupKey, { canonicalGame, ownedGames: [owned] });
    }
  }

  return Array.from(groups.values()).map(({ canonicalGame, ownedGames: group }) => toImportRow(canonicalGame, group));
}

export async function exportMyvaultGamesImport(): Promise<void> {
  const rows = await buildMyvaultGamesImport();
  await exportJson("./exports/myvault-games-import.json", rows);
  console.log(`Export MyVault (games import) terminé : ${rows.length} lignes.`);
}
