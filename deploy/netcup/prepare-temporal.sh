#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
docker compose up -d --wait --wait-timeout 170 temporal

temporal_cli() {
  docker compose exec -T temporal temporal --address temporal:7233 "$@"
}

# These attributes contain IDs. PostgreSQL limits the number of Text fields,
# and auto-setup may already use those slots for its example attributes.
for name in organizationId postId; do
  attributes=$(temporal_cli operator search-attribute list --namespace default)
  if ! awk -v name="$name" '$1 == name { found = 1 } END { exit !found }' <<< "$attributes"; then
    temporal_cli operator search-attribute create --namespace default --name "$name" --type Keyword
  fi
done
