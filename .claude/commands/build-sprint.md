---
description: Build one Gantry sprint end-to-end (usage: /build-sprint 2)
argument-hint: <sprint number 2-5>
---
Build **Sprint $ARGUMENTS** of Gantry.

1. Read `handoff.md` lines 25–38 (status) and 217–274 (known quirks), then only the "Sprint $ARGUMENTS" subsection of §5 (lines 275–372). Don't read the rest.
2. Use the spec line map in CLAUDE.md to read **only** the spec ranges this sprint needs.
3. Create a task list for the sprint. Implement in small files, and test each piece as you go. Use truncated output: `bun test <file> --bail 2>&1 | tail -40`.
4. Definition of done:
   - `bun test packages/core/test` passes.
   - `bun run typecheck` is clean for files you touched.
   - The vulnerable fixture triggers the expected rules.
   - The clean fixture produces no findings.
   - The 3-second SLA holds.
5. Update `handoff.md`: mark the sprint done in §2, record new files and any new quirks, and trim the finished sprint's §5 plan to a one-line summary.
6. Run `/ponytail-review` on the diff and apply deletions that don't weaken detection, validation or security.
7. Commit with message `feat(sprint-$ARGUMENTS): <summary>`. Then stop and tell me to run `/clear` and `/build-sprint <next>`.

If something in the spec is ambiguous, pick the stricter or safer interpretation, note it in handoff.md, and keep going.
