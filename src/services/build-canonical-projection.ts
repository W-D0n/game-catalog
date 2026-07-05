import { getAllGamesForMatching, type MatchingGame } from "../database/game-repository";
import { buildCanonicalGroups } from "../matching/build-canonical-groups";
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
 * Construit ou complète la projection canonique : ne retraite que les jeux
 * pas encore liés (games.canonical_id NULL). Un groupe de blocking touchant
 * un seul canonical game existant l'étend (nouveaux membres liés, sociétés/
 * genres ajoutés). Un groupe touchant plusieurs canonical games existants
 * est ambigu (re-matching non spécifié, voir spec §10) — ses nouveaux
 * membres sont laissés non liés plutôt que de fusionner à l'aveugle.
 */
export async function buildCanonicalProjection(): Promise<void> {
  const allGames = await getAllGamesForMatching();
  const newGames = allGames.filter((g) => g.canonicalId === null);

  console.log(`${allGames.length} jeux au total, ${newGames.length} nouveaux à traiter.`);

  if (newGames.length === 0) {
    console.log("Rien à faire — tous les jeux sont déjà liés à un canonical game.");
    return;
  }

  const groups = buildCanonicalGroups(allGames);

  const canonicalIdByGameId = new Map<bigint, bigint>();
  for (const game of allGames) {
    if (game.canonicalId !== null) canonicalIdByGameId.set(game.id, game.canonicalId);
  }

  const newCanonicalGroups: MatchingGame[][] = [];
  const groupsToExtend: { canonicalId: bigint; newMembers: MatchingGame[] }[] = [];
  let skippedAmbiguous = 0;

  for (const group of groups) {
    const newMembers = group.filter((g) => g.canonicalId === null);
    if (newMembers.length === 0) continue;

    const existingIds = new Set(
      group.filter((g) => g.canonicalId !== null).map((g) => g.canonicalId!)
    );

    if (existingIds.size === 0) {
      newCanonicalGroups.push(group);
    } else if (existingIds.size === 1) {
      groupsToExtend.push({ canonicalId: [...existingIds][0]!, newMembers });
    } else {
      skippedAmbiguous += newMembers.length;
      console.log(
        `  ambigu (${existingIds.size} canonical games existants touchés) — ignoré : ${newMembers
          .map((g) => g.title)
          .join(", ")}`
      );
    }
  }

  console.log(
    `${newCanonicalGroups.length} nouveaux canonical games à créer, ${groupsToExtend.length} existants à étendre, ${skippedAmbiguous} jeux ambigus ignorés.`
  );

  const gameCompanyLinks = new Map<string, GameCompanyLink>();
  const genreLinkKeys = new Set<string>();
  const genreLinks: GenreLink[] = [];
  const links: GameCanonicalLink[] = [];

  function collectCompanyAndGenreLinks(canonicalId: bigint, game: MatchingGame): void {
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

  const companyNames = new Set<string>();
  const genreNames = new Set<string>();
  for (const game of newGames) {
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

  console.log("Création des nouveaux canonical_games...");

  let processedGroups = 0;
  for (const groupChunk of chunk(newCanonicalGroups, BATCH_SIZE)) {
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

    for (let i = 0; i < groupChunk.length; i++) {
      const canonicalId = canonicalIds[i]!;

      for (const game of groupChunk[i]!) {
        canonicalIdByGameId.set(game.id, canonicalId);
        links.push({ gameId: game.id, canonicalId });
        collectCompanyAndGenreLinks(canonicalId, game);
      }
    }

    processedGroups += groupChunk.length;
    console.log(`${processedGroups}/${newCanonicalGroups.length} nouveaux groupes créés...`);
  }

  console.log("Extension des canonical_games existants...");

  for (const { canonicalId, newMembers } of groupsToExtend) {
    for (const game of newMembers) {
      canonicalIdByGameId.set(game.id, canonicalId);
      links.push({ gameId: game.id, canonicalId });
      collectCompanyAndGenreLinks(canonicalId, game);
    }
  }

  console.log(`Liaison de ${links.length} jeux à leur canonical game...`);
  for (const batch of chunk(links, BATCH_SIZE)) {
    await linkGamesToCanonicalBulk(batch);
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
  for (const game of allGames) {
    if (game.source === "igdb") gameBySourceId.set(game.sourceId, game);
  }

  const relationshipLinks: RelationshipLink[] = [];
  for (const game of allGames) {
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

  console.log(
    `Projection canonique terminée : ${newCanonicalGroups.length} nouveaux canonical games créés, ${groupsToExtend.length} étendus, ${skippedAmbiguous} jeux ambigus laissés non liés.`
  );
}
