const GAMES_PAGE_URL = "https://archipelago.gg/games";

/** Décode les entités HTML présentes dans les titres (ex: "Kirby&#39;s Dream Land 3"). */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Récupère la liste des jeux supportés depuis la page officielle
 * archipelago.gg/games — page HTML statique, chaque jeu marqué par un
 * attribut `data-game="Titre"` (vérifié en direct le 2026-07-10, 81 jeux).
 * Scraping fragile par nature : si la structure change, le parsing échoue
 * explicitement plutôt que de retourner silencieusement une liste vide.
 */
export async function fetchOfficialArchipelagoGames(): Promise<string[]> {
  const response = await fetch(GAMES_PAGE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; game-catalog-archipelago-scraper)" },
  });

  if (!response.ok) {
    throw new Error(`archipelago.gg/games a échoué (HTTP ${response.status})`);
  }

  const html = await response.text();
  const matches = [...html.matchAll(/data-game="([^"]*)"/g)];

  if (matches.length === 0) {
    throw new Error(
      "archipelago.gg/games : aucun jeu trouvé (attribut data-game absent) — la structure de la page a probablement changé"
    );
  }

  return matches.map((match) => decodeHtmlEntities(match[1]!));
}
