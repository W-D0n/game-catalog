# Spec — Modèle de bibliothèque cross-plateforme

> **Statut : CONCEPTION.** Pas de code écrit. Fondation pour
> [catalog-update-pipeline](catalog-update-pipeline.md),
> [archipelago-compatibility](archipelago-compatibility.md) et
> [myvault-integration](myvault-integration.md), qui en dépendent tous.

## 1. Problème

Aujourd'hui, chaque export de bibliothèque possédée (`export-steam-library.ts`,
`export-steam-wishlist.ts`, `cross-steam-libraries.ts`) recalcule le matching
titre → canonical game **à la volée, en mémoire, à chaque exécution** — la
même logique (`normalizeMatchingTitle` + désambiguïsation par plateforme PC)
est dupliquée dans les trois fichiers. Le lien n'est jamais persisté en base
pour les jeux possédés, contrairement aux jeux `games` (import RAWG/IGDB) dont
le `canonical_id` est stocké une fois pour toutes.

Conséquences concrètes :
- Impossible de faire une requête SQL directe du type "ma bibliothèque
  possédée avec son média" — il faut repasser par du code applicatif.
- Ajouter une nouvelle plateforme de possession (GOG, Epic, Itch.io — idée
  notée dans `docs/inbox.md`) impliquerait un quatrième fichier avec sa
  propre copie de la logique de matching.
- Un même jeu possédé sur deux plateformes (ex: Half-Life sur Steam et GOG)
  n'a aujourd'hui aucun moyen d'être reconnu comme "le même jeu" au niveau
  bibliothèque possédée (seul le catalogue RAWG/IGDB a cette notion via
  `canonical_id`).

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Plateforme de possession** | Steam, GOG, Epic Games Store, Itch.io — distinct de `games.platforms` (PC/PS5/etc, déjà utilisé pour le catalogue RAWG/IGDB). |
| **`owned_games`** | Table cible : un jeu possédé sur une plateforme donnée, identifié par un id externe (appid Steam, product id GOG...). |
| **Matching bibliothèque** | Association `owned_games.canonical_id` — persistée une fois calculée, jamais recalculée à l'export (contrairement à l'existant). |

## 3. Acceptance criteria

**Pas de duplication de logique par plateforme**
- Étant donné l'ajout futur d'un provider GOG
- Quand on importe la bibliothèque GOG
- Alors le matching réutilise le même service `matchOwnedGames()` que Steam —
  aucun nouveau fichier ne réimplémente `normalizeMatchingTitle` + désambiguïsation PC.

**Matching persisté et incrémental**
- Étant donné un `owned_game` déjà matché (`canonical_id` renseigné)
- Quand `matchOwnedGames()` est relancé
- Alors ce jeu n'est pas retraité (comme `build-canonical-projection.ts`,
  qui ne traite que `canonical_id IS NULL`).

**Un jeu, plusieurs plateformes, un seul canonical_id**
- Étant donné Half-Life possédé à la fois sur Steam et sur GOG
- Quand les deux bibliothèques sont matchées
- Alors les deux `owned_games` (plateformes différentes) pointent vers le
  même `canonical_games.id`.

**Requête directe possible**
- Étant donné une bibliothèque possédée déjà matchée
- Quand on veut lister "mes jeux avec leur média"
- Alors un simple JOIN `owned_games` → `canonical_games` (+ lookup média déjà
  exposé par `getCanonicalGamesForExport`) suffit, sans code de matching à l'export.

## 4. Modèle de données (cible — NON implémenté)

```sql
CREATE TABLE owned_games (
    id BIGSERIAL PRIMARY KEY,
    platform TEXT NOT NULL,        -- 'steam', 'gog', 'epic', 'itchio'
    external_id TEXT NOT NULL,     -- appid Steam, product id GOG, etc. (TEXT pour rester générique)
    raw_title TEXT NOT NULL,
    canonical_id BIGINT REFERENCES canonical_games(id) ON DELETE SET NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(platform, external_id)
);

CREATE INDEX idx_owned_games_canonical_id ON owned_games (canonical_id);
```

> **Migration** : `steam_library_games` (bibliothèque personnelle, en prod)
> et `steam_player_games` (croisement multi-utilisateurs, en prod) sont deux
> préoccupations distinctes de `owned_games` :
> - `steam_library_games` est un cas particulier de `owned_games`
>   (`platform='steam'`, un seul propriétaire — moi). Migration possible à
>   terme, mais **non détaillée ici** (script de migration, compatibilité
>   avec `enrich-rawg-library.ts`/`export-steam-library.ts` existants —
>   cf. lacunes).
> - `steam_player_games` sert au croisement entre comptes tiers, pas à ma
>   bibliothèque de référence — reste distinct pour l'instant, pourrait
>   migrer plus tard si le besoin de média par jeu croisé se confirme.

## 5. Algorithme de matching (persistant, incrémental)

Nouveau service `matchOwnedGames()`, calqué sur `build-canonical-projection.ts` :

1. Sélectionner `owned_games WHERE canonical_id IS NULL`.
2. Pour chaque jeu non matché : `normalizeMatchingTitle(raw_title)`, chercher
   les `canonical_games` candidats par titre normalisé (index en mémoire,
   comme l'existant).
3. Désambiguïser par plateforme PC si plusieurs candidats (même heuristique
   qu'`export-steam-library.ts` aujourd'hui — `isPcCandidate`).
4. 0 ou plusieurs candidats sans qu'un seul soit clairement retenu → laissé
   non lié (`canonical_id` reste `NULL`), loggé — cohérent avec le
   traitement des jeux ambigus dans `build-canonical-projection.ts`.

## 6. Effets de bord

`matchOwnedGames()` — **lit** `canonical_games` (déjà en mémoire, un seul
chargement). **Écrit** `owned_games.canonical_id`.

## 7. Taxonomie d'erreurs

| Catégorie | Exemple | Traitement |
|---|---|---|
| Domaine | jeu possédé introuvable dans le catalogue canonique | `canonical_id` reste `NULL`, pas d'erreur |
| Domaine | plusieurs candidats ambigus, aucun clairement PC | laissé non lié, loggé |

## 8. Lacunes identifiées

- [ ] **Migration concrète de `steam_library_games`/`steam_player_games`
  vers `owned_games`** non détaillée (script, compatibilité descendante
  avec `enrich-rawg-library.ts`) — à faire au moment de l'implémentation.
- [ ] **GOG/Epic/Itch.io** : aucun provider n'existe encore (idée séparée
  dans l'inbox). `owned_games` est conçu pour les accueillir mais
  l'implémentation des clients API de ces plateformes reste hors scope ici.
- [ ] **Média** : `owned_games` ne stocke pas de média directement — hérite
  de celui du `canonical_game` lié (déjà exposé par
  `getCanonicalGamesForExport`). Tant qu'un jeu possédé n'est pas matché,
  aucun média n'est disponible pour lui.
