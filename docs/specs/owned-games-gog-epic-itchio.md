# Spec — Clients bibliothèque possédée GOG / Epic Games Store / Itch.io

> **Statut : Itch.io et GOG implémentés (2026-07-10).** Epic reste en
> conception (aucun identifiant fourni). Dépend de
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
  Itch.io (`itchioOwnedGamesClient`) et GOG (`gogOwnedGamesClient`)
  l'implémentent tous.
- [x] **Itch.io : FAIT (2026-07-10)** — voir §2, API officielle vérifiée en
  direct.
- [x] **GOG : FAIT (2026-07-10)** — lecture de la base SQLite locale du
  client Galaxy (`src/providers/gog/gog-galaxy-db-client.ts`), pas de cookie
  de session (piste abandonnée, cf. §9). Vérifié en direct : 1050 jeux
  exportés, 948 matchés (dont des jeux Epic connectés à Galaxy — Galaxy
  agrège aussi les bibliothèques de plateformes tierces liées au compte).
- [ ] **Epic (hors Galaxy) non implémenté** : faisabilité confirmée (§2, §9)
  mais aucun jeton disponible pour vérifier en direct (2026-07-10) — reste
  pertinent pour les comptes Epic non connectés à un client GOG Galaxy.

## 9. Procédure d'obtention des identifiants (GOG, Epic)

### GOG : FAIT (2026-07-10)

Base locale GOG Galaxy retenue (cookie de session écarté — jeton fourni
insuffisant, un header `Cookie: nom=valeur` complet aurait été nécessaire,
non retesté). Schéma confirmé par inspection directe de
`galaxy-2.0.db` : `LibraryReleases` (releaseKey par utilisateur) jointe à
`GamePieces`/`GamePieceTypes` (`type='title'`, valeur JSON `{"title": ...}`)
donne le titre. Fonctionne aussi pour les jeux liés depuis des plateformes
tierces connectées à Galaxy (Epic notamment, préfixe `releaseKey` différent
— `epic_...`), avec des lacunes de données ponctuelles (`title: null`)
traitées explicitement (§7).

Piste écartée : cookie de session GOG (`embed.gog.com/user/data/games`).
Le jeton fourni était brut (pas un header `Cookie: nom=valeur` complet),
d'où un 302 vers le login — non retesté avec le bon format car la base
locale fonctionnait déjà et évite la fragilité d'un cookie qui expire.
Limite acceptée : ne fonctionne que sur une machine où Galaxy est installé
(pas un `fetch()` HTTP portable comme Steam/Itch.io).

### Epic Games Store

Pas de mécanisme distant simple. La seule voie connue passe par le flow
d'authentification reverse-engineré du launcher Epic, tel qu'implémenté par
le projet open-source `legendary` :

1. Installer/lancer `legendary auth` (ou suivre son flow manuellement) —
   ouvre la page de login Epic dans un navigateur.
2. Après connexion, Epic renvoie une réponse JSON contenant un
   `authorizationCode` à copier.
3. `legendary` échange ce code contre un jeton d'accès (OAuth, client id du
   launcher officiel) et le stocke dans sa config locale
   (`~/.config/legendary/config.ini` sous Linux — emplacement Windows non
   confirmé).
4. Le jeton obtenu permettrait d'appeler les mêmes endpoints d'entitlements
   que `legendary list` — endpoints non documentés officiellement, à
   observer via le code source de `legendary` (`legendary/api/egs.py`) au
   moment de l'implémentation plutôt que supposés à l'avance.

**Risque assumé** : ce jeton dépend du client id du launcher Epic — casse
sans préavis si Epic change son flow d'auth (déjà arrivé par le passé,
cf. historique des commits de `legendary`).
