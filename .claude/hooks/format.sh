#!/usr/bin/env bash
# Silently format the file Claude just edited with Biome (saves tokens on style fixes).
# No output on success, so nothing is added to Claude's context.
f=$(bun -e 'let s="";for await (const c of Bun.stdin.stream()) s+=new TextDecoder().decode(c); try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}' 2>/dev/null)
[ -z "$f" ] && exit 0
case "$f" in
  *fixtures/*|*.md) exit 0 ;;
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.svelte) ;;
  *) exit 0 ;;
esac
bin="$CLAUDE_PROJECT_DIR/node_modules/.bin/biome"
[ -x "$bin" ] && "$bin" format --write "$f" >/dev/null 2>&1
exit 0
