#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
umask 077
mkdir -p private
chmod 700 private

for path in database.env redis.env studio.env temporal-db.env temporal.env; do
  if [[ -e private/$path ]]; then
    printf 'Private configuration already exists: %s\n' "$path" >&2
    exit 1
  fi
done

database_password=$(openssl rand -hex 32)
temporal_password=$(openssl rand -hex 32)
redis_password=$(openssl rand -hex 32)
jwt_secret=$(openssl rand -hex 48)
printf 'POSTGRES_PASSWORD=%s\n' "$database_password" > private/database.env
printf 'POSTGRES_PASSWORD=%s\n' "$temporal_password" > private/temporal-db.env
printf 'POSTGRES_PWD=%s\n' "$temporal_password" > private/temporal.env
printf 'REDIS_PASSWORD=%s\n' "$redis_password" > private/redis.env
printf 'JWT_SECRET=%s\nDATABASE_URL=postgresql://postiz:%s@database:5432/postiz?connection_limit=8\nREDIS_URL=redis://:%s@redis:6379\n' \
  "$jwt_secret" "$database_password" "$redis_password" > private/studio.env
