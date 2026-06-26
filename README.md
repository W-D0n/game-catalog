# game-catalog

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

@'
# Game Catalog

Catalogue de jeux vidéo destiné à agréger plusieurs sources :

- RAWG
- IGDB
- MobyGames
- Steam

Objectifs :

- Centraliser les métadonnées
- Dédupliquer les jeux
- Exporter vers JSON / CSV
- Alimenter une future webapp

Les données téléchargées ne sont pas versionnées.
'@ | Set-Content README.md
