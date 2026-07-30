#!/bin/sh
set -eu

export PGPASSWORD="${POSTGRES_PASSWORD}"
DATABASE_URL="postgresql://${POSTGRES_USER}@postgres:5432/${POSTGRES_DB}"

# A fresh PostgreSQL container briefly starts and stops a temporary server
# while creating the configured database. Wait for the final authenticated
# database before applying any migration so first-time installations cannot
# race that restart.
attempt=0
until psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 30 ]; then
    echo "PostgreSQL was not ready after ${attempt} attempts." >&2
    exit 1
  fi
  echo "Waiting for the final PostgreSQL startup (${attempt}/30)..."
  sleep 2
done

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

bootstrap_tables="$(psql "${DATABASE_URL}" -Atc \
  "SELECT to_regclass('public.roles') IS NOT NULL
      AND to_regclass('public.users') IS NOT NULL")"

bootstrap_ready="f"
if [ "${bootstrap_tables}" = "t" ]; then
  bootstrap_ready="$(psql "${DATABASE_URL}" -Atc \
    "SELECT EXISTS (SELECT 1 FROM roles) AND EXISTS (SELECT 1 FROM users)")"
fi

if [ "${bootstrap_ready}" = "t" ]; then
  for bootstrap in 001_schema.sql 002_seed.sql; do
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c \
      "INSERT INTO schema_migrations(filename) VALUES ('${bootstrap}') ON CONFLICT DO NOTHING"
  done
fi

for migration in /migrations/*.sql; do
  filename="$(basename "${migration}")"
  applied="$(psql "${DATABASE_URL}" -Atc \
    "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename='${filename}')")"
  if [ "${applied}" = "t" ]; then
    echo "Skipping ${filename}; already applied."
    continue
  fi

  echo "Applying ${filename}..."
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 --single-transaction -f "${migration}"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO schema_migrations(filename) VALUES ('${filename}')"
done
