#!/usr/bin/env bash
set -euo pipefail
umask 077
cd -- "$(dirname -- "$0")"

mountpoint -q /mnt/storage-box
base=/mnt/storage-box/backups/postiz-confenge
mkdir -p "$base"
exec 9>/run/lock/postiz-confenge-backup.lock
flock -n 9

stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=$(mktemp -d "$base/.pending-${stamp}-XXXXXX")
trap '[[ -z "$stage" ]] || rm -rf -- "$stage"' EXIT

uploads=$(docker volume inspect --format '{{.Mountpoint}}' postiz-confenge_uploads)
config=$(docker volume inspect --format '{{.Mountpoint}}' postiz-confenge_config)
image=$(docker inspect --format '{{.Image}}' "$(docker compose ps -q studio)")
docker image inspect --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "$image" > "$stage/image.txt"
media_kib=$(du -sk -- "$uploads" "$config" | awk '{total+=$1} END {print total}')
free_kib=$(df -Pk -- "$base" | awk 'NR==2 {print $4}')
if (( free_kib < media_kib + 5 * 1024 * 1024 )); then
  printf 'Storage Box com espaço insuficiente para um novo backup do Estúdio.\n' >&2
  exit 1
fi

docker compose exec -T database pg_dump -U postiz -Fc postiz > "$stage/postiz.dump"
for database in temporal temporal_visibility; do
  docker compose exec -T temporal-database pg_dump -U temporal -Fc "$database" \
    > "$stage/$database.dump"
done
tar -czf "$stage/uploads.tar.gz" -C "$uploads" .
tar -czf "$stage/config.tar.gz" -C "$config" .
docker compose exec -T redis sh -ec '
  file=$(mktemp)
  trap "rm -f -- \"\$file\"" EXIT
  REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --rdb "$file" >&2
  redis-check-rdb "$file" >&2
  cat "$file"
' > "$stage/redis.rdb"

(
  cd "$stage"
  for archive in *.dump; do
    docker compose --project-directory /opt/postiz-confenge exec -T database \
      pg_restore --file=/dev/null < "$archive"
  done
  tar -tzf uploads.tar.gz >/dev/null
  tar -tzf config.tar.gz >/dev/null
  sha256sum *.dump *.tar.gz redis.rdb image.txt > SHA256SUMS
  sha256sum --check --status SHA256SUMS
)
mv -T -- "$stage" "$base/$stamp"
stage=

# Retain seven verified snapshots. Match only this script's completed directories.
mapfile -t expired < <(
  find "$base" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' |
    awk '/^[0-9]{8}T[0-9]{6}Z$/' | sort -r | tail -n +8
)
for old in "${expired[@]}"; do
  [[ -f "$base/$old/SHA256SUMS" ]] && rm -rf -- "$base/$old"
done
printf 'Backup validado em %s\n' "$base/$stamp"
