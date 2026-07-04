import { getAllGamesForMatching, type MatchingGame } from "../database/game-repository";
import { buildCanonicalGroups, type MatchableIdentity } from "../matching/build-canonical-groups";
import {
  createCanonicalGamesBulk,
  linkGamesToCanonicalBulk,
  saveCanonicalGenresBulk,
  saveCompaniesBulk,
  saveGameCompaniesBulk,
  saveGameRelationshipsBulk,
  saveGenresBulk,
  type GameCanonicalLink,
  type GameCompanyLink,
  type GenreLink,
  type RelationshipLink,
} from "../database/canonical-repository";
import { relationshipTypeFromGameType, resolveGameStatus } from "../matching/igdb-lookups";

const BATCH_SIZE = 2000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Construit la projection canonique complète : regroupe les source games
 * (matching titre/année/plateformes), crée canonical_games/companies/genres,
 * puis résout les relations (remake/dlc/edition) via parent_game/version_parent.
 * Écritures en lots (INSERT multi-lignes) pour rester praticable à l'échelle
 * du catalogue complet.
 */
export async function buildCanonicalProjection(): Promise<void> {
  const games = await getAllGamesForMatching();
  console.log(`${games.length} jeux chargés pour le matching.`);

  const groups = buildCanonicalGroups(games);
  console.log(`${groups.length} groupes canoniques identifiés.`);

  const companyNames = new Set<string>();
  const genreNames = new Set<string>();
  for (const game of games) {
    for (const company of game.rawMetadata?.companies ?? []) companyNames.add(company.name);
    for (const genre of game.rawMetadata?.genres ?? []) genreNames.add(genre);
  }

  console.log(`Upsert de ${companyNames.size} sociétés et ${genreNames.size} genres...`);

  const companyIdByName = new Map<string, bigint>();
  for (const batch of chunk([...companyNames], BATCH_SIZE)) {
    for (const [name, id] of await saveCompaniesBulk(batch)) companyIdByName.set(name, id);
  }

  const genreIdByName = new Map<string, bigint>();
  for (const batch of chunk([...genreNames], BATCH_SIZE)) {
    for (const [name, id] of await saveGenresBulk(batch)) genreIdByName.set(name, id);
  }

  console.log("Création des canonical_games...");

  const canonicalIdByGameId = new Map<bigint, bigint>();
  const gameCompanyLinks = new Map<string, GameCompanyLink>();
  const genreLinkKeys = new Set<string>();
  const genreLinks: GenreLink[] = [];
  let processedGroups = 0;

  for (const groupChunk of chunk(groups, BATCH_SIZE)) {
    const canonicalData = groupChunk.map((group) => {
      const igdbMember = group.find((g) => g.source === "igdb");
      const primary = igdbMember ?? group[0]!;
      return {
        title: primary.title,
        releaseYear: primary.releaseYear,
        releaseStatus: resolveGameStatus(igdbMember?.rawMetadata?.gameStatus),
      };
    });

    const canonicalIds = await createCanonicalGamesBulk(canonicalData);

    const links: GameCanonicalLink[] = [];
    for (let i = 0; i < groupChunk.length; i++) {
      const canonicalId = canonicalIds[i]!;

      for (const game of groupChunk[i]!) {
        canonicalIdByGameId.set(game.id, canonicalId);
        links.push({ gameId: game.id, canonicalId });

        for (const company of game.rawMetadata?.companies ?? []) {
          const companyId = companyIdByName.get(company.name);
          if (companyId === undefined) continue;

          const key = `${canonicalId}:${companyId}`;
          const existing = gameCompanyLinks.get(key);
          if (existing) {
            existing.isDeveloper ||= company.isDeveloper;
            existing.isPublisher ||= company.isPublisher;
            existing.isPorting ||= company.isPorting;
            existing.isSupporting ||= company.isSupporting;
          } else {
            gameCompanyLinks.set(key, { canonicalId, companyId, ...company });
          }
        }

        for (const genreName of game.rawMetadata?.genres ?? []) {
          const genreId = genreIdByName.get(genreName);
          if (genreId === undefined) continue;

          const key = `${canonicalId}:${genreId}`;
          if (!genreLinkKeys.has(key)) {
            genreLinkKeys.add(key);
            genreLinks.push({ canonicalId, genreId });
          }
        }
      }
    }

    await linkGamesToCanonicalBulk(links);

    processedGroups += groupChunk.length;
    console.log(`${processedGroups}/${groups.length} groupes canoniques créés et liés...`);
  }

  console.log(`Insertion de ${gameCompanyLinks.size} liens société...`);
  for (const batch of chunk([...gameCompanyLinks.values()], BATCH_SIZE)) {
    await saveGameCompaniesBulk(batch);
  }

  console.log(`Insertion de ${genreLinks.length} liens genre...`);
  for (const batch of chunk(genreLinks, BATCH_SIZE)) {
    await saveCanonicalGenresBulk(batch);
  }

  console.log("Résolution des relations (parent_game/version_parent)...");

  const gameBySourceId = new Map<string, MatchingGame>();
  for (const game of games) {
    if (game.source === "igdb") gameBySourceId.set(game.sourceId, game);
  }

  const relationshipLinks: RelationshipLink[] = [];
  for (const game of games) {
    if (game.source !== "igdb") continue;

    const fromCanonicalId = canonicalIdByGameId.get(game.id);
    if (fromCanonicalId === undefined) continue;

    const parentGameId = game.rawMetadata?.parentGame;
    if (parentGameId !== null && parentGameId !== undefined) {
      const target = gameBySourceId.get(String(parentGameId));
      const toCanonicalId = target ? canonicalIdByGameId.get(target.id) : undefined;

      if (toCanonicalId !== undefined && toCanonicalId !== fromCanonicalId) {
        relationshipLinks.push({
          fromCanonicalId,
          toCanonicalId,
          type: relationshipTypeFromGameType(game.rawMetadata?.gameType),
        });
      }
    }

    const versionParentId = game.rawMetadata?.versionParent;
    if (versionParentId !== null && versionParentId !== undefined) {
      const target = gameBySourceId.get(String(versionParentId));
      const toCanonicalId = target ? canonicalIdByGameId.get(target.id) : undefined;

      if (toCanonicalId !== undefined && toCanonicalId !== fromCanonicalId) {
        relationshipLinks.push({ fromCanonicalId, toCanonicalId, type: "edition_of" });
      }
    }
  }

  console.log(`Insertion de ${relationshipLinks.length} relations...`);
  for (const batch of chunk(relationshipLinks, BATCH_SIZE)) {
    await saveGameRelationshipsBulk(batch);
  }

  console.log(`Projection canonique terminée : ${groups.length} canonical games.`);
}

export type { MatchableIdentity };
