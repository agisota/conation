#!/usr/bin/env bash
set -euo pipefail

# Conation rebrand script — applies shallow rebrand on top of current branch
# (for conation/overlay). For conation/main use git-filter-repo with rebrand.replacements.txt
# Usage: ./tooling/scripts/rebrand.sh [--check] [--filter-repo]

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECK=false
FILTER_REPO=false
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=true ;;
    --filter-repo) FILTER_REPO=true ;;
  esac
done

if [[ "$FILTER_REPO" == true ]]; then
  if ! command -v git-filter-repo &>/dev/null; then
    echo "Installing git-filter-repo..."
    pip install git-filter-repo -q
  fi
  echo "Running git filter-repo --replace-text $ROOT/tooling/scripts/rebrand.replacements.txt"
  git filter-repo --replace-text "$ROOT/tooling/scripts/rebrand.replacements.txt" --force
  echo "Filter-repo done. Now renaming crates/macro_* -> crates/conation_*"
fi

# 1. File content replacements (text, not filename) — safe for overlay
echo "[rebrand] Replacing text occurrences..."

# Use rg if available, else grep
if command -v rg &>/dev/null; then
  GREP="rg -l"
else
  GREP="grep -r -l"
fi

# -- 1a: domain / org
# Note: do before generic macro->conation to avoid double replacement
sed_replace() {
  local from="$1" to="$2"
  # Find files (exclude .git, node_modules, .sqlx, target, bun.lock partially)
  find "$ROOT" -type f \
    \( -path "$ROOT/.git" -prune \) -o \
    \( -path "$ROOT/target" -prune \) -o \
    \( -path "$ROOT/apps/web/node_modules" -prune \) -o \
    \( -path "$ROOT/infra/node_modules" -prune \) -o \
    \( -path "$ROOT/.sqlx" -prune \) -o \
    -type f -print0 | xargs -0 sed -i "s|$from|$to|g" 2>/dev/null || true
}

# Domain and org (most specific first)
sed_replace "macro-inc" "conation-dev"
sed_replace "MACRO_INC" "CONATION_DEV"
sed_replace "macro\.com" "conation.dev"
sed_replace "MACRO\.COM" "CONATION.DEV"
sed_replace "nix-cache\.macro\.com" "nix-cache.conation.dev"
sed_replace "s3://macro-nix-cache" "s3://conation-nix-cache"
sed_replace "ghcr\.io/macro-inc/macro" "ghcr.io/conation-dev/conation"

# Generic brand (keep after specific)
# Use word-boundary-ish via sed; ordering: Macro, MACRO, macro
sed_replace "Macro" "Conation"
sed_replace "MACRO" "CONATION"
# Avoid touching macros/ (rust macros directory) - exclude via word boundary
# For lowercase, use perl for word boundary to avoid deps
perl -pi -e 's/\bmacro\b/conation/g' $(find "$ROOT" -type f -not -path "$ROOT/.git/*" -not -path "$ROOT/target/*" -not -path "*/node_modules/*" -not -path "$ROOT/.sqlx/*" | head -n 2000) 2>/dev/null || true
# fallback sed for remaining
sed_replace '"macro"' '"conation"'
sed_replace "'macro'" "'conation'"
sed_replace "macro_" "conation_"
sed_replace "macro-" "conation-"
sed_replace "macro/" "conation/"

echo "[rebrand] Text replacement done."

# 2. Rename crate directories crates/macro_* -> crates/conation_*
echo "[rebrand] Renaming crate directories..."
for dir in "$ROOT"/crates/macro_*; do
  [ -d "$dir" ] || continue
  new="$(echo "$dir" | sed 's/macro_/conation_/g')"
  if [[ "$dir" != "$new" ]]; then
    echo "  mv $dir -> $new"
    git mv "$dir" "$new" 2>/dev/null || mv "$dir" "$new"
  fi
done
# Also crates/macro (if exists)
if [ -d "$ROOT/crates/macro" ]; then
  git mv "$ROOT/crates/macro" "$ROOT/crates/conation" 2>/dev/null || mv "$ROOT/crates/macro" "$ROOT/crates/conation"
fi

# 3. Rename assets
if [ -f "$ROOT/apps/web/public/macro-favicon.svg" ]; then
  git mv "$ROOT/apps/web/public/macro-favicon.svg" "$ROOT/apps/web/public/conation-favicon.svg" 2>/dev/null || mv "$ROOT/apps/web/public/macro-favicon.svg" "$ROOT/apps/web/public/conation-favicon.svg"
  echo "[rebrand] Renamed favicon"
fi

echo "[rebrand] Done. Next steps:"
echo "  1. nix develop --command just prepare_db  (if SQL changed)"
echo "  2. bun install (if package.json changed)"
echo "  3. cargo check -p conation_db_client"
echo "  4. git status | wc -l to verify"

if [[ "$CHECK" == true ]]; then
  echo "[check] Remaining macro occurrences (should be ~0 for conation/main, low for overlay):"
  rg -i "macro\.com|macro-inc" --hidden -g '!.git' "$ROOT" 2>/dev/null | wc -l || grep -r "macro.com\|macro-inc" "$ROOT" --exclude-dir=.git 2>/dev/null | wc -l
fi
