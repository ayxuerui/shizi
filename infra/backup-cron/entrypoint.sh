#!/bin/sh
# harden-event-store: installs dependencies into the bind-mounted deploy
# clone on first run only (node_modules isn't part of that clone by
# default — it's never been needed there before this container), then
# runs the cron daemon in the foreground as PID 1. Deliberately does
# this at container START, not baked in at image build time: the code
# that actually runs every day is whatever commit /repo is CURRENTLY on,
# never a separately-built, potentially-stale copy.
set -eu

cd /repo

if [ ! -d node_modules ]; then
  echo "entrypoint: installing dependencies into the bind-mounted deploy clone (first run only)..."
  npm ci
fi

exec cron -f
