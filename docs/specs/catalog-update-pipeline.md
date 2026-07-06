# Spec — Pipeline de mise à jour incrémentale du catalogue

> **Statut : IMPLÉMENTÉ pour IGDB (2026-07-06).** RAWG reste différé (quota
> bloqué jusqu'au 2026-08-01, mécanisme de filtre par date non vérifié).

## 1. Problème

Le pipeline actuel ne fait que des crawls complets ponctuels : backfill RAWG
jusqu'à épuisement de quota, backfill IGDB jusqu'au curseur maximal connu
(cf. [rawg-import-pipeline](rawg-import-pipeline.md), `docs/inbox.md`). Rien
ne capte, après ce backfill initial :

1. les jeux **nouvellement publiés** sur RAWG/IGDB depuis le dernier crawl ;
2. les **changements de métadonnées** d'un jeu déjà en base (date de sortie
   confirmée après un TBA, nouvelle cover, résumé mis à jour, etc.).

Sans ça, le catalogue devient obsolète au fil du temps — problème direct
pour [myvault-integration](myvault-integration.md), qui a besoin d'un
catalogue à jour pour sa page bibliothèque.

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Backfill** | Crawl initial complet, déjà implémenté (hors scope de cette spec). |
| **Sweep incrémental** | Passe périodique qui (1) récupère les nouveaux jeux depuis le dernier backfill/sweep, (2) rafraîchit les jeux existants modifiés depuis le dernier sweep. |
| **`updated_at` (IGDB)** | Champ retourné par l'API IGDB indiquant la dernière modification d'un jeu — **présence et fiabilité non vérifiées en conditions réelles** (cf. lacunes). |
| **`updated` (RAWG)** | Champ documenté sur l'endpoint liste `/api/games` (confirmé présent lors de l'investigation media du 2026-07-06) — mécanisme de filtre serveur associé non vérifié. |
| **`import_state.last_update_check`** | Nouveau curseur temporel (timestamp), distinct de `last_cursor` (qui reste la position du backfill, terminé et figé). |

## 3. Acceptance criteria

**Nouveaux jeux détectés (IGDB)**
- Étant donné `import_state.igdb.last_cursor` au max connu du backfill
- Quand un sweep est lancé
- Alors `fetchPage(cursor=last_cursor)` (mécanisme déjà existant, pagination
  par id) capte tout nouvel id publié depuis — aucun nouveau code de
  récupération, juste une relance périodique du même point d'entrée.

**Jeux modifiés détectés (IGDB)**
- Étant donné un jeu déjà en base, modifié côté IGDB depuis le dernier sweep
- Quand le sweep interroge `where updated_at > last_update_check`
- Alors ce jeu est re-fetché et son `raw_metadata` rafraîchi (upsert existant,
  `ON CONFLICT ... DO UPDATE`).

**Pas de recalcul complet de la projection canonique**
- Étant donné un sweep qui ne touche que 50 jeux (nouveaux + modifiés)
- Quand `build-canonical-projection` est relancé après le sweep
- Alors seuls ces 50 jeux sont (re)traités — pas un recalcul de tout le
  catalogue (déjà garanti pour les nouveaux jeux par le filtre
  `canonical_id IS NULL` existant ; **nécessite un geste explicite pour les
  jeux modifiés**, cf. §5).

**Échec préserve la progression**
- Étant donné un sweep qui échoue (timeout, quota)
- Quand l'échec survient
- Alors `last_update_check` n'avance PAS (reste à sa valeur précédente) —
  même principe que la préservation de `last_cursor` sur échec du backfill.

## 4. Pipeline

```
Sweep incrémental (par provider)
  → fetchNewGames(cursor=last_cursor)            [existant, réutilisé tel quel]
  → fetchUpdatedGames(since=last_update_check)    [NOUVEAU — filtre par date, à vérifier par provider]
  → upsert games (ON CONFLICT existant, idempotent)
  → pour les jeux MODIFIÉS déjà liés : canonical_id = NULL  [force le re-matching, cf. §5]
  → saveLastUpdateCheck(now)
  → build-canonical-projection (déjà incrémental sur canonical_id IS NULL)
```

## 5. Décision clé : ré-enrichissement des jeux modifiés

`build-canonical-projection.ts` ne traite que les jeux dont `canonical_id
IS NULL` (incrémentalité déjà en place, voir `docs/specs/multi-source-matching.md`).
Pour qu'un jeu **modifié** (déjà lié) soit ré-enrichi (nouveau genre, nouvelle
société, media rafraîchi propagé jusqu'au canonical export), il faut
explicitement remettre son `canonical_id` à `NULL` avant de relancer la
projection — sinon la projection incrémentale l'ignore par construction.

C'est un effet de bord **assumé et documenté ici**, pas un contournement
caché : le sweep, et lui seul, a le droit de faire ce reset ciblé (sur les
jeux qu'il vient lui-même de modifier), jamais un reset en masse.

## 6. Taxonomie d'erreurs

| Catégorie | Exemple | Traitement |
|---|---|---|
| Système (transitoire) | timeout API pendant le sweep | retry existant (5x, backoff exponentiel) réutilisé tel quel |
| Quota / auth | 401/403 pendant le sweep | `ProviderQuotaError`, arrêt propre, `last_update_check` **non avancé** |
| Domaine | `updated_at`/`updated` absent sur un jeu | traité comme "jamais modifié depuis le backfill", ignoré du sweep incrémental, pas d'erreur |

## 7. Lacunes identifiées

- [x] **IGDB : `updated_at` vérifié en conditions réelles (2026-07-06)** —
  champ présent, `where updated_at > X & id > Y` filtre et pagine
  correctement. `IgdbProvider.fetchUpdatedSince` implémenté. Sweep live
  testé avec une fenêtre de 2h : 2143 jeux modifiés détectés, ré-enrichis
  avec succès (1849 nouveaux canonical games, 290 étendus).
- [ ] **RAWG : mécanisme de filtre par date de mise à jour** non vérifié —
  le champ `updated` existe dans les réponses documentées, mais un filtre
  serveur dédié (`ordering=-updated` vs un paramètre `updated_since`) reste
  à confirmer sur la documentation RAWG à jour. De toute façon bloqué par
  le quota jusqu'au 2026-08-01.
- [ ] **Fréquence d'exécution** du sweep non tranchée (manuel via
  `bun run`, ou scheduler externe/cron) — dépend d'une infra de déploiement
  non définie pour ce projet, hors scope technique de cette spec.
- [ ] **Suppressions non détectées** : un jeu retiré d'IGDB/RAWG resterait
  en base indéfiniment — accepté comme lacune, cohérent avec le principe
  déjà établi après l'incident TRUNCATE (préférer la sur-couverture à la
  perte de données, cf. `docs/specs/safety-guardrails.md`).
