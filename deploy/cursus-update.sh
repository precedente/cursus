#!/bin/sh
# Haalt nieuwe versies van GitHub op en herstart de API als die veranderd is.
# Draait elke minuut via cursus-update.timer.
set -eu

cd /srv/cursus
voor="$(git rev-parse HEAD)"
git pull --ff-only -q
na="$(git rev-parse HEAD)"

if [ "$voor" != "$na" ]; then
  echo "Bijgewerkt: $(git log -1 --format='%h %s')"
  if git diff --name-only "$voor" "$na" | grep -q '^api/'; then
    systemctl restart larixa-api
    echo "API herstart"
  fi
fi
