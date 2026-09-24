#!/usr/bin/env bash
# archive_merged_branches.sh - close the branch names whose whole history is already in main (tier 1)
# and, once the converge PR has landed, the names already in the live trunk (tier 2).
# Operator-run: the release seat's classifier refuses remote branch deletion (Git Destructive), so this
# is the handoff. Every deletion is recoverable from the ledger: git push origin <tip>:refs/heads/<name>.
#
#   bash archive_merged_branches.sh tier1          # 77 GitHub + 3 GitLab names, all 0 ahead of main
#   bash archive_merged_branches.sh tier2          # 18 GitHub c-one/* names, all 0 ahead of the trunk (run AFTER the converge PR merges)
#   bash archive_merged_branches.sh local          # local branches + clean worktrees on this workstation
set -euo pipefail
cd "D:/HOSTINGER_COMP/sites/buildanddo"
HERE="$(cd "$(dirname "$0")" && pwd)"   # the list files sit beside this script
tier=${1:?tier1|tier2|local}
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
  local)
    # clean worktrees on branches that are fully merged, then the branches themselves (-d refuses unmerged work)
    for wt in D:/citadel_worktrees/bnd-activity D:/citadel_worktrees/bnd-buddi-brand D:/citadel_worktrees/bnd-buddi-tools \
              D:/citadel_worktrees/bnd-challenge D:/citadel_worktrees/bnd-community-web D:/citadel_worktrees/bnd-public-redaction \
              D:/citadel_worktrees/bnd-purpose D:/citadel_worktrees/bnd-redaction-hyphen D:/citadel_worktrees/bnd-voice \
              D:/citadel_worktrees/bnd-pr80 D:/citadel_worktrees/bnd-base-stage D:/citadel_worktrees/bnd-rc-8ce003b; do
      [ -d "$wt" ] && [ -z "$(git -C "$wt" status --porcelain)" ] && git worktree remove "$wt" && echo "removed $wt"
    done
    git worktree prune
    for b in bits/SRS-BUILDANDDO-ROADMAP-001-canonical-ledger-activity bits/SRS-BUILDANDDO-UPGRADE-001-learning-brand-front-page \
             bits/SRS-BUILDANDDO-LIVE-UTILIZATION-001-controller-rig1-deploy fix/dora-finished-after-started fix/dora-ns-timestamps \
             feat/about-header-rooms-live sprint/p0-release-20260918-1027-92ebc84 candidate/d7b18a8-gitlab-intake; do
      git branch -d "$b" 2>/dev/null && echo "deleted local $b" || echo "kept $b (not merged into the current HEAD or checked out)"
    done
    ;;
esac
echo "done: $tier"
