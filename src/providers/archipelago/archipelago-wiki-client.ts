import { z } from "zod";

const API_URL = "https://archipelago.miraheze.org/w/api.php";

const CategoryMembersResponseSchema = z.object({
  query: z.object({
    categorymembers: z.array(z.object({ title: z.string() })),
  }),
  continue: z.object({ cmcontinue: z.string() }).optional(),
});

/**
 * Récupère la liste des jeux catégorisés "Games" sur le wiki Archipelago
 * via l'API MediaWiki standard — accès confirmé fonctionnel le 2026-07-10
 * avec un User-Agent réaliste (le 403 rencontré le 2026-07-06 était un
 * blocage anti-bot générique, pas une indisponibilité de la source).
 * Pagine jusqu'à épuisement (`continue.cmcontinue`).
 */
export async function fetchWikiArchipelagoGames(): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | undefined;

  while (true) {
    const url = new URL(API_URL);
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "categorymembers");
    url.searchParams.set("cmtitle", "Category:Games");
    url.searchParams.set("cmlimit", "500");
    url.searchParams.set("format", "json");
    if (cmcontinue) url.searchParams.set("cmcontinue", cmcontinue);

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; game-catalog-archipelago-scraper)" },
    });

    if (!response.ok) {
      throw new Error(`archipelago.miraheze.org (wiki) a échoué (HTTP ${response.status})`);
    }

    const body: unknown = await response.json();
    const parsed = CategoryMembersResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new Error(`archipelago.miraheze.org (wiki) : réponse invalide (${parsed.error.message})`);
    }

    titles.push(...parsed.data.query.categorymembers.map((member) => member.title));

    if (!parsed.data.continue) break;
    cmcontinue = parsed.data.continue.cmcontinue;
  }

  return titles;
}
