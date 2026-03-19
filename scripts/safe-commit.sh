#!/usr/bin/env sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BOT_HELPER_SCRIPT="$SCRIPT_DIR/agent-commit.sh"
SIGNING_ERROR_PATTERN='gpg failed to sign the data|failed to write commit object|signing failed|error: gpg|no pinentry|operation canceled|agent refused operation|1password|op-ssh-sign|ssh-agent sign failed'

print_help() {
  cat <<'EOF'
Usage: scripts/safe-commit.sh [git commit args]

Attempt a normal git commit first. If commit fails due to signing-agent errors,
either retry automatically via the bot helper or print fallback instructions.

Environment:
  MERGE_TRAIN_AUTO_BOT_COMMIT=1  Auto-retry with scripts/agent-commit.sh on signing failures

Examples:
  scripts/safe-commit.sh -m "chore: update docs"
  MERGE_TRAIN_AUTO_BOT_COMMIT=1 scripts/safe-commit.sh -m "chore: update docs"
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

stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT

if git commit "$@" 2>"$stderr_file"; then
  if [ -s "$stderr_file" ]; then
    cat "$stderr_file" >&2
  fi
  exit 0
else
  commit_exit_code=$?
fi

if grep -Eiq "$SIGNING_ERROR_PATTERN" "$stderr_file"; then
  if [ "${MERGE_TRAIN_AUTO_BOT_COMMIT:-0}" = "1" ]; then
    if [ ! -x "$BOT_HELPER_SCRIPT" ]; then
      cat "$stderr_file" >&2
      printf 'safe-commit: fallback helper is missing or not executable: %s\n' "$BOT_HELPER_SCRIPT" >&2
      exit "$commit_exit_code"
    fi

    printf 'Detected signing-agent commit failure. Retrying with %s...\n' "$BOT_HELPER_SCRIPT" >&2
    "$BOT_HELPER_SCRIPT" "$@"
    exit $?
  fi

  cat "$stderr_file" >&2
  cat >&2 <<'EOF'

Safe-commit fallback: signing-agent failure detected.

Retry options:
  1) Auto fallback: MERGE_TRAIN_AUTO_BOT_COMMIT=1 scripts/safe-commit.sh [git commit args]
  2) Direct bot helper: scripts/agent-commit.sh [git commit args]
EOF
  exit "$commit_exit_code"
fi

cat "$stderr_file" >&2
exit "$commit_exit_code"
