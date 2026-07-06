# Inbox

Questions ouvertes et idées à traiter.

- Ajouter IGDB comme second provider (OAuth Twitch)
- Stratégie de déduplication multi-sources (RAWG + IGDB pour le même jeu)
- Recherche plein texte PostgreSQL sur les titres
- Intégration future SvelteKit
- Piste d'intégration : le catalogue game-catalog (DB + exports JSON) pourrait
  être exploité comme backend pour le projet perso MyVault (en construction),
  afin de disposer d'une DB de jeux + front pour explorer les jeux remontés
  par RAWG/IGDB. Pas de spec ni de code à ce stade.
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

- fetch mes jeux possédés sur les stores GOG, Epic Game store, Itchio —
  couvert en partie par [cross-platform-library-model](specs/cross-platform-library-model.md)
  (modèle `owned_games` conçu pour les accueillir), clients providers pas encore écrits.
- [x] **Implémenté le 2026-07-06 (IGDB)** : [catalog-update-pipeline](specs/catalog-update-pipeline.md)
  — `IgdbProvider.fetchUpdatedSince` + `runIgdbUpdateSweep` (`bun run sweep-igdb`).
  Vérifié en direct : 2143 jeux modifiés détectés sur une fenêtre de 2h,
  ré-enrichis (1849 nouveaux canonical games, 290 étendus). RAWG différé
  (quota bloqué jusqu'au 2026-08-01, mécanisme non vérifié).
- [x] **Implémenté le 2026-07-06** : [cross-platform-library-model](specs/cross-platform-library-model.md)
  — table `owned_games` + `matchOwnedGames` (incrémental, persisté),
  `export-steam-library.ts`/`enrich-rawg-library.ts` migrés,
  `steam_library_games` droppée. `steam_player_games` reste distinct
  (croisement entre tiers, notion différente).
- [x] **Specé le 2026-07-06** : [archipelago-compatibility](specs/archipelago-compatibility.md)
  — champ dérivé `archipelago: boolean`, scraping liste officielle
  confirmé faisable, accès wiki non vérifié (403 rencontré), non implémenté.
- [x] **Specé le 2026-07-06** : [myvault-integration](specs/myvault-integration.md)
  — contrat côté game-catalog, mode de transport (DB directe / export JSON
  / API) explicitement non tranché, bloquant tant que la stack MyVault n'est pas connue.
