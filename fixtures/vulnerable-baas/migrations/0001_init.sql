CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT
);
