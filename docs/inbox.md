# Inbox

Questions ouvertes et idées à traiter.

- Ajouter IGDB comme second provider (OAuth Twitch)
- Stratégie de déduplication multi-sources (RAWG + IGDB pour le même jeu)
- Recherche plein texte PostgreSQL sur les titres
- Intégration future SvelteKit
- Extension : croisement de bibliothèques Steam multi-utilisateurs (trouver les jeux
  en commun entre plusieurs comptes, à partir de leurs SteamID64) — inspiré d'un
  projet perso antérieur (D:\_DEV\LABS\SteamFriends, Python, abandonné/incomplet,
  bug connu : l'agrégation ne prenait que le dernier joueur itéré). Pas de spec
  ni de code à ce stade — juste une idée à explorer plus tard.
- **Bug confirmé (2026-07-05) : le crawl IGDB a des trous de couverture réels.**
  `IgdbProvider` pagine par `offset`/`limit` (`sort id asc`), instable sur un
  dataset qui change en continu — des blocs entiers d'ids valides et listables
  sont absents en base (confirmé : `where id >= 5560 & id <= 5590` retourne de
  vrais jeux — Wonder Boy, Vandal Hearts, Golden Axe — dont aucun n'est en
  base). Cause probable : des insertions/suppressions côté IGDB pendant les
  ~1-2h du crawl décalent l'offset et sautent des pages, sans jamais lever
  d'erreur. **Fix proposé** : passer en pagination par curseur
  (`where id > dernier_id_vu; sort id asc; limit N`), stable même si le
  dataset bouge pendant le crawl. Implique de changer la sémantique
  d'`import_state` (dernier id vu plutôt que numéro de page) et un nouveau
  crawl complet pour combler les trous existants (~1-2h). Différé — pas
  bloquant pour l'usage actuel du catalogue, mais à traiter avant de
  considérer le catalogue IGDB "complet".
