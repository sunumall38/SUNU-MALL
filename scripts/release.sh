#!/usr/bin/env bash
# Prépare une version SUNU MALL : met à jour VERSION, frontend/package.json
# et le CHANGELOG, crée le commit « chore(release): vX.Y.Z » et le tag
# annoté vX.Y.Z. Rien n'est poussé : relire, puis
#   git push origin <branche> && git push origin vX.Y.Z
#
# Usage : scripts/release.sh 1.1.0        (version explicite)
#         scripts/release.sh patch|minor|major
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

current="$(tr -d '[:space:]' < VERSION)"
arg="${1:-}"
if [[ -z "$arg" ]]; then
  echo "Usage : $0 <X.Y.Z|patch|minor|major>  (version actuelle : $current)" >&2
  exit 64
fi

IFS=. read -r major minor patch <<< "${current%%-*}"
case "$arg" in
  major) next="$((major + 1)).0.0" ;;
  minor) next="${major}.$((minor + 1)).0" ;;
  patch) next="${major}.${minor}.$((patch + 1))" ;;
  *) next="$arg" ;;
esac

if ! [[ "$next" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Version invalide : $next (attendu X.Y.Z, voir semver.org)" >&2
  exit 65
fi
if git rev-parse -q --verify "refs/tags/v$next" >/dev/null; then
  echo "Le tag v$next existe déjà." >&2
  exit 65
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "L'arbre de travail n'est pas propre : committez ou remisez d'abord." >&2
  exit 65
fi
if ! grep -q '^## \[Non publié\]' CHANGELOG.md; then
  echo "CHANGELOG.md doit contenir une section « ## [Non publié] » décrivant la version." >&2
  exit 65
fi

today="$(date +%Y-%m-%d)"
echo "$next" > VERSION

# frontend/package.json et son lockfile, sans réinstaller les dépendances.
(cd frontend && npm version "$next" --no-git-tag-version --allow-same-version >/dev/null)

# La section « Non publié » devient la version ; une nouvelle section vide
# est ouverte au-dessus pour la suite.
python3 - "$next" "$today" <<'PY'
import sys
version, today = sys.argv[1], sys.argv[2]
path = "CHANGELOG.md"
text = open(path, encoding="utf-8").read()
text = text.replace(
    "## [Non publié]",
    f"## [Non publié]\n\n## [{version}] - {today}",
    1,
)
open(path, "w", encoding="utf-8").write(text)
PY

git add VERSION frontend/package.json frontend/package-lock.json CHANGELOG.md
git commit -q -m "chore(release): v$next"
git tag -a "v$next" -m "SUNU MALL v$next"

echo "Version v$next prête (commit + tag locaux)."
echo "Pour publier : git push origin $(git branch --show-current) && git push origin v$next"
