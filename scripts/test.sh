#!/usr/bin/env bash
# scripts/test.sh — one-shot local dev setup for PennTools
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

check_version() {
  local cmd="$1" min="$2" actual
  actual="$($cmd --version 2>/dev/null | grep -oE '[0-9]+' | head -1)" \
    || die "$cmd not found. Install it with: $(install_hint "$cmd")"
  [[ "$actual" -ge "$min" ]] || die "$cmd version $actual is too old (need >= $min)."
}

check_version node 20
check_version pnpm 9
success "node $(node --version), pnpm $(pnpm --version)"

if ! command -v docker &>/dev/null; then
  warn "Docker not found — skipping Postgres setup."
  warn "Install it with: $(install_hint docker)"
  SKIP_DOCKER=1
elif ! docker info &>/dev/null; then
  warn "Docker is installed but the daemon isn't running."
  warn "Open Docker Desktop, wait for it to start, then re-run this script."
  SKIP_DOCKER=1
else
  success "docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  SKIP_DOCKER=0
fi

# ── 2. Install dependencies ───────────────────────────────────────────────────
info "Installing workspace dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
success "Dependencies installed."

# ── 3. Build packages (Next.js resolves workspace deps from dist/) ────────────
info "Building @penntools/core..."
pnpm --filter @penntools/core build
info "Building @penntools/platform..."
pnpm --filter @penntools/platform build
info "Building tools..."
pnpm --filter "@penntools/tool-*" build
success "Packages built."

# ── 4. Postgres via Docker ────────────────────────────────────────────────────
DB_CONTAINER="penntools-db"
DB_USER="penntools"
DB_PASS="penntools"
DB_NAME="penntools"
DB_PORT="5432"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}"

if [[ "$SKIP_DOCKER" == "0" ]]; then
  if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
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
      postgres:16-alpine
  fi

  # Wait for Postgres to be ready
  info "Waiting for Postgres to be ready..."
  for i in $(seq 1 15); do
    if docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" &>/dev/null; then
      success "Postgres is ready."
      break
    fi
    [[ "$i" == "15" ]] && die "Postgres did not become ready in time."
    sleep 1
  done
fi

# ── 5. Env file ───────────────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  warn "$ENV_FILE already exists — leaving it untouched."
  warn "If DATABASE_URL is wrong, update it manually."
else
  info "Creating $ENV_FILE..."
  cp "$REPO_ROOT/.env.example" "$ENV_FILE"

  if [[ "$SKIP_DOCKER" == "0" ]]; then
    # Overwrite DATABASE_URL with the local Docker value
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" "$ENV_FILE"
    else
      sed -i    "s|DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" "$ENV_FILE"
    fi
    success "Wrote DATABASE_URL to $ENV_FILE."
  else
    warn "Fill in DATABASE_URL manually in $ENV_FILE before continuing."
  fi
fi

# ── 6. Push schema to database ────────────────────────────────────────────────
# Prisma client was already generated as part of platform build above.
if [[ "$SKIP_DOCKER" == "0" ]]; then
  info "Pushing schema to database..."
  (cd "$REPO_ROOT" && DATABASE_URL="$DATABASE_URL" pnpm --filter @penntools/platform db:push)
  success "Database schema applied."
else
  warn "Skipping db:push — run it manually after setting DATABASE_URL:"
  warn "  pnpm --filter @penntools/platform db:push"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Start the dev server:"
echo -e "    ${CYAN}pnpm --filter @penntools/web dev${NC}"
echo ""
echo "  Then open: http://localhost:3000"
echo ""
if [[ "$SKIP_DOCKER" == "0" ]]; then
  echo "  To stop Postgres later:"
  echo -e "    ${CYAN}docker stop ${DB_CONTAINER}${NC}"
  echo ""
fi
