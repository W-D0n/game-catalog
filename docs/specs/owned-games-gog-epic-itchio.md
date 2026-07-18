# Spec — Clients bibliothèque possédée GOG / Epic Games Store / Itch.io

> **Statut : Itch.io, GOG et Epic implémentés (2026-07-10/11).** Les quatre
> plateformes (Steam, Itch.io, GOG, Epic) alimentent désormais
> `owned_games` via `OwnedGamesClient`. Dépend de
> [cross-platform-library-model](cross-platform-library-model.md) (`owned_games`,
> `matchOwnedGames`), déjà implémenté pour Steam.

## 1. Problème

`owned_games` et `matchOwnedGames()` sont conçus pour accueillir plusieurs
plateformes de possession, mais seul Steam alimente la table aujourd'hui
(`src/providers/steam/steam-library-client.ts` +
`src/services/export-steam-library.ts`). L'idée d'ajouter GOG, Epic Games
Store et Itch.io est notée dans `docs/inbox.md` sans investigation de
faisabilité.

Les trois plateformes n'exposent **pas** la même chose : aucune n'a d'API
publique documentée et stable équivalente à Steam `GetOwnedGames`. Traiter
les trois comme un bloc unique masquerait des différences de risque et de
robustesse critiques.

## 2. Faisabilité par plateforme (investigation, 2026-07-10)

| Plateforme | Existe-t-il une API pour lister *ma* bibliothèque possédée ? | Auth | Risque |
|---|---|---|---|
| **Itch.io** | **Oui, officielle et documentée** — `GET https://api.itch.io/profile/owned-keys` (scope OAuth `profile:owned`, ou clé API personnelle non scopée depuis les paramètres du compte) | Bearer token | Faible — API stable, pas de reverse engineering |
| **GOG** | Pas d'API REST publique pour la bibliothèque personnelle. La "GOG Galaxy API" documentée (`docs.gog.com/galaxyapi`) est un protocole **local** (JSON-RPC) entre un plugin et le client Galaxy installé — inutilisable depuis un script serveur. Des outils communautaires (`g-export`, gogdb) utilisent un endpoint non documenté (`embed.gog.com/user/data/games`) authentifié par cookie de session | Cookie de session (extraction manuelle, pas de flow OAuth documenté) | Élevé — non documenté, peut casser sans préavis, auth par cookie fragile |
| **Epic Games Store** | Pas d'API publique pour lister les entitlements d'un compte perso. L'EOS Web API (`dev.epicgames.com/docs/web-api-ref`) sert les intégrations de jeux (developer/game backend), pas la lecture de bibliothèque personnelle. Le projet `legendary` (remplaçant open-source du launcher Epic) reverse-engineer l'auth OAuth du launcher (device auth code flow, client id du launcher) pour lister les entitlements | OAuth device-code reverse-engineré (client id/secret du launcher officiel) | Élevé — non documenté, dépend du client id du launcher Epic, peut casser à toute mise à jour côté Epic |

**Conclusion de faisabilité** : Itch.io est implémentable maintenant avec le
même niveau de confiance que Steam. GOG et Epic nécessitent de s'appuyer sur
des mécanismes non officiels et fragiles — implémentables, mais avec un
risque de rupture hors de notre contrôle, à traiter comme tel (pas de
garantie de continuité de service).

## 3. Glossaire

| Terme | Définition |
|---|---|
| **`OwnedGamesClient`** | Interface commune à extraire : `fetchLibrary(): Promise<{ externalId: string; rawTitle: string }[]>` — chaque plateforme l'implémente, remplace la fonction ad hoc `fetchSteamLibrary` par un contrat partagé. |
| **Clé API itch.io** | Jeton personnel non scopé (paramètres du compte) ou jeton OAuth scope `profile:owned` — les deux donnent accès à `profile/owned-keys`. |
| **Cookie de session GOG** | Jeton de session du compte GOG (`gog-al`/similaire), extrait manuellement du navigateur — pas de flow d'auth programmatique documenté. |
| **Device auth code (Epic)** | Flow OAuth du launcher Epic (reverse-engineré par `legendary`), produit un jeton d'accès aux entitlements du compte. |

## 4. Acceptance criteria

**Itch.io alimente `owned_games` comme Steam**
- Étant donné une clé API itch.io valide (`ITCHIO_API_KEY`)
- Quand `fetchItchioLibrary()` est appelé
- Alors chaque jeu retourné par `profile/owned-keys` est sauvegardé via
  `saveOwnedGame("itchio", externalId, rawTitle)`, puis matché par
  `matchOwnedGames()` — sans dupliquer la logique de matching.

**Aucune plateforme ne bloque les autres**
- Étant donné qu'Epic ou GOG devient indisponible/casse (auth expirée, endpoint
  changé)
- Quand le script d'import correspondant échoue
- Alors les autres plateformes (Steam, Itch.io) restent import­ables
  indépendamment — même principe que RAWG/IGDB découplés aujourd'hui.

**Traçabilité du risque**
- Étant donné que GOG et Epic reposent sur des endpoints non documentés
- Quand un de ces clients échoue silencieusement (changement de format de
  réponse, 401 sur cookie/token expiré)
- Alors l'échec est explicite (exception avec contexte HTTP), jamais une
  bibliothèque vide silencieuse pris pour "aucun jeu possédé".

## 5. Découpage proposé (3 sessions indépendantes)

1. **`OwnedGamesClient` (interface) + migration Steam** — extraire
   l'interface commune, faire de `fetchSteamLibrary` sa première
   implémentation. Aucun comportement changé, juste le contrat.
2. **Itch.io** — `ItchioOwnedGamesClient`, implémente `OwnedGamesClient`,
   `ITCHIO_API_KEY` dans l'environnement, script `export-itchio-library.ts`
   calqué sur `export-steam-library.ts`.
3. **GOG et Epic** — traités séparément l'un de l'autre (pas de dépendance
   commune), chacun documentant explicitement dans son propre commit le
   caractère non officiel du mécanisme utilisé et comment renouveler
   l'authentification (cookie GOG / device code Epic) quand elle expire.

## 6. Effets de bord

- **Itch.io** : lecture seule sur `api.itch.io`, écrit `owned_games`
  (`platform='itchio'`).
- **GOG/Epic** : idem, mais dépendance implicite sur des mécanismes
  d'authentification qui expirent (cookie de session, token OAuth) —
  nécessite une procédure de renouvellement manuelle documentée par
  provider, hors scope de l'automatisation.

## 7. Taxonomie d'erreurs

| Catégorie | Exemple | Traitement |
|---|---|---|
| Domaine | jeu possédé introuvable dans le catalogue canonique | `canonical_id` reste `NULL` (déjà couvert par `matchOwnedGames`) |
| Infra | clé API itch.io absente/invalide | échec explicite au démarrage (`requireEnv`, comme Steam) |
| Infra | device code Epic expiré/révoqué | échec explicite à l'étape d'auth, avant tout appel entitlements |
| Domaine | jeu GOG lié depuis une plateforme externe (Epic) sans titre synchronisé côté Galaxy (`{"title": null}`) | ignoré et compté (`console.log`), pas d'insertion `raw_title` NULL — vérifié en direct : 10 jeux concernés sur la bibliothèque réelle |

## 8. Lacunes identifiées

- [x] **`OwnedGamesClient` (interface commune) : FAIT (2026-07-10)** —
  `src/providers/owned-games-client.ts`, Steam (`steamOwnedGamesClient`),
  Itch.io (`itchioOwnedGamesClient`), GOG (`gogOwnedGamesClient`) et Epic
  (`epicOwnedGamesClient`) l'implémentent tous.
- [x] **Itch.io : FAIT (2026-07-10)** — voir §2, API officielle vérifiée en
  direct.
- [x] **GOG : FAIT (2026-07-10)** — lecture de la base SQLite locale du
  client Galaxy (`src/providers/gog/gog-galaxy-db-client.ts`), pas de cookie
  de session (piste abandonnée, cf. §9). Le comptage historique de 1050 jeux
  incluait à tort des bibliothèques tierces agrégées par Galaxy. Depuis le
  2026-07-17, seules les release keys `gog_*` sont acceptées et le snapshot
  GOG remplace atomiquement les lignes précédentes.
- [x] **Epic : FAIT (2026-07-11)** — pas de client Epic maison rejouant le
  flow OAuth reverse-engineré ; s'appuie sur l'exécutable `legendary`
  (installé et authentifié manuellement par l'utilisateur, cf. §9), shell-out
  vers `legendary list --json` (`src/providers/epic/epic-legendary-client.ts`).
  Vérifié en direct : 408 jeux, 319 matchés. Complémentaire à GOG : les jeux
  Epic **non** connectés à un compte Galaxy passent par ce client.

## 9. Procédure d'obtention des identifiants (GOG, Epic)

### GOG : FAIT (2026-07-10)

Base locale GOG Galaxy retenue (cookie de session écarté — jeton fourni
insuffisant, un header `Cookie: nom=valeur` complet aurait été nécessaire,
non retesté). Schéma confirmé par inspection directe de
`galaxy-2.0.db` : `LibraryReleases` (releaseKey par utilisateur) jointe à
`GamePieces`/`GamePieceTypes` (`type='title'`, valeur JSON `{"title": ...}`)
donne le titre. Galaxy expose également des jeux liés depuis des plateformes
tierces (`epic_*`, `steam_*`) dans ces tables ; ils ne constituent pas une
possession GOG et sont donc exclus, tout en étant comptés dans le log du run.
Les lacunes de données ponctuelles
(`title: null`) sont traitées explicitement (§7). `replaceOwnedGamesForPlatform`
purge les anciennes lignes non présentes dans le dernier snapshot natif.

Piste écartée : cookie de session GOG (`embed.gog.com/user/data/games`).
Le jeton fourni était brut (pas un header `Cookie: nom=valeur` complet),
d'où un 302 vers le login — non retesté avec le bon format car la base
locale fonctionnait déjà et évite la fragilité d'un cookie qui expire.
Limite acceptée : ne fonctionne que sur une machine où Galaxy est installé
(pas un `fetch()` HTTP portable comme Steam/Itch.io).

### Epic Games Store : FAIT (2026-07-11)

Pas de mécanisme distant simple, et pas de client Epic maison écrit :
on s'appuie entièrement sur l'exécutable `legendary` (déjà installé et
authentifié par l'utilisateur), en shell-out. `legendary` gère lui-même
tout le flow OAuth reverse-engineré du launcher Epic — on ne rejoue rien.

1. `legendary auth --disable-webview` (le webview intégré,
   `AuthHost.exe`, plantait sur cette machine — probablement WebView2
   runtime manquant). Ouvre `https://legendary.gl/epiclogin` dans le
   navigateur ; après connexion, copier l'`authorizationCode` du JSON
   renvoyé et le coller à l'invite du terminal.
2. Session mise en cache localement par `legendary`
   (`C:\Users\<user>\.config\legendary\` sur Windows —
   `user.json`/`config.ini`, pas besoin d'y toucher directement).
3. `legendary list --json` retourne un tableau JSON, chaque entrée avec
   `app_name` (id externe) et `app_title` (titre) au niveau racine —
   directement exploitable, pas de reverse engineering des endpoints
   `legendary/api/egs.py` nécessaire.

**Risque assumé** : dépend de la présence de l'exécutable `legendary` et
d'une session valide en cache (renouvelable par `legendary auth`) — casse
si Epic change son flow d'auth (legendary devrait suivre, mais avec un
délai).
