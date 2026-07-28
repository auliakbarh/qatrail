#!/usr/bin/env bash
# Show or set the app version (UI + API show the same one).
#
# The version a build uses is the newest git tag (v1.2.3 -> 1.2.3); package.json
# is only the fallback when the checkout has no tags. So a release is just a tag.
#
# Usage:
#   ./scripts/version.sh                  # show what a build would use right now
#   ./scripts/version.sh 1.2.0            # bump package.json, commit, tag v1.2.0
#   ./scripts/version.sh 1.2.0 --no-tag   # bump package.json only (no commit/tag)
#
# One-off build with a version that is neither tag nor package.json:
#   APP_VERSION=1.2.0-rc1 npm run build

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ $# -eq 0 ]; then
  git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || node -p "require('./package.json').version"
  exit 0
fi

V="${1#v}"
if ! [[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "usage: $0 <x.y.z> [--no-tag]" >&2
  exit 1
fi

npm pkg set "version=$V" --workspaces --include-workspace-root
echo "package.json (root + server + client) -> $V"

if [ "${2:-}" = "--no-tag" ]; then
  exit 0
fi

git add package.json server/package.json client/package.json
git commit -m "chore(release): v$V"
git tag -a "v$V" -m "v$V"
echo "tagged v$V — publish it with: git push --follow-tags"
