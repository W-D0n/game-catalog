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
- [x] **Bug confirmé et corrigé (2026-07-05) : le crawl IGDB avait des trous
  de couverture réels.** `IgdbProvider` paginait par `offset`/`limit`
  (`sort id asc`), instable sur un dataset qui change en continu — des blocs
  entiers d'ids valides et listables étaient absents en base (confirmé :
  `where id >= 5560 & id <= 5590` retournait de vrais jeux — Wonder Boy,
  Vandal Hearts, Golden Axe — absents chez nous). **Corrigé** : pagination
  par curseur (`where id > dernier_id_vu; sort id asc; limit 500`, plus
  d'offset du tout) — immunisée par construction contre le décalage. Interface
  `GameProvider` changée (`fetchPage` retourne `{ games, nextCursor }`,
  chaque provider définit son curseur), `import_state.last_page` renommé
  `last_cursor` (RAWG garde sa sémantique "dernière page", IGDB passe à
  "dernier id vu", `import_state.igdb` remis à 0). Validé en direct : fetch
  depuis le curseur 5560 retourne bien Vandal Hearts et Golden Axe.
  **Reste à faire** : un nouveau crawl IGDB complet pour combler les trous
  existants (~1-2h, non lancé — décision à prendre séparément).
