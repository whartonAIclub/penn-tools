#!/usr/bin/env bash
# scripts/registerTool.sh — scaffold a new PennTools tool package
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}▶ $*${NC}"; }
success() { echo -e "${GREEN}✔ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
die()     { echo -e "${RED}✖ $*${NC}" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Prompts ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  PennTools — Register New Tool${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

read -rp "Tool title (human-readable, e.g. \"Course Finder\"): " TITLE
[[ -n "$TITLE" ]] || die "Title cannot be empty."

read -rp "Numeric tool ID (e.g. 1, 2, 42): " ID
[[ "$ID" =~ ^[1-9][0-9]*$ ]] || die "ID must be a positive integer (got: \"$ID\")."

read -rp "Short description (one sentence): " DESCRIPTION
[[ -n "$DESCRIPTION" ]] || die "Description cannot be empty."

read -rp "Category (e.g. Academics, Recruiting, Platform): " CATEGORY
[[ -n "$CATEGORY" ]] || die "Category cannot be empty."

read -rp "Contributors (comma-separated names): " CONTRIBUTORS_RAW
[[ -n "$CONTRIBUTORS_RAW" ]] || die "Contributors cannot be empty."

read -rp "Mentor name (or write skip to move to the next step for now): " MENTOR
[[ "$MENTOR" == "skip" ]] && MENTOR=""

read -rp "Version (e.g. 0.1.0): " VERSION
[[ -n "$VERSION" ]] || die "Version cannot be empty."

read -rp "Date of inception (YYYY-MM-DD): " INCEPTION_DATE
[[ -n "$INCEPTION_DATE" ]] || die "Inception date cannot be empty."

read -rp "Latest release date (YYYY-MM-DD): " LATEST_RELEASE_DATE
[[ -n "$LATEST_RELEASE_DATE" ]] || die "Latest release date cannot be empty."

# ── Derived values ────────────────────────────────────────────────────────────
TOOL_DIR="$REPO_ROOT/tools/$ID"
PKG_NAME="@penntools/tool-$ID"
CLASS_NAME="Tool${ID}"

# ── Validation ────────────────────────────────────────────────────────────────
[[ -d "$TOOL_DIR" ]] && die "tools/$ID already exists. Aborting to avoid overwriting."

# ── Helper: build JSON array from comma-separated string ─────────────────────
contributors_to_json_array() {
  local raw="$1"
  if [[ -z "$raw" ]]; then
    echo "[]"
    return
  fi
  local IFS=','
  local parts=()
  for part in $raw; do
    # trim leading/trailing whitespace
    part="${part#"${part%%[![:space:]]*}"}"
    part="${part%"${part##*[![:space:]]}"}"
    [[ -n "$part" ]] && parts+=("\"$part\"")
  done
  if [[ ${#parts[@]} -eq 0 ]]; then
    echo "[]"
  else
    local joined
    joined="$(printf '%s, ' "${parts[@]}")"
    echo "[${joined%, }]"
  fi
}

CONTRIBUTORS_JSON="$(contributors_to_json_array "$CONTRIBUTORS_RAW")"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Summary${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  Title:        $TITLE"
echo "  ID:           $ID"
echo "  Package:      $PKG_NAME"
echo "  Class:        $CLASS_NAME"
echo "  Description:  $DESCRIPTION"
echo "  Category:     $CATEGORY"
echo "  Contributors:        $CONTRIBUTORS_JSON"
echo "  Mentor:              ${MENTOR:-<none>}"
echo "  Version:             $VERSION"
echo "  Inception date:      $INCEPTION_DATE"
echo "  Latest release date: $LATEST_RELEASE_DATE"
echo ""
echo "  Files to create:"
echo "    tools/$ID/meta.json"
echo "    tools/$ID/package.json"
echo "    tools/$ID/tsconfig.json"
echo "    tools/$ID/src/types.ts"
echo "    tools/$ID/src/${CLASS_NAME}.ts"
echo "    tools/$ID/src/index.ts"
echo "    apps/web/src/app/tools/$ID/page.tsx"
echo ""
echo "  Files to patch:"
echo "    apps/web/package.json"
echo "    apps/web/src/lib/container.ts"
echo ""

read -rp "Proceed? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { warn "Aborted."; exit 0; }

# ── Create directories ────────────────────────────────────────────────────────
mkdir -p "$TOOL_DIR/src"

# ── meta.json ─────────────────────────────────────────────────────────────────
info "Writing tools/$ID/meta.json..."
META_CONTENT="{\n  \"name\": \"$TITLE\",\n  \"description\": \"$DESCRIPTION\",\n  \"category\": \"$CATEGORY\""
META_CONTENT="$META_CONTENT,\n  \"builders\": $CONTRIBUTORS_JSON"
if [[ -n "$MENTOR" ]]; then
  META_CONTENT="$META_CONTENT,\n  \"mentor\": \"$MENTOR\""
fi
META_CONTENT="$META_CONTENT,\n  \"version\": \"$VERSION\""
META_CONTENT="$META_CONTENT,\n  \"inceptionDate\": \"$INCEPTION_DATE\""
META_CONTENT="$META_CONTENT,\n  \"latestReleaseDate\": \"$LATEST_RELEASE_DATE\""
META_CONTENT="$META_CONTENT\n}"
printf "%b\n" "$META_CONTENT" > "$TOOL_DIR/meta.json"

# ── package.json ──────────────────────────────────────────────────────────────
info "Writing tools/$ID/package.json..."
cat > "$TOOL_DIR/package.json" <<EOF
{
  "name": "$PKG_NAME",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@penntools/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
EOF

# ── tsconfig.json ─────────────────────────────────────────────────────────────
info "Writing tools/$ID/tsconfig.json..."
cat > "$TOOL_DIR/tsconfig.json" <<EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
EOF

# ── src/types.ts ──────────────────────────────────────────────────────────────
info "Writing tools/$ID/src/types.ts..."
cat > "$TOOL_DIR/src/types.ts" <<EOF
import type { ToolOutput } from "@penntools/core/tools";

export interface ${CLASS_NAME}Input {
  prompt: string;
}

export interface ${CLASS_NAME}Output extends ToolOutput {}
EOF

# ── src/Tool{ID}.ts ───────────────────────────────────────────────────────────
info "Writing tools/$ID/src/${CLASS_NAME}.ts..."

MANIFEST_MENTOR=""
if [[ -n "$MENTOR" ]]; then
  MANIFEST_MENTOR="
    mentor: \"$MENTOR\","
fi

cat > "$TOOL_DIR/src/${CLASS_NAME}.ts" <<EOF
import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { ${CLASS_NAME}Input, ${CLASS_NAME}Output } from "./types.js";

export class ${CLASS_NAME} extends Tool<${CLASS_NAME}Input, ${CLASS_NAME}Output> {
  readonly manifest: ToolManifest = {
    id: "$ID",
    title: "$TITLE",
    description: "$DESCRIPTION",
    image: "/tools/$ID/icon.png",
    contributors: $CONTRIBUTORS_JSON,$(printf '%s' "$MANIFEST_MENTOR")
    version: "$VERSION",
    inceptionDate: "$INCEPTION_DATE",
    latestReleaseDate: "$LATEST_RELEASE_DATE",
  };

  async execute(
    input: ${CLASS_NAME}Input,
    context: ToolContext
  ): Promise<${CLASS_NAME}Output> {
    const llmResponse = await context.llm.complete({
      messages: [{ role: "user", content: input.prompt }],
    });

    return {
      assistantMessage: llmResponse.content,
      telemetry: {
        durationMs: 0,
        tokensUsed: llmResponse.usage.totalTokens,
      },
    };
  }
}
EOF

# ── src/index.ts ──────────────────────────────────────────────────────────────
info "Writing tools/$ID/src/index.ts..."
cat > "$TOOL_DIR/src/index.ts" <<EOF
export { $CLASS_NAME } from "./${CLASS_NAME}.js";
export type { ${CLASS_NAME}Input, ${CLASS_NAME}Output } from "./types.js";
EOF

# ── Create apps/web/src/app/tools/{ID}/page.tsx ───────────────────────────────
info "Writing apps/web/src/app/tools/$ID/page.tsx..."
mkdir -p "$REPO_ROOT/apps/web/src/app/tools/$ID"
cat > "$REPO_ROOT/apps/web/src/app/tools/$ID/page.tsx" <<EOF
export default function Tool${ID}Page() {
  return (
    <div>
      <h1>$TITLE</h1>
      <p>$DESCRIPTION</p>
    </div>
  );
}
EOF
success "apps/web/src/app/tools/$ID/page.tsx created."

# ── Patch apps/web/package.json ───────────────────────────────────────────────
info "Patching apps/web/package.json..."
WEB_PKG="$REPO_ROOT/apps/web/package.json"

python3 - "$WEB_PKG" "$PKG_NAME" <<'PYEOF'
import sys, json
path, pkg_name = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
data["dependencies"][pkg_name] = "workspace:*"
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF
success "apps/web/package.json patched."

# ── Patch apps/web/src/lib/container.ts ───────────────────────────────────────
info "Patching apps/web/src/lib/container.ts..."
CONTAINER="$REPO_ROOT/apps/web/src/lib/container.ts"

IMPORT_LINE="import { $CLASS_NAME } from \"$PKG_NAME\";"
REGISTER_LINE="toolRegistry.register(new ${CLASS_NAME}());"

# Find the last toolRegistry.register(...) line and insert after it
if grep -q "toolRegistry.register(" "$CONTAINER"; then
  python3 - "$CONTAINER" "$IMPORT_LINE" "$REGISTER_LINE" <<'PYEOF'
import sys
path = sys.argv[1]
import_line = sys.argv[2]
register_line = sys.argv[3]

with open(path) as f:
    lines = f.readlines()

# Find the last line containing toolRegistry.register(
last_idx = None
for i, line in enumerate(lines):
    if "toolRegistry.register(" in line:
        last_idx = i

if last_idx is None:
    print("ERROR: could not find toolRegistry.register in container.ts", file=sys.stderr)
    sys.exit(1)

# Insert after that line
lines.insert(last_idx + 1, register_line + "\n")
lines.insert(last_idx + 1, import_line + "\n")

with open(path, "w") as f:
    f.writelines(lines)
PYEOF
  success "apps/web/src/lib/container.ts patched."
else
  die "Could not find toolRegistry.register in container.ts — patch manually."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Tool '$TITLE' scaffolded successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Next steps:"
echo -e "    ${CYAN}pnpm install${NC}"
echo -e "    ${CYAN}pnpm build${NC}"
echo ""
echo "  To typecheck the new package:"
echo -e "    ${CYAN}npx tsc --noEmit -p tools/$ID/tsconfig.json${NC}"
echo ""
echo "  Don't forget to add an icon at:"
echo -e "    ${CYAN}apps/web/public/tools/$ID/icon.png${NC}"
echo ""
