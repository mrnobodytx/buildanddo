#!/bin/sh
# Install the tracked hooks into .git/hooks. Run from the repo root.
# Hooks live in scripts/hooks/ so they are version-controlled and reviewable; .git/hooks is not.
set -e
REPO="$(git rev-parse --show-toplevel)"
for h in pre-commit post-commit; do
  cp "$REPO/scripts/hooks/$h" "$REPO/.git/hooks/$h"
  chmod +x "$REPO/.git/hooks/$h"
  echo "installed .git/hooks/$h"
done
