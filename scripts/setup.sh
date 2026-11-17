#!/usr/bin/env bash
# scripts/setup.sh — one-shot local dev setup for PennTools
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▶ $*${NC}"; }
success() { echo -e "${GREEN}✔ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
die()     { echo -e "${RED}✖ $*${NC}" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/web/.env.local"

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
info "Checking prerequisites..."

install_hint() {
  case "$1" in
    node)   echo "https://nodejs.org  (or: brew install node)" ;;
    pnpm)   echo "npm install -g pnpm" ;;
    docker) echo "https://docs.docker.com/get-docker" ;;
  esac
}

# Fails unless `cmd` is installed at version `min` (major, or major.minor) or later.
check_version() {
  local cmd="$1" min="$2" actual
  actual="$($cmd --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)" \
    || die "$cmd not found. Install it with: $(install_hint "$cmd")"
  local have_major="${actual%%.*}" have_minor="${actual#*.}"
  local need_major="${min%%.*}" need_minor=0
  [[ "$min" == *.* ]] && need_minor="${min#*.}"
  (( have_major > need_major || (have_major == need_major && have_minor >= need_minor) )) \
    || die "$cmd $actual is too old (need $min or later). Install a newer one: $(install_hint "$cmd")"
}

check_version node 22      # production runs Node 24 (.nvmrc); 22 is the oldest still supported
check_version pnpm 9
success "node $(node --version), pnpm $(pnpm --version)"

start_docker_desktop() {
  docker desktop start &>/dev/null && return 0            # Docker Desktop 4.37+
  [[ "$OSTYPE" == "darwin"* ]] && open -a Docker &>/dev/null && return 0
  return 1
}

# Docker runs the local Postgres, which the app requires.
command -v docker &>/dev/null || die "Docker not found. Install it with: $(install_hint docker)"
if ! docker info &>/dev/null; then
  info "Docker isn't running — starting Docker Desktop..."
  if start_docker_desktop; then
    for _ in $(seq 1 60); do
      docker info &>/dev/null && break
      sleep 2
    done
  fi
fi
docker info &>/dev/null || die "Couldn't start Docker. Open Docker Desktop, wait for it to start, then re-run this script."
success "docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"

# ── 2. Postgres via Docker ────────────────────────────────────────────────────
DB_CONTAINER="penntools-db"
DB_USER="penntools"
DB_PASS="penntools"
DB_NAME="penntools"
DB_PORT="5432"
# The platform schema needs the pgvector extension, which stock postgres images lack.
DB_IMAGE="pgvector/pgvector:pg16"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}"

if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  EXISTING_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$DB_CONTAINER")"
  [[ "$EXISTING_IMAGE" == "$DB_IMAGE" ]] || die "Container '${DB_CONTAINER}' uses '${EXISTING_IMAGE}', which lacks pgvector.
  Delete it (this erases its local data), then re-run this script:
    docker rm -f ${DB_CONTAINER}"
  if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    warn "Postgres container '${DB_CONTAINER}' is already running — skipping."
  else
    info "Starting existing Postgres container '${DB_CONTAINER}'..."
    docker start "$DB_CONTAINER"
  fi
else
  info "Starting Postgres container '${DB_CONTAINER}'..."
  docker run -d \
    --name "$DB_CONTAINER" \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_PASSWORD="$DB_PASS" \
    -e POSTGRES_DB="$DB_NAME" \
    -p "${DB_PORT}:5432" \
    "$DB_IMAGE"
fi

# Wait for Postgres to be ready. Check over TCP: on first start the image runs
# a socket-only init server, so this passes only once the real server is up.
info "Waiting for Postgres to be ready..."
for i in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" &>/dev/null; then
    success "Postgres is ready."
    break
  fi
  [[ "$i" == "30" ]] && die "Postgres did not become ready in time."
  sleep 1
done

# ── 3. Install dependencies ───────────────────────────────────────────────────
info "Installing workspace dependencies..."
# Frozen: never rewrite pnpm-lock.yaml behind the user's back.
pnpm install --frozen-lockfile || die "pnpm install failed (see above). If it says pnpm-lock.yaml is out of date,
  run \`pnpm install\` yourself (it updates the lockfile; commit that only if you meant to
  change dependencies), then re-run this script."
success "Dependencies installed."

# ── 4. Build packages (Next.js resolves workspace deps from dist/) ────────────
info "Building @penntools/core..."
pnpm --filter @penntools/core build
info "Building @penntools/platform..."
pnpm --filter @penntools/platform build
info "Building tools..."
pnpm --filter "@penntools/tool-*" build
success "Packages built."

# ── 5. Env file ───────────────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  warn "$ENV_FILE already exists — leaving it untouched."
  warn "If DATABASE_URL is wrong, update it manually."
else
  info "Creating $ENV_FILE..."
  cp "$REPO_ROOT/.env.example" "$ENV_FILE"
  # Point DATABASE_URL at the local Docker Postgres
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" "$ENV_FILE"
  else
    sed -i    "s|DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" "$ENV_FILE"
  fi
  success "Wrote DATABASE_URL to $ENV_FILE."
fi

# ── 6. Set up database ────────────────────────────────────────────────────────
# Prisma client was already generated as part of platform build above.
# Same step Railway runs before each deploy: schema push, then tool databases.
info "Setting up database..."
(cd "$REPO_ROOT" && DATABASE_URL="$DATABASE_URL" pnpm --filter @penntools/platform db:deploy)
success "Database ready."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Start the dev server:"
echo -e "    ${CYAN}pnpm dev${NC}"
echo ""
echo "  Then open: http://localhost:3000"
echo ""
echo "  To stop Postgres later:"
echo -e "    ${CYAN}docker stop ${DB_CONTAINER}${NC}"
echo ""
