#!/usr/bin/env sh

set -eu

BOT_NAME="${MERGE_TRAIN_BOT_NAME:-merge-train[bot]}"
BOT_EMAIL="${MERGE_TRAIN_BOT_EMAIL:-merge-train-bot@users.noreply.github.com}"

print_help() {
  cat <<'EOF'
Usage: scripts/agent-commit.sh [git commit args]

Create a commit using bot identity defaults and no GPG signing.

Environment overrides:
  MERGE_TRAIN_BOT_NAME   Bot commit author name
  MERGE_TRAIN_BOT_EMAIL  Bot commit author email

Examples:
  scripts/agent-commit.sh -m "chore: update docs"
  scripts/agent-commit.sh --amend --no-edit
EOF
}

if [ "$#" -eq 0 ]; then
  print_help
  exit 1
fi

case "${1:-}" in
  -h|--help)
    print_help
    exit 0
    ;;
esac

git -c user.name="$BOT_NAME" -c user.email="$BOT_EMAIL" commit --no-gpg-sign "$@"
