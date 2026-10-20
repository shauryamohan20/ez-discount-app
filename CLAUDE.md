@AGENTS.md

# EZ Master Discount

A public Shopify App Store app for automatic and code discounts: quantity
tiers, whole order thresholds and Buy X Get Y, all from one Discount Function.

**Before doing any work, read `docs/HANDOVER.md`.** It has the architecture,
the decisions already made and why, the current state, open problems, and the
roadmap. Update it when you finish a milestone.

## Working with the owner

- New to Shopify apps. Explain steps clearly and in order.
- Windows: give CMD commands only, never PowerShell, one per code block.
- Use pnpm, not npm.
- Never use em dashes in anything written for the owner, including commit
  messages and UI copy.
- Ask before adding any new dependency.
- Use current shopify.dev docs, not memory, for API names and versions.
- Do not start a second dev server, and do not stop the owner's.
- Large features: research, plan, wait for approval, then build in
  milestones.
- After every milestone: run the checks below, give exact steps to test in
  the `greyteck-store` dev store, commit, and push to `main`.

## Checks before every commit

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build` (catches server modules imported into browser code, which
  typecheck misses)
- Function tests: `pnpm test -- --run` in `extensions/tiered-discount`, or
  `node scripts/verify-function.mjs` from the root when the Shopify CLI is
  broken (see `docs/HANDOVER.md`, section 8).
