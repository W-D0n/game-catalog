# game-catalog — Overview

## Vision

Construire une base de données de référence de jeux vidéo la plus exhaustive possible,
en agrégeant plusieurs sources (RAWG, IGDB, MobyGames), dédupliquée et normalisée,
exportable en JSON et requêtable via PostgreSQL.

## Objectif final

Une base locale de plusieurs centaines de milliers de jeux, utilisable comme
source de données pour une future application (SvelteKit envisagé).

## Sources de données

| Source | Statut | Notes |
|---|---|---|
| RAWG | En cours | ~500 000 jeux, plan gratuit 20 000 req/mois |
| IGDB | Prévu | OAuth Twitch requis, base très complète |
| MobyGames | Prévu | Bonne couverture rétro |

## Pipeline

```
API externe
  → Provider (fetchPage)
  → Déduplication (titre normalisé + année)
  → PostgreSQL (games + platforms + game_platforms)
  → Export JSON
```

## Jalons

- [x] 10 jeux importés
- [x] Pipeline complet fonctionnel
- [x] Reprise sur interruption (import_state)
- [ ] 1 000 jeux
- [ ] 10 000 jeux
- [ ] Import IGDB
- [ ] 100 000 jeux
