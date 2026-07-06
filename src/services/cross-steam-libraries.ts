import { fetchOwnedGamesForPlayer, fetchPlayerSummary } from "../providers/steam/steam-multi-library-client";
import { saveOwnedGames, savePlayer } from "../database/steam-players-repository";
import { getCanonicalGamesForExport, type CanonicalGameExport } from "../database/canonical-repository";
import { exportJson } from "../exporters/export-json";
import { buildCanonicalTitleIndex, matchTitleToCanonical } from "../matching/canonical-title-lookup";

export interface CrossedGameEntry {
  appId: number;
  steamName: string;
  ownerCount: number;
  owners: string[];
  canonicalGame: CanonicalGameExport | null;
}

/**
 * Récupère les bibliothèques Steam d'un groupe de joueurs et calcule le
 * croisement (jeux possédés par au moins `threshold` d'entre eux), enrichi
 * via le catalogue canonique. Un joueur introuvable ou au profil non public
 * est exclu du calcul sans bloquer les autres (voir
 * docs/specs/steam-library-crossing.md §3).
 *
 * L'agrégation itère chaque joueur et ajoute son SteamID64 à l'ensemble des
 * possesseurs de CHAQUE jeu qu'il possède (Map<appId, Set<steamId64>>) —
 * jamais une variable réutilisée entre itérations, pour éviter le bug
 * d'agrégation du prototype d'origine (SteamFriends) qui ne conservait que
 * le dernier joueur traité.
 */
export async function crossSteamLibraries(steamIds: string[], threshold?: number): Promise<void> {
  const effectiveThreshold = threshold ?? steamIds.length;
  const ownersByAppId = new Map<number, { name: string; owners: Set<string> }>();
  const excluded: string[] = [];
  let includedCount = 0;

  for (const steamId of steamIds) {
    const summary = await fetchPlayerSummary(steamId);

    if (!summary) {
      excluded.push(`${steamId} : introuvable, exclu`);
      continue;
    }

    if (!summary.isPublic) {
      excluded.push(`${steamId} (${summary.personaName}) : profil privé, exclu`);
      continue;
    }

    await savePlayer(summary);
    const games = await fetchOwnedGamesForPlayer(steamId);
    await saveOwnedGames(steamId, games);
    includedCount++;

    for (const game of games) {
      const entry = ownersByAppId.get(game.appId) ?? { name: game.name, owners: new Set<string>() };
      entry.owners.add(steamId);
      ownersByAppId.set(game.appId, entry);
    }
  }

  console.log(
    `Steam croisement : ${includedCount}/${steamIds.length} joueurs inclus, seuil = ${effectiveThreshold}.`
  );
  for (const message of excluded) console.log(`  ${message}`);

  const canonicalGames = await getCanonicalGamesForExport();
  const titleIndex = buildCanonicalTitleIndex(canonicalGames);

  const entries: CrossedGameEntry[] = [];
  for (const [appId, { name, owners }] of ownersByAppId) {
    if (owners.size < effectiveThreshold) continue;

    const { canonicalGame } = matchTitleToCanonical(titleIndex, name);

    entries.push({
      appId,
      steamName: name,
      ownerCount: owners.size,
      owners: [...owners],
      canonicalGame,
    });
  }

  entries.sort((a, b) => b.ownerCount - a.ownerCount || a.steamName.localeCompare(b.steamName));

  await exportJson("./exports/steam-crossing.json", entries);

  console.log(
    `Export croisement Steam terminé : ${entries.length} jeux en commun (seuil ${effectiveThreshold}/${steamIds.length}).`
  );
}
