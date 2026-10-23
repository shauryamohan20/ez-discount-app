# EZ Master Discount: handover

Snapshot of the project as of 20 October 2026, written so work can continue in
a new Claude account with no access to the previous chat. Everything here was
checked against the repository when it was written. If the code and this file
disagree, trust the code, then fix this file.

---

## 1. How to resume

1. Open Claude Code on the project folder:
   `C:\Users\mohan\Desktop\ez-discount-app\ez-discount-app`
2. `CLAUDE.md` in that folder loads automatically. It holds the working rules
   and tells Claude to read this file.
3. Fix the Shopify CLI first if it is still broken (section 8).
4. Suggested first message:

   > Read docs/HANDOVER.md and CLAUDE.md, then check the repo matches them and
   > tell me anything that differs. Do not change anything yet.

---

## 2. The owner and how to work with them

- A web developer (WordPress, Shopify themes) who is new to building Shopify
  apps. Explain steps clearly and in order.
- **Windows. Give CMD commands only, never PowerShell.** Put each command in
  its own code block.
- **Use pnpm, not npm** (except `npm install -g @shopify/cli@latest`, which is
  how the global CLI is installed).
- **Never use em dashes** in anything written for the owner: replies, docs,
  commit messages, UI copy.
- **Ask before adding any new dependency.**
- **Use current shopify.dev docs** for API names, fields and versions, not
  memory. Cite them.
- **Do not start a second dev server.** The owner runs `pnpm run dev` in their
  own window. Do not stop theirs either.
- **After every milestone:** run the checks yourself (section 7), give exact
  steps to test in the dev store, commit, and push to `main`.
- **For a large feature:** research the docs, reply with a plan, and wait for
  approval before coding. Then build in milestones. If the owner says not to
  wait, take the recommended options, say which, and keep going.
- When a decision is the owner's, recommend one option rather than listing
  every possibility.

---

## 3. Project facts

| | |
|---|---|
| App name | EZ Master Discount (`name` in `shopify.app.toml`) |
| Website | https://www.ezmasterdiscount.com (http redirects to https) |
| Project root | `C:\Users\mohan\Desktop\ez-discount-app\ez-discount-app` |
| Repository | https://github.com/shauryamohan20/ez-discount-app (private), branch `main` |
| Template | Shopify React Router app template, TypeScript |
| UI | Polaris web components (`s-page`, `s-table`, ...) and App Bridge |
| Database | Prisma with SQLite (`dev.sqlite`), sessions only |
| Admin API version | 2026-07 (`ApiVersion.July26` in `app/shopify.server.ts`) |
| Function API version | 2026-07 (`extensions/tiered-discount/shopify.extension.toml`) |
| Node / pnpm | Node 24.19.0, pnpm 11 |
| Dev store | `greyteck-store` (Partner development store) |
| Scopes | `read_products, write_discounts` (narrowed after the app security check) |
| Original test discount | `gid://shopify/DiscountAutomaticNode/1536741376237` (old untyped config, must keep working) |

pnpm 11 ignores the `"pnpm"` block in `package.json`. Its settings live in
`pnpm-workspace.yaml`, including an override `"restore-cursor>onetime": "^5.1.2"`
that fixed a crash during GraphQL type generation. Do not undo it. The warning
about the ignored `"pnpm"` field on every command is harmless.

---

## 4. What the app does

Three kinds of discount, all powered by **one** Shopify Function, each on its
own tab in the app:

**Quantity based** (`quantity_tiers`, PRODUCT class)
- Tiers with a from and to quantity. Empty "to" means no upper limit; from equal
  to "to" matches an exact quantity. Overlapping ranges are rejected.
- Optional cap on how many units a tier discounts (applied in cart order).
- Applies to all products, specific products, or specific collections. Only
  matching items count toward the quantity, and only they are discounted.

**Whole order** (`order_threshold`, ORDER class, plus SHIPPING when needed)
- Percentage off the order once the subtotal reaches a threshold. The best
  percentage among the reached thresholds applies.
- Each threshold can also give free shipping (every delivery option 100% off).
  A threshold may be free shipping only, with a percentage of 0. Free shipping
  applies once the cart reaches any threshold that gives it, so spending more
  never takes it away. The discount is saved with the SHIPPING class only
  while at least one threshold gives free shipping.
- An optional maximum discount amount for the whole discount (one cap, the
  owner's choice over a cap per threshold), in the shop's currency. When the
  percentage would take off more, the Function returns the cap as a fixed
  amount, converted with `presentmentCurrencyRate`. An unreadable cap makes
  the discount give nothing rather than take off more than allowed.
- Thresholds are in the shop's currency. The buyer's subtotal is divided by
  `presentmentCurrencyRate` first, and money is compared in whole cents.
- Compared against the subtotal before shipping and taxes.

**Buy X Get Y** (`buy_x_get_y`, PRODUCT class)
- Buy N of some products, get M of the same or other products free or at a
  percentage off, repeated as often as the cart allows, up to an optional
  limit per order.
- Buy side: any product, specific products, or specific collections. Get side:
  the same items, specific products, or specific collections.
- The discounted units are always the cheapest eligible ones. No unit is ever
  both a buy unit and a get unit. Units are pooled across the selection.

**Shared by all three**
- Automatic or discount code. Codes get a total usage limit and a once per
  customer switch (Shopify offers only these two; there is no "N times per
  customer", and automatic discounts have no usage limits at all).
- Customer eligibility: everyone, signed in, no previous orders, at least one
  previous order. Evaluated in the Function. An anonymous cart cannot satisfy
  any rule except "everyone".
- Start date and optional end date, in the shop's time zone.
- Days and hours (config `schedule`): the days of the week and optional daily
  hours a discount runs, in the store's time zone, in 30 minute steps. Hours
  that cross midnight belong to the day they start (Saturday 22:00 to 06:00
  runs at 02:00 on Sunday). The Function reads the store clock from
  `shop.localTime` (`date`, plus `timeAfter` against the `$scheduleStart` and
  `$scheduleEnd` input variables, written to `input-variables` as
  `HH:MM:00`); the rule is `isWithinSchedule` in `src/shared.ts`, which the
  demo cart imports too. An unreadable schedule switches the discount off.
  Shopify works discounts out when the cart is calculated, so a cart left
  untouched past the end time keeps its discount until it changes; checkout
  recalculates.
- Combination: never stacks with its own class; a checkbox for the other class
  (order for product kinds, product for order); a checkbox for shipping.
- List, create, edit, publish, move to draft, delete (with confirmation).
- Two statuses only, at the owner's request: **Active** (running, or
  scheduled to start later; the list shows the start date) and **Draft** (an
  app draft, or a discount whose end date has passed, which Shopify calls
  expired). `TieredDiscount.parked` tells the two kinds of draft apart.
  Publishing an app draft restores its dates; publishing an ended one
  activates it, which clears its end date. There is no Deactivate: Move to
  draft replaces it.
- Drafts. Shopify has no draft discounts, so the app makes its own: a draft
  is saved in Shopify with its start date parked on 1 Jan 2099
  (`DRAFT_STARTS_AT`), so it can never apply, and the merchant's own dates
  are kept in the `draft` metafield. The app shows a draft as "Draft" with
  those dates; Shopify's own Discounts page shows it as Scheduled for 2099.
  Every create and edit page has Save as draft; editing a draft shows
  Publish instead of Save. A draft row has a Publish action, which restores
  the dates. A draft turned on from Shopify's own admin counts as active.
- Bulk edit on every list (Home and each kind): a checkbox per row, select
  all in the header, and a separate bar (its own card) above the list with
  Publish, Move to
  draft and Delete, each asking first. Move to draft is off when any
  selected discount is a draft, and Publish when any is active; a line in
  the bar says why. `runDiscountRowAction` handles `bulk-*` intents: up to 250
  IDs, four at a time, each looked up first (so only this app's discounts
  change) and skipped when already in the requested state. Failures are
  listed by title in a banner; the rest still go through. Shopify's own bulk
  mutations are not used: they cover code discounts only and run as jobs.
- Method (automatic or code) and kind are locked after creation.

**Other pages**
- Home: a tile per kind with counts and two buttons, Create discount (that
  kind's create page, skipping the "which kind" page) and View discounts; a
  table of every discount; a website link. Home has no other create button.
- A "which kind of discount" page, used by the Shopify admin's own create
  flow and older links.
- The root address `/` never stays on screen (section 5.4).

---

## 5. Architecture

### 5.1 The Function: `extensions/tiered-discount`

- Handle `tiered-discount`, two targets: `cart.lines.discounts.generate.run`
  (every kind) and `cart.delivery-options.discounts.generate.run` (free
  shipping for whole order thresholds; Shopify only runs it for discounts with
  the SHIPPING class).
  **Never rename the handle or the metafield namespace**: every saved discount
  stores the handle as `functionHandle`, and its settings live in `$app:tiered`.
- `src/cart_lines_discounts_generate_run.ts`: shared guards (empty cart, no
  config, customer rule), then `runForType` dispatches on `config.type`:
  `order_threshold`, `buy_x_get_y`, otherwise quantity tiers. A missing type
  means quantity tiers.
- `src/cart_delivery_options_discounts_generate_run.ts` and its `.graphql`:
  the shipping target. `src/order_threshold.ts` holds the threshold rules both
  targets share; `src/shared.ts` holds customer rules and money helpers.
- `src/buy_x_get_y.ts`: Buy X Get Y as small pure functions. Works on cart
  lines, not individual units, so a line of 500 does not create 500 objects
  inside the instruction budget. The number of applications is the smallest of
  three bounds (comments in the file explain why).
- `src/cart_lines_discounts_generate_run.graphql`: the input query. It reads
  buyer identity, cart subtotal, each line's unit price, product ID, three
  collection membership flags, `presentmentCurrencyRate`, discount classes and
  the config metafield.
- Collection membership needs input query variables: `$collectionIds`
  (quantity tiers), `$buyCollectionIds`, `$getCollectionIds` (Buy X Get Y).
  Each is nullable with a default of `[]`, so discounts saved before a variable
  existed still run. They come from the `input-variables` metafield, configured
  under `[extensions.input.variables]` in the extension toml.
- Every product discount target is one per cart line with a quantity. Shopify
  merges targets that share a line, and a merged target without a quantity
  would discount the whole line.
- Malformed config never throws; it produces no operations.
- `[extensions.ui.paths]` sends the Shopify admin to `/app/discount/:functionId/new`
  and `/app/discount/:functionId/:id`.
- The display name in `locales/en.default.json` is "EZ Master Discount", which
  is what Shopify's discount type picker shows.

### 5.2 Metafields on each discount

Namespace `$app:tiered`, both of type `json`, written in the same mutation.

`config`, version 9. Older versions still load and behave as they did; the app
refuses to edit a version newer than it knows.

```json
{"version":6,"type":"quantity_tiers",
 "tiers":[{"minQuantity":2,"maxQuantity":4,"percentage":10,"maxDiscountedUnits":null}],
 "appliesTo":{"type":"all","productIds":[],"collectionIds":[]},
 "customerEligibility":"all"}
```

```json
{"version":8,"type":"order_threshold","maxDiscountAmount":300,
 "tiers":[{"minSubtotal":50,"percentage":0,"freeShipping":true},
          {"minSubtotal":100,"percentage":10,"freeShipping":true}],
 "appliesTo":{"type":"all","productIds":[],"collectionIds":[]},
 "customerEligibility":"all"}
```

```json
{"version":6,"type":"buy_x_get_y",
 "buy":{"quantity":2,"scope":{"kind":"collections","ids":["gid://shopify/Collection/1"]}},
 "get":{"quantity":1,"value":{"percentage":100},"scope":{"kind":"same_as_buy","ids":[]}},
 "maxApplicationsPerOrder":3,"discountedUnits":"cheapest","customerEligibility":"all"}
```

`get.value` is a tagged object so a fixed amount can be added later as
`{"fixedAmount": 5}` without a migration.

`draft`, always written on save: `{"isDraft":false}`, or
`{"isDraft":true,"startsAt":"<ISO>","endsAt":"<ISO>"|null}` for a draft.

`input-variables`, always written with all five keys:

```json
{"collectionIds":[],"buyCollectionIds":[],"getCollectionIds":[],
 "scheduleStart":"22:00:00","scheduleEnd":"06:00:00"}
```

Every fixture includes `shop.localTime`; the older ones use a neutral Monday
noon so their results are unchanged.

Version history: 1 tiers only; 2 maxQuantity and maxDiscountedUnits; 3
appliesTo; 4 customerEligibility; 5 type; 6 buy_x_get_y; 7 freeShipping on
order thresholds; 8 maxDiscountAmount on order thresholds; 9 schedule on every kind.

### 5.3 The app

**`app/lib`** (safe to import in browser code)
- `tiers.ts`: the config contract, parser, serializers, summaries, limits
  (`MAX_TIERS`, `MAX_SCOPE_IDS` = 100, `MAX_CONFIG_BYTES` = 9500).
- `discount-form.ts`: form values, validation, `formValuesToSubmission`,
  `mapUserErrors`.
- `bxgy-form.ts`: the Buy X Get Y part of the form, validation, live preview.
- `discount-id.ts`: gid helpers, `discountTab`, `discountPath`.
- `shop-time.ts`: dates in the shop's time zone.
- `brand.ts`: app name, website, and the accent colour `ACCENT` (#0e6b4f)
  with its tint `ACCENT_SURFACE`. Polaris draws its own buttons, badges and
  links in the admin's colours, which apps cannot change, so the accent is
  used on what the app draws itself: the demo cart, the product pictures
  and the discount kind icons (`KindIcon.tsx`) on Home and the create page.
- `preview.ts`: the live preview engine. Builds a Function input from a demo
  cart, runs the **real Function code** (both targets) in the browser, and
  reads the operations back as money.
- `preview-explain.ts`: `buildPreview` turns the half filled form into the
  config the app would save (same serializers), the discount classes and a
  demo cart; the `explain*` functions write the plain English sentences. Rows
  that would fail validation are skipped, not blocking.
- `preview-cart.ts`: the demo carts. Quantity tiers and Buy X Get Y use the
  names of the picked products and collections next to an item that does not
  qualify, starting at quantities where the discount applies. A side with
  nothing picked uses a stand in, whose ID also goes into the preview config.
- `discountClassesFor` in `tiers.ts` decides the Shopify discount classes,
  used both when saving and by the preview.

**`app/models`** (server only)
- `discounts.server.ts`: every Admin GraphQL call. List (`discountNodes`,
  `type:app`), get, create and update (automatic and code), activate,
  deactivate, delete, shop time zone and currency, title lookup in batches of
  250, `runDiscountRowAction`, `discountEditPath`,
  `findTieredDiscountByNumericId`.
- `discount-save.server.ts`: `saveDiscountFromForm`, validate then create or
  update, as a draft when the form sends `saveAs=draft`. Used by every create
  and edit page. `publishTieredDiscount` and `moveTieredDiscountToDraft` in
  `discounts.server.ts` update only the dates and the draft flag.
- `discount-routing.server.ts`: `redirectToDiscount` for links that carry only
  a numeric ID.

**`app/components`**
- `TieredDiscountForm.tsx`: the shared form shell (method, details, applies
  to, customers, tiers or thresholds). Renders `BuyXGetYFields` for that kind.
- `BuyXGetYFields.tsx`, `ResourceSelector.tsx` (Shopify resource picker).
- `DemoCart.tsx` and `ProductArt.tsx`: the demo cart tile. A card per line
  with the real picture of a picked product or collection (kept from the
  resource picker via `pickerImage`, or looked up on edit pages with
  `getResourceDetails`), else a drawn placeholder (inline SVG), which is also
  the fallback when an image fails to load, purple
  when discounted, a dashed outline when not in the cart, and a status line
  from `cartLineNotes` in `preview-explain.ts`: what was taken off, or why
  nothing was. A whole order discount is shared across lines by value.
- `useScrollToFirstError.ts`: after a failed save (client checks or the
  server's errors), scrolls the first problem on the page into view and
  focuses it when it is a field. A problem is a Polaris element with an
  `error`, a critical banner, or critical text. Polaris hosts can have no box
  of their own, so it scrolls to the first box inside or around them.
- `DiscountFormActions.tsx`: the page buttons every create and edit page
  shares (Save or Publish, Save as draft, Cancel) and the draft banner. It also
  guards unsaved changes (`dirty`, the form compared with what was loaded):
  React Router `useBlocker` stops in-app navigation and asks "Save this
  discount as a draft before leaving?" (Save as draft, Leave without saving,
  Keep editing); App Bridge's `ui-save-bar` shows while there are changes,
  so Shopify asks before leaving to another part of the admin (its buttons
  are always Save and Discard); `beforeunload` makes the browser warn on tab
  close or reload (browsers do not allow custom text there). Not yet tested
  in the admin: check for a double prompt when using the app menu.
- `DiscountPreviewPanel.tsx`: the live preview beside the form.
  `TieredDiscountForm` lays the form and the panel out in an `s-grid` (equal
  halves, one column under 1100px of container width); the panel is sticky
  while the form scrolls, at its normal size (the owner chose this over
  shrinking it to fit; when it is taller than the screen, the page scrolls).
  Inside the panel, details and "What happens" sit on the
  left and the cart on the right above 640px of panel width. `s-page`'s `aside` slot is not used, because
  it only exists at the default page width. A demo cart with quantity
  buttons, a shopper picker (guest, new, returning), totals with shipping, and
  "What happens" sentences, a reset button. Every kind of discount.
- `DiscountList.tsx` (a kind's page), `DiscountTable.tsx` (the shared table,
  row actions and confirmation dialog), `DiscountSummary.tsx` (the "What it
  does" cell for every kind), `DiscountNotFound.tsx`.

**Routes** (`app/routes`, flat routes)

| Path | Purpose |
|---|---|
| `/` | Forwards: into the app with shop details or inside the admin frame, else to the website |
| `/app` | Home: tiles, every discount, website link |
| `/app/discounts` | Redirects to the quantity tab |
| `/app/discounts/new` | Choose which kind of discount to create |
| `/app/discounts/{quantity,order,bxgy}` | A kind's list |
| `/app/discounts/{kind}/new` | Create |
| `/app/discounts/{kind}/{automatic,code}/:id` | Edit. Sends a discount of another kind to its own tab |
| `/app/discount/:functionId/new`, `/:id` | Entry points from the Shopify admin |
| `/app/discounts/:method/:id`, `/app/discounts/:id` | Old URL formats, resolved and redirected |
| `/app/*` | Not found page inside the app |

Unauthenticated requests to an embedded route return **410**, which means the
route exists and Shopify wants a session. A real missing route returns 404.

### 5.4 Rules the code relies on

- **`extensions/tiered-discount/generated/api.ts` is committed** because the
  app imports the Function code for the live preview. After changing a
  Function `.graphql` file, regenerate it (section 7) and commit it.
- **Nothing rendered on the server may depend on the viewer's locale**
  (`Intl` dates or money without a fixed locale). If the server and the browser
  write it differently, React throws the server markup away and rebuilds the
  page, and App Bridge's title bar buttons (Save, Cancel) stop working. The live
  preview panel renders only in the browser for this reason.
- **The Shopify CLI dev proxy sends every path starting with `/extensions` to
  its extensions server**, so browser code cannot load files from
  `extensions/` at their normal address in development (404, and the page
  fails to open). `functionSourceForDev` in `vite.config.ts` serves the
  Function files the preview imports under `/@id/` instead. Production builds
  bundle them and do not need it.
- **Every page uses `inlineSize="large"`** (the full width), at the owner's
  request. Add it to any new `s-page`.
- **Never write a boolean attribute on a Polaris element as `={false}`.**
  The server renders it as `checked="false"`, and Polaris treats any value as
  on, so the box shows ticked until the page finishes loading. Leave it out
  instead: `{...(on ? { checked: true } : {})}`. The same applies to
  `indeterminate`, `disabled` and `loading`.
- **Browser code must not import values from `*.server.ts`.** Type only
  imports are fine. React Router strips server code only from `loader`,
  `action`, `middleware` and `headers`. Typecheck does not catch this; the
  build does.
- **Redirect with the `redirect` returned by `authenticate.admin(request)`,**
  not React Router's. It keeps the embedded app's parameters on a full page
  load.
- **Whether a discount is automatic or a code comes from its `__typename`,**
  not the ID prefix. The admin's links use a `DiscountNode` gid.
- **Titles are never stored.** They are looked up when a page loads, so a
  renamed product shows its new name and a deleted one says "No longer
  available".
- **Every edit page checks the discount's kind** with `discountTab` and sends
  other kinds to their own tab. Without that, saving would overwrite one kind's
  settings with another's.

### 5.5 Adding a fourth kind of discount

1. `app/lib/tiers.ts`: type, labels, parse branch, serializer, summary, bump
   `TIER_CONFIG_VERSION`.
2. Function: a runner, a branch in `runForType`, input query fields if needed,
   regenerate types, fixtures.
3. `app/lib/discount-id.ts`: a tab in `DiscountTab` and `discountTab`.
4. `DiscountSummary.tsx`: a branch.
5. Routes: list, new, edit under `/app/discounts/<tab>`.
6. Navigation in `app/routes/app.tsx`, a tile and counts on the home page, an
   option on `app.discounts.new.tsx`.

---

## 6. Decisions already made, and why

- **One Function for every kind**, branching on `type`. Shopify caps active
  discount functions per store at 25.
- **A tab per kind,** chosen by the owner. The tab is the type selector.
- **Shop currency for thresholds,** converted with `presentmentCurrencyRate`,
  so a threshold is worth the same everywhere. Per market thresholds are not
  built.
- **Buy X Get Y does not stack with other product discounts** (the owner's
  "Option A"). Shopify applies the better one. Product discounts only stack on
  the same item on Shopify Plus.
- **Buy X Get Y does not send Shopify's `prerequisites` field** (added in
  2026-04 for the buy side). Its docs do not say whether one line can be both a
  prerequisite and a target, which is the most common case. Proven targets
  with quantities are used instead. Revisit after testing in the dev store.
- **Product and collection targeting is not offered for whole order
  discounts.** It needs line subtotals and `excludedCartLineIds`.
- **No "N uses per customer":** Shopify does not offer it.
- **The template's shop domain login form was removed.** App Store requirement
  2.3.1 forbids asking for a shop's domain.

---

## 7. Checking work

Run all of these before every commit:

```bash
cd C:\Users\mohan\Desktop\ez-discount-app\ez-discount-app && pnpm run typecheck
```

```bash
cd C:\Users\mohan\Desktop\ez-discount-app\ez-discount-app && pnpm run lint
```

```bash
cd C:\Users\mohan\Desktop\ez-discount-app\ez-discount-app && pnpm run build
```

Function tests, 119 fixtures, when the CLI works:

```bash
cd C:\Users\mohan\Desktop\ez-discount-app\ez-discount-app\extensions\tiered-discount && pnpm test -- --run
```

When the CLI is broken, `pnpm test` skips every test because it builds through
the CLI. Instead, with the dev server running (it rebuilds the wasm when the
source changes):

```bash
cd C:\Users\mohan\Desktop\ez-discount-app\ez-discount-app && node scripts/verify-function.mjs
```

After changing the Function's `.graphql` query, regenerate its types:

```bash
cd C:\Users\mohan\Desktop\ez-discount-app\ez-discount-app\extensions\tiered-discount && pnpm shopify app function typegen
```

Or without the CLI (byte for byte the same output):

```bash
cd C:\Users\mohan\Desktop\ez-discount-app\ez-discount-app && pnpm exec graphql-codegen --config scripts/function-codegen.json
```

Fixtures live in `extensions/tiered-discount/tests/fixtures`. Each must include
every field its target's input query selects, or validation fails. Fixtures
for the shipping target are named `shipping-*`.

---

## 8. Open problems in the environment

**The global Shopify CLI breaks itself when it auto-updates.** It is working
again at 4.9.4, but `shopify config autoupgrade status` still says "on". The
cause: the CLI updates itself in the background, the update fails with EPERM
because a running dev server holds `cloudflared.exe` open, and the install is
left half replaced (`shopify version` then fails with `ERR_MODULE_NOT_FOUND`).
It broke three times this way. To stop it, run once:

`shopify config autoupgrade off`

If it is broken again: stop the dev server with Ctrl+C, run
`npm install -g @shopify/cli@latest`, then the command above, then
`pnpm run dev`. Installing `@shopify/cli` as a project devDependency would
remove the problem for good; it was proposed and not yet approved.

**Running any `shopify` command while the dev server is up can break the CLI.**
Every command may start the background auto-upgrade, which then fails on the
locked `cloudflared.exe`. This happened again on 23 October 2026 from a single
`shopify app logs` run. Until auto-upgrade is off, do not run CLI commands
beside a running dev server; use `node scripts/verify-function.mjs` and the
`pnpm exec graphql-codegen` route for checks.

**"Error while polling app logs"** repeats in the dev terminal from the first
seconds of every dev session. Harmless: it only affects showing Function run
logs in that terminal. Not diagnosed. The CLI prints it when the dev server's
log poller throws, and prints the actual error only with `--verbose`. Ruled
out: an expired subscription (it starts 2 seconds in) and the account or app
(a standalone `shopify app logs` with the same login polled without error).
To find out, run the dev server with `pnpm run dev -- --verbose` and read the
line printed right after the message. Function runs are also in the Dev
Dashboard under the app's Logs.

---

## 9. Waiting on the owner

- Turn off CLI auto-upgrade (section 8).
- Restart the dev server so `shopify app dev` applies the latest
  `shopify.app.toml`: the new name in the admin sidebar, the narrower scopes
  (the dev store asks to approve the app again), and the compliance webhooks.
- Run `shopify app security check` again after the restart, then have Claude
  re-record its agent findings, then `shopify app security review` (section 12).
- Run `shopify app deploy` so the new name, scopes, compliance webhooks, admin
  entry points and latest Function reach the live app.
- Set the App Store listing name and support website in the Partner Dashboard.
  Nothing in the code controls those.
- Upload the app icon in the Dev Dashboard (app > Settings, App icon) and
  later in the App Store listing. Use `docs/assets/app-icon-1200.png`: the
  owner's logo (`docs/assets/logo-source.png`, 1000 x 1000) centred on a
  1200 x 1200 canvas of its own navy, which gives the 75px clear margin
  Shopify asks for. The icon is not set in `shopify.app.toml`.
- Test Buy X Get Y in the dev store with the checklist in section 11.

---

## 10. Not built yet

From the owner's roadmap, in a sensible order:

1. **Billing** with the App Subscriptions API: a monthly plan and a free trial.
2. **Production database:** Prisma from SQLite to Postgres.
3. **Deployment:** Fly.io, Render or Railway. `application_url` and
   `redirect_urls` in `shopify.app.toml` are still the `https://example.com`
   placeholders (the CLI overrides them during dev) and need the real host.
4. **App Store listing:** assets and a submission checklist.

Done since the first draft of this list: the mandatory compliance webhooks
(`app/routes/webhooks.compliance.tsx`), and removing the template's
`demo_info` metafield and `example` metaobject from `shopify.app.toml`.

Smaller items noted along the way:
- Buy X Get Y `prerequisites` (section 6).
- Product and collection targeting for whole order discounts.
- Fixed amount off for any kind.
- A "combine with other product discounts" option (the owner's "Option B").
- Quantity tier unit caps take units in cart order; cheapest first would be
  kinder to customers.

---

## 11. Buy X Get Y dev store checklist (not yet run by the owner)

Set up a collection with three products at $10, $20 and $30. Create: buy 2 from
that collection, get 1 of the same items, free, no limit.

| Cart | Expected |
|---|---|
| 1 item | nothing |
| 2 items | nothing |
| the $10, $20 and $30 items | the $10 item free |
| 3 of one product on one line | exactly 1 unit free |
| 4 items | 1 free |
| 2 of each | both $10 items free |

Then set the maximum uses to 1 and repeat the 6 item cart: only 1 free. Then
create "buy 2 from the collection, get 1 of a different product at 50% off":
2 shirts and the product gives it half price; without the product, nothing.
Confirm the quantity tier and whole order discounts still apply as before.

---

## 12. App security check

Shopify CLI's local security review (`shopify app security ...`, CLI 4.9.x).
Results live in `.shopify/app-security/shopify.app/`, which git ignores.

First run, 20 October 2026: 3 checks with findings, 26 passed, 7 not
applicable, none unresolved.

| Check | Severity | Status |
|---|---|---|
| SCOPE_OVER_REQUEST (2 findings) | High | Fixed: scopes narrowed to `read_products,write_discounts` |
| MISSING_COMPLIANCE_WEBHOOKS | Medium | Fixed: `compliance_topics` subscription and `app/routes/webhooks.compliance.tsx` |
| MISSING_DEPENDENCY_SECURITY_AUTOMATION | Low | Fixed: `.github/dependabot.yml` |

To re-run after changes:

1. `shopify app security check` (scan only, quick).
2. Claude reads `.shopify/app-security/shopify.app/agent-checks.json`, follows
   every check's prompt, and writes one findings document. Last time it was
   saved outside the repo at `C:\Users\mohan\Desktop\ez-discount-app\security-findings.json`.
3. `shopify app security record < <findings file>` (replaces the previous agent
   results; the whole document is validated or nothing is written).
4. `shopify app security review` is the only official combined view.

A hardening idea that is not a finding: the activate, deactivate, delete and
save actions do not check that a discount belongs to this app before changing
it. That stays inside the signed in merchant's own shop, so it crosses no
security boundary, but `getTieredDiscount` before each mutation would close it.

---

## 13. History

29 commits on `main`, oldest first:

1. Template scaffold, then the first Function (quantity tiers).
2. Admin UI: list, create, edit, activate, deactivate, delete.
3. Rename to Quantity Based Discount; ranges and unit caps; product and
   collection targeting; customer rules; discount codes.
4. Whole order discounts (Function, then UI); a tab per kind.
5. 404 fixes (old URLs, admin entry points, ID handling, embedded redirects),
   a shared full width table, the home page with tiles.
6. Buy X Get Y: Function, create page with preview, edit page, polish.
7. Renamed to EZ Master Discount with the website linked; the login form
   removed from the root address.
8. This handover document. Then fixes from the first app security check:
   narrower scopes, the compliance webhooks, and Dependabot.

`git log` has the reasoning for each change in its commit message.
