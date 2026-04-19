-- Guild settings (per server config)
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id       TEXT PRIMARY KEY,
  dj_role_id     TEXT,
  vote_threshold REAL DEFAULT 0.51,
  auto_leave_s   INTEGER DEFAULT 300,
  default_volume INTEGER DEFAULT 80,
  created_at     INTEGER DEFAULT (unixepoch())
);

-- User playlists
CREATE TABLE IF NOT EXISTS playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   TEXT NOT NULL,
  guild_id   TEXT,
  name       TEXT NOT NULL,
  is_public  INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(owner_id, name)
);

-- Tracks within playlists
CREATE TABLE IF NOT EXISTS playlist_tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  duration_ms INTEGER,
  thumbnail   TEXT,
  track_order REAL NOT NULL,
  added_at    INTEGER DEFAULT (unixepoch())
);

-- Uploaded local files
CREATE TABLE IF NOT EXISTS local_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL,
  filepath    TEXT NOT NULL,
  title       TEXT,
  duration_ms INTEGER,
  uploaded_at INTEGER DEFAULT (unixepoch())
);

-- Web dashboard sessions
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

-- Indexes for frequent lookups
CREATE INDEX IF NOT EXISTS idx_playlists_owner ON playlists(owner_id);
CREATE INDEX IF NOT EXISTS idx_playlists_guild ON playlists(guild_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
