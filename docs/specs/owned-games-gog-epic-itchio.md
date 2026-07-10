# Spec — Clients bibliothèque possédée GOG / Epic Games Store / Itch.io

> **Statut : CONCEPTION.** Pas de code écrit. Dépend de
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
| Infra | cookie de session GOG expiré | HTTP 401/redirection login → exception explicite, pas de bibliothèque vide silencieuse |
| Infra | device code Epic expiré/révoqué | échec explicite à l'étape d'auth, avant tout appel entitlements |

## 8. Lacunes identifiées

- [x] **`OwnedGamesClient` (interface commune) : FAIT (2026-07-10)** —
  `src/providers/owned-games-client.ts`, Steam (`steamOwnedGamesClient`) et
  Itch.io (`itchioOwnedGamesClient`) l'implémentent tous les deux.
- [x] **Itch.io : FAIT (2026-07-10)** — voir §2, API officielle vérifiée en
  direct.
- [ ] **GOG et Epic non implémentés** : faisabilité confirmée (§2, §9) mais
  aucun jeton/cookie disponible pour vérifier en direct (2026-07-10) —
  implémentation différée jusqu'à ce que les identifiants soient fournis
  (voir §9 pour la procédure d'obtention).

## 9. Procédure d'obtention des identifiants (GOG, Epic)

Investiguée le 2026-07-10, non exécutée (aucun identifiant en main à ce
stade) — à suivre avant de coder le client correspondant.

### GOG

Deux mécanismes possibles, à départager une fois testés :

1. **Base locale GOG Galaxy (préférée si le script tourne sur cette
   machine)** — le client GOG Galaxy stocke sa bibliothèque dans un fichier
   SQLite local (`%ProgramData%\GOG.com\Galaxy\storage\galaxy-2.0.db`,
   confirmé par les forums GOG et l'outil communautaire `g-export`, qui lit
   ce fichier directement plutôt que d'appeler une API distante). Aucune
   authentification réseau nécessaire, mais dépend de la présence du client
   Galaxy installé et à jour sur la machine qui exécute le script — modèle
   différent de Steam/Itch.io (pas un `fetch()` HTTP, un accès fichier
   local). Schéma exact des tables (nom de la table listant les jeux
   possédés) non confirmé — à extraire par inspection directe du fichier
   une fois localisé.
2. **Cookie de session GOG (`embed.gog.com/user/data/games`)** — se
   connecter à gog.com dans un navigateur, extraire le cookie de session
   depuis les devtools, le fournir en variable d'environnement
   (`GOG_SESSION_COOKIE`). Fragile (expire, non documenté officiellement),
   mais fonctionne indépendamment de la machine (pas besoin du client
   Galaxy installé).

**Décision à prendre avant d'implémenter** : lire la base locale (fiable
tant que Galaxy est installé ici) ou le cookie de session (portable mais
fragile) — pas les deux d'emblée (zéro code préventif).

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
