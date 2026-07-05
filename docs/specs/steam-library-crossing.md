# Spec — Croisement de bibliothèques Steam multi-utilisateurs

> **Statut : CONCEPTION.** Pas de code écrit. Idée initiale notée dans
> `docs/inbox.md`, inspirée d'un projet perso antérieur
> (`D:\_DEV\LABS\SteamFriends`, Python, abandonné/incomplet). Cette spec
> reprend l'intention mais corrige les défauts connus du projet d'origine
> plutôt que de les reproduire (voir §5).

## 1. Problème

Trouver les jeux possédés en commun entre plusieurs comptes Steam (donnés
par leur SteamID64), pour identifier des jeux à faire ensemble — enrichis
avec les métadonnées du catalogue canonique déjà construit (genres,
plateformes, sociétés).

Ce n'est pas juste une intersection d'ensembles — c'est une intersection
**tolérante aux comptes privés/indisponibles**, avec un seuil configurable
(pas seulement "tous les comptes", aussi "au moins N comptes sur M").

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Joueur** | Un compte Steam identifié par son SteamID64. |
| **Bibliothèque** | L'ensemble des jeux (`appid`) possédés par un joueur, via `GetOwnedGames`. |
| **Visibilité** | `communityvisibilitystate` Steam — seul un profil "Public" (état 3) permet de lire sa bibliothèque via l'API. |
| **Croisement** | L'ensemble des jeux possédés par au moins un seuil M de joueurs parmi un groupe. |
| **Seuil (M)** | Nombre minimum de joueurs devant posséder un jeu pour qu'il apparaisse dans le croisement. `M = groupe.length` = intersection stricte ("tous"). |
| **Jeu enrichi** | Un jeu du croisement, avec les métadonnées du catalogue canonique jointes si un `canonical_game` correspond par titre. |

## 3. Acceptance criteria

**Croisement strict (tous les joueurs)**
- Étant donné 3 joueurs publics dont 2 jeux sont possédés par les 3
- Quand on calcule le croisement avec seuil = 3
- Alors seuls ces 2 jeux apparaissent dans le résultat.

**Seuil partiel**
- Étant donné un groupe de 5 joueurs et un seuil de 3
- Quand on calcule le croisement
- Alors tout jeu possédé par 3 joueurs ou plus apparaît, avec la liste des
  joueurs qui le possèdent.

**Compte privé exclu proprement**
- Étant donné un joueur dont `communityvisibilitystate` n'est pas "Public"
- Quand on tente de récupérer sa bibliothèque
- Alors ce joueur est exclu du calcul avec un message explicite (ex: "Joueur
  X : profil privé, exclu"), et le croisement se poursuit normalement pour
  les autres — **jamais** une erreur qui interrompt tout le groupe.

**Enrichissement via le catalogue canonique**
- Étant donné un jeu du croisement
- Quand on construit l'export
- Alors les métadonnées canoniques (genres, plateformes, sociétés) sont
  jointes par titre normalisé si un `canonical_game` correspond (même
  mécanisme que `export-steam-library.ts`), sinon `canonicalGame: null` —
  jamais d'erreur bloquante pour un jeu non catalogué.

**Agrégation correcte multi-joueurs (anti-régression du bug SteamFriends)**
- Étant donné N joueurs
- Quand on agrège les bibliothèques
- Alors **chaque** joueur contribue à l'ensemble des possesseurs de **chaque**
  jeu qu'il possède — pas seulement le dernier joueur itéré (bug connu du
  projet d'origine : la boucle d'agrégation ne conservait que les jeux du
  dernier profil traité, les autres n'apparaissant qu'en tant que
  "propriétaires" additionnels d'une liste basée sur un seul joueur).

## 4. Modèle de données (cible — NON implémenté)

```
steam_players                 -- remplace/généralise steam_library_games
  steam_id64 TEXT PRIMARY KEY
  persona_name TEXT NOT NULL
  is_public BOOLEAN NOT NULL
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW()

steam_player_games
  steam_id64 TEXT REFERENCES steam_players(steam_id64) ON DELETE CASCADE
  app_id BIGINT NOT NULL
  name TEXT NOT NULL          -- nom Steam brut, conservé même sans match catalogue
  PRIMARY KEY (steam_id64, app_id)
```

> **Migration requise** : `steam_library_games` (table actuelle, mono-joueur
> implicite — le compte de l'utilisateur) devient la ligne `steam_players`
> pour son propre `SteamID64`, et ses lignes migrent vers
> `steam_player_games`. `enrich-rawg-library.ts` et `export-steam-library.ts`
> (qui lisent `steam_library_games` directement) devront être adaptés pour
> lire la bibliothèque du joueur "moi" via le nouveau modèle — pas de
> régression silencieuse acceptable sur ces deux features déjà en
> production.

> Aucune de ces tables n'est créée tant que cette spec n'est pas validée et
> que l'implémentation ne démarre pas (zéro code préemptif).

## 5. Corrections par rapport au projet d'origine (SteamFriends)

| Défaut du projet d'origine | Correction dans cette spec |
|---|---|
| Boucle d'agrégation ne gardait que le dernier joueur itéré (`games`/`profile` réutilisés hors de la boucle par joueur) | Algorithme §6 explicitement construit sur une Map `appId -> Set<steamId64>` peuplée en itérant TOUS les joueurs, jamais de variable partagée entre itérations |
| `filterGamesByOwner` bugué (`len(...) >= number in game_data`, erreur de précédence Python) renvoyait toujours vide | Le seuil (§3, "seuil partiel") est un simple `Set.size >= M`, pas une expression ambiguë |
| `utils.py` manquant dans la version trouvée — projet non exécutable tel quel | N/A, réécriture complète en TypeScript dans ce projet |
| Pas de gestion de la visibilité privée en dehors du filtrage initial (le reste du pipeline suppose des données présentes) | §3 "compte privé exclu proprement" — traité comme un cas de premcampo, pas une erreur qui remonte |

## 6. Algorithme

**Étape 1 — Récupération par joueur**
- Pour chaque `steamId64` du groupe : `GetPlayerSummaries` (visibilité) puis
  `GetOwnedGames` si public. Sauvegarder dans `steam_players`/`steam_player_games`.

**Étape 2 — Agrégation**
- Construire `Map<appId, Set<steamId64>>` en itérant chaque joueur public et
  chacun de ses jeux — ajoute le joueur à l'ensemble des possesseurs de cet
  `appId` (jamais d'écrasement, toujours un ajout à l'ensemble existant).

**Étape 3 — Filtrage par seuil**
- Ne garder que les entrées de la Map où `possesseurs.size >= seuil`.

**Étape 4 — Enrichissement**
- Pour chaque `appId` retenu : reprendre le mécanisme de
  `export-steam-library.ts` (normalisation de titre + désambiguïsation
  plateforme PC) pour joindre le `canonical_game` correspondant si trouvé.

## 7. Taxonomie d'erreurs

| Catégorie | Exemple | Traitement |
|---|---|---|
| Domaine | SteamID64 invalide/inexistant | Joueur exclu, message explicite, ne bloque pas le groupe |
| Domaine | Profil privé/restreint | Joueur exclu, message explicite (voir §3) |
| Système | Steam API indisponible/timeout | **Prérequis** : `steam-library-client.ts` actuel n'a aucun retry (contrairement à RAWG/IGDB) — à ajouter avant cette feature, même pattern retry+backoff |
| Ambiguïté | — | Aucune : le croisement est une opération d'ensemble déterministe, pas de score de similarité |

## 8. Lacunes identifiées

- [ ] **Filtrage par genre/catégorie (ex. "Co-op") non vérifié contre les
  données réelles** : les genres du catalogue canonique viennent d'IGDB
  (`Action`, `RPG`, `Indie`...) — pas confirmé qu'un tag "Co-op"/"Multijoueur"
  existe dans ce vocabulaire. Le projet d'origine visait un filtre par
  catégorie Steam (`category_id`, ex. 38 = "En ligne Coop"), pas un genre
  IGDB — à vérifier avant d'implémenter un tel filtre plutôt que de supposer.
- [ ] **`steam-library-client.ts` actuel n'a pas de retry** (contrairement
  aux autres providers) — prérequis technique avant cette feature si on
  veut la même résilience que RAWG/IGDB.
- [ ] Migration de `steam_library_games` vers `steam_players`/
  `steam_player_games` non spécifiée en détail (script de migration,
  compatibilité avec `enrich-rawg-library.ts`/`export-steam-library.ts`
  existants) — à détailler au moment de l'implémentation.
- [ ] Pas de decision sur le déclenchement (CLI avec liste de SteamID64 en
  argument ? fichier de config ? repris de `playerList.json` du projet
  d'origine ?) — à trancher avant de coder.
