CREATE TABLE games (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    release_year INTEGER,
    slug TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source, source_id)
);

CREATE TABLE platforms (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE game_platforms (
    game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
    platform_id BIGINT REFERENCES platforms(id) ON DELETE CASCADE,
    PRIMARY KEY(game_id, platform_id)
);

CREATE TABLE import_state (
    provider TEXT PRIMARY KEY,
    last_page INTEGER NOT NULL DEFAULT 0
);
