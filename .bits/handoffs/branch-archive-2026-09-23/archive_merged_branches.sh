#!/usr/bin/env bash
# archive_merged_branches.sh - close the branch names whose whole history is already in main (tier 1)
# and, once the converge PR has landed, the names already in the live trunk (tier 2).
# Operator-run: the release seat's classifier refuses remote branch deletion (Git Destructive), so this
# is the handoff. Every deletion is recoverable from the ledger: git push origin <tip>:refs/heads/<name>.
#
#   bash archive_merged_branches.sh tier1          # 77 GitHub + 3 GitLab names, all 0 ahead of main
#   bash archive_merged_branches.sh tier2          # 18 GitHub c-one/* names, all 0 ahead of the trunk (run AFTER the converge PR merges)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
HERE="$(cd "$(dirname "$0")" && pwd)"   # the list files sit beside this script
tier=${1:?tier1|tier2}
verify_zero_ahead() {  # refuse to delete anything that gained commits since the ledger was written
  local base=$1 ref=$2
  [ "$(git rev-list --count "$base..$ref")" = "0" ] || { echo "REFUSED: $ref is ahead of $base"; return 1; }
}
case "$tier" in
  tier1)
    git fetch --prune origin --quiet; git fetch --prune gitlab --quiet
    while read -r b; do [ -z "$b" ] && continue; verify_zero_ahead origin/main "origin/$b"; done < "$HERE/delete_origin.txt"
    xargs -a "$HERE/delete_origin.txt" -n 20 git push origin --delete
    while read -r b; do [ -z "$b" ] && continue; verify_zero_ahead origin/main "gitlab/$b"; done < "$HERE/delete_gitlab.txt"
    xargs -a "$HERE/delete_gitlab.txt" -n 20 git push gitlab --delete
    ;;
  tier2)
    git fetch --prune origin --quiet
    T=origin/bits/SRS-BUILDANDDO-WORKSPACE-001-fleet-master-seat-gate
    git merge-base --is-ancestor "$T" origin/main || { echo "REFUSED: the trunk is not in main yet (converge PR not merged)"; exit 2; }
    while read -r b; do [ -z "$b" ] && continue; verify_zero_ahead origin/main "origin/$b"; done < "$HERE/delete_origin_tier2.txt"
    xargs -a "$HERE/delete_origin_tier2.txt" -n 20 git push origin --delete
    ;;
  # The workstation-local tier (clean worktrees, merged local branches) is deliberately not in the public
  # repository: it names paths on the release seat. It lives with the seat that owns those worktrees.
esac
echo "done: $tier"
