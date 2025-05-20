-- Description: This file contains the SQL schema for the NES database.
-- Note: we use camelCase for keys and PascalCase for tables.

-- The metadata table will be used to store the version and system information.
CREATE TABLE Metadata
(
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT             NOT NULL
);

-- The tags table will be used to store the tags that will be used to categorize the games.
CREATE TABLE Tags
(
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    CONSTRAINT uniqueTagName UNIQUE (name)
);

CREATE TABLE Languages
(
    id   INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE Regions
(
    id   INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

-- System tags.
CREATE TABLE SystemTags
(
    id     INTEGER PRIMARY KEY,
    tagsId INTEGER REFERENCES Tags (id),
    CONSTRAINT uniqueTag UNIQUE (id, tagsId)
);

-- The identification database itself. Will be populated from the games.json file.
CREATE TABLE GamesId
(
    id            INTEGER PRIMARY KEY,
    fullname      TEXT UNIQUE NOT NULL,
    title         TEXT,
    originalTitle TEXT,
    year          INTEGER
);

CREATE TABLE GamesSources
(
    id        INTEGER PRIMARY KEY,
    gamesId   INTEGER REFERENCES GamesId (id),
    extension TEXT NOT NULL,
    sha256    BLOB NOT NULL,
    size      INTEGER
);

CREATE TABLE GamesTags
(
    id      INTEGER PRIMARY KEY,
    gamesId INTEGER REFERENCES GamesId (id),
    tagsId  INTEGER REFERENCES Tags (id),
    CONSTRAINT uniqueTag UNIQUE (gamesId, tagsId)
);

CREATE TABLE GamesLanguages
(
    id          INTEGER PRIMARY KEY,
    gamesId     INTEGER REFERENCES GamesId (id),
    languagesId INTEGER REFERENCES Languages (id),
    CONSTRAINT uniqueLanguage UNIQUE (gamesId, languagesId)
);

CREATE TABLE GamesRegions
(
    id        INTEGER PRIMARY KEY,
    gamesId   INTEGER REFERENCES GamesId (id),
    regionsId INTEGER REFERENCES Regions (id),
    CONSTRAINT uniqueRegion UNIQUE (gamesId, regionsId)
);

CREATE TABLE Playlists
(
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE PlaylistsGamesId
(
    playlistsId INTEGER REFERENCES Playlists (id),
    gamesId     INTEGER REFERENCES GamesId (id),
    priority    INTEGER,
    CONSTRAINT uniquePlaylistsGamesSources UNIQUE (playlistsId, gamesId)
);
