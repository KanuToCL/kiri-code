#!/usr/bin/env bash
# Print one line per detected backend: "<name>: <available|unavailable>"
set -u

avail() { local name="$1"; local cli="$2"; local key="$3"
  local has_cli=no; local has_key=no
  command -v "$cli" >/dev/null 2>&1 && has_cli=yes
  [ -n "${!key:-}" ] && has_key=yes
  if [ "$has_cli" = yes ] && [ "$has_key" = yes ]; then echo "$name: available (cli + key)"
  elif [ "$has_cli" = yes ]; then echo "$name: cli-only (missing $key)"
  elif [ "$has_key" = yes ]; then echo "$name: key-only (missing $cli CLI)"
  else echo "$name: unavailable"; fi
}

avail claude  claude  ANTHROPIC_API_KEY
avail codex   codex   OPENAI_API_KEY
avail gemini  gemini  GEMINI_API_KEY

# Direct-API fallback
[ -n "${ANTHROPIC_API_KEY:-}" ] && echo "anthropic-direct: available (key only)" || echo "anthropic-direct: unavailable"
[ -n "${OPENAI_API_KEY:-}" ]    && echo "openai-direct: available (key only)"    || echo "openai-direct: unavailable"
