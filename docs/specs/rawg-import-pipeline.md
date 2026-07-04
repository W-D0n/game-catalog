# Spec — Pipeline d'import RAWG (backfill)

> **Statut : IMPLÉMENTÉ.** Cette spec documente *a posteriori* le contrat du
> pipeline construit de façon incrémentale, puis durci (retry, terminaison).
> Elle sert de référence pour l'évolution (mode incrémental, autres providers).

## 1. Problème

Importer le catalogue RAWG complet dans PostgreSQL de façon **reprenable** (le
crawl dure des heures et peut être interrompu) et **résiliente** (l'API a des
défaillances transitoires).

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Page** | Une requête RAWG renvoyant jusqu'à `PAGE_SIZE` jeux. |
| **PAGE_SIZE** | Nombre de jeux par page = 40 (maximum autorisé par RAWG). |
| **Backfill** | Constitution initiale par crawl séquentiel des pages. |
| **import_state** | Table traçant la dernière page importée par provider. |
| **Défaillance transitoire** | Réponse non-2xx ou corps non-JSON momentané (502, rate-limit). |
| **Backoff exponentiel** | Délai d'attente croissant entre tentatives : 1s, 2s, 4s, 8s, 16s. |
| **Upsert** | INSERT avec `ON CONFLICT` — idempotent sur `(source, source_id)`. |

## 3. Acceptance criteria

**Reprise après interruption**
- Étant donné `import_state.last_page = 2876` pour `rawg`
- Quand on relance l'import
- Alors le crawl reprend à la page **2877**, sans re-traiter les pages précédentes.

**Résilience au transitoire**
- Étant donné une page qui renvoie un HTTP 502 puis un 200 à la tentative suivante
- Quand `fetchPage` est appelée
- Alors elle réessaie (jusqu'à 5 fois, backoff exponentiel) et retourne les jeux, sans crash.

**Échec persistant préserve la progression**
- Étant donné une page qui échoue 5 fois de suite
- Quand `fetchPage` épuise ses tentatives
- Alors elle lève une erreur avec contexte (numéro de page + dernière cause), et
  `import_state` conserve la dernière page réussie → la relance reprend au bon endroit.

**Terminaison propre**
- Étant donné une page renvoyant `results: []`
- Quand `fetchPage` la traite
- Alors elle retourne `[]`, et la boucle d'import s'arrête.

**Idempotence**
- Étant donné un jeu déjà présent en base
- Quand il est ré-importé
- Alors aucun doublon n'est créé (`ON CONFLICT (source, source_id)`), le titre est rafraîchi.

## 4. Pipeline de données

```
RAWG API (/api/games)
  → fetchPage(page)                 [retry + validation frontière]
  → deduplicateGames                [titre normalisé + année, intra-page]
  → upsert games                    [ON CONFLICT (source, source_id)]
  → savePlatforms                   [platforms + game_platforms]
  → saveLastPage(page)              [import_state]
```

## 5. Configuration

| Constante | Valeur | Justification |
|---|---|---|
| `PAGE_SIZE` | 40 | Maximum RAWG → minimise le nombre de requêtes (quota). |
| `DELAY_MS` | 500 | Délai entre pages, évite le throttling. |
| `MAX_RETRIES` | 5 | Couvre les blips transitoires sans boucle infinie. |
| backoff | `1000 * 2^(n-1)` ms | Laisse le temps à un rate-limit de se réinitialiser. |

## 6. Effets de bord

`fetchPage` — **lit** : RAWG API. Pure sinon (pas d'écriture).
Boucle d'import — **écrit** : `games`, `platforms`, `game_platforms`, `import_state`.

## 7. Taxonomie d'erreurs

| Catégorie | Exemple | Traitement |
|---|---|---|
| Système (transitoire) | HTTP 429, 5xx, corps non-JSON momentané | retry + backoff (5x) |
| Système (permanent) | HTTP 4xx hors 429 | `ProviderError`, levé immédiatement sans retry |
| Quota / auth | HTTP 401, 403 | `ProviderQuotaError` → arrêt **propre** du service, progression préservée |
| Domaine | `released` absent | `releaseYear = null`, le jeu est tout de même importé |

## 8. Idempotence des mutations

- **games** : idempotent via `ON CONFLICT (source, source_id) DO UPDATE`.
- **platforms** : idempotent via `ON CONFLICT (name)`.
- **game_platforms** : idempotent via `ON CONFLICT DO NOTHING`.
- **import_state** : idempotent via `ON CONFLICT (provider) DO UPDATE`.
- Relancer l'import deux fois ne crée aucun doublon ni effet de bord cumulatif.

## 9. Lacunes identifiées

- [x] **Quota mensuel** : plan gratuit RAWG = 20 000 requêtes/mois (~800 000 jeux/mois
  à `PAGE_SIZE=40`). Détection implémentée **par classe de statut** : 401/403 →
  `ProviderQuotaError` → arrêt propre du service, progression préservée. **Code HTTP
  confirmé en conditions réelles le 2026-07-04** : `401` avec le corps
  `{"error": "The monthly API limit reached"}` — atteint après le backfill complet
  (page 20062/~22500, ~802 480 jeux). La gestion par classe (401/403) reste justifiée
  même si seul 401 a été observé.
- [ ] **Terminaison non vérifiée en conditions réelles** : on suppose que RAWG
  renvoie `results: []` (HTTP 200) au-delà de la dernière page. Si c'est une
  erreur HTTP à la place, la fin de catalogue déclenchera un échec persistant
  récurrent. À valider quand on approchera du bout (~22 500 pages).
- [ ] **Déduplication intra-page seulement** : `deduplicateGames` dédoublonne une
  page, mais RAWG ayant des `source_id` uniques, l'upsert gère déjà l'idempotence.
  La passe de dédup est donc largement redondante en mono-source — utile seulement
  pour la future déduplication multi-sources (voir [multi-source-matching](multi-source-matching.md)).
