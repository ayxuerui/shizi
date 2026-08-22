# harden-event-store: dockerized daily backup — a cron daemon running
# inside a container, rather than an entry in the host's own system
# crontab, so the schedule and its run history are inspectable with
# ordinary Docker tooling (`docker exec shizi-backup-cron cat
# /etc/cron.d/shizi-backup`, `docker logs shizi-backup-cron`) instead of
# needing host access to run `crontab -l`. The user's own explicit
# direction, superseding this change's earlier decision to reuse the
# host's existing `pkm-maintenance` crontab idiom — see design.md.
#
# Deliberately reuses the SAME real host state the human release
# workflow already depends on — the deploy clone, the deploy key, the
# fixed-path event store from section 1 — via bind mounts
# (docker-compose.yml), rather than maintaining a second internal git
# clone or duplicating credentials into the image. `npm ci` runs into
# the bind-mounted clone at container start if `node_modules` is
# missing (see entrypoint.sh) — not baked in here at build time — so the
# code that actually runs always matches whatever commit that clone is
# currently on, never a separately-built, staler copy.
FROM node:22-bookworm-slim

# git/openssh-client: this container commits and pushes for real.
# python3/make/g++: better-sqlite3 (pulled in transitively via
# infra/sync-service's own dependency) needs a native build toolchain to
# install — same requirement infra/sync-service/Dockerfile already has.
# cron: the actual scheduler.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
         git openssh-client cron python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && ssh-keyscan -t ed25519 github.com >>/etc/ssh/ssh_known_hosts

COPY infra/backup-cron/crontab /etc/cron.d/shizi-backup
RUN chmod 0644 /etc/cron.d/shizi-backup

COPY infra/backup-cron/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
