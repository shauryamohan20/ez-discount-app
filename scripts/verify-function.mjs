// Runs every Function test fixture against the already built wasm, with the
// same helpers and assertions as extensions/tiered-discount/tests/function.test.js.
//
// It exists because `pnpm test` builds the wasm through the Shopify CLI, and
// when the global CLI install is broken every test is skipped. This skips the
// two steps that need the CLI (building, and asking it for file paths) and
// uses the wasm the running dev server builds whenever the source changes.
//
// Usage, from the project root:
//   node scripts/verify-function.mjs
//   node scripts/verify-function.mjs <fixtures folder>
//
// Check extensions/tiered-discount/dist/function.wasm is newer than the files
// in src first, or you are testing an older build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(root, "extensions/tiered-discount");

/** The function-runner binary ships inside the global Shopify CLI install. */
function findFunctionRunner() {
  const bin = path.join(
    process.env.APPDATA ?? "",
    "npm/node_modules/@shopify/cli/bin",
  );
  const runner = fs.existsSync(bin)
    ? fs.readdirSync(bin).find((file) => /^function-runner.*\.exe$/.test(file))
    : undefined;

  if (!runner) {
    console.error(`No function-runner found in ${bin}.`);
    process.exit(2);
  }

  return path.join(bin, runner);
}

const helpersEntry = path.join(
  extensionDir,
  "node_modules/@shopify/shopify-function-test-helpers/dist/wasm-testing-helpers.js",
);
const {
  loadSchema,
  loadInputQuery,
  loadFixture,
  validateTestAssets,
  runFunction,
} = await import(pathToFileURL(fs.realpathSync(helpersEntry)).href);

const functionRunnerPath = findFunctionRunner();
const schemaPath = path.join(extensionDir, "schema.graphql");
const wasmPath = path.join(extensionDir, "dist/function.wasm");
// Each fixture names its target; this maps it to that target's input query.
const queryPaths = {
  "cart.lines.discounts.generate.run": path.join(
    extensionDir,
    "src/cart_lines_discounts_generate_run.graphql",
  ),
  "cart.delivery-options.discounts.generate.run": path.join(
    extensionDir,
    "src/cart_delivery_options_discounts_generate_run.graphql",
  ),
};

const schema = await loadSchema(schemaPath);

// Matches vitest's toEqual, which ignores undefined properties.
const normalise = (value) => JSON.parse(JSON.stringify(value ?? null));

const fixturesDir =
  process.argv[2] ?? path.join(extensionDir, "tests/fixtures");
const files = fs
  .readdirSync(fixturesDir)
  .filter((file) => file.endsWith(".json"))
  .sort();

let passed = 0;
const failures = [];

for (const file of files) {
  const name = path.basename(file, ".json");

  try {
    const fixture = await loadFixture(path.join(fixturesDir, file));
    const queryPath = queryPaths[fixture.target];
    if (!queryPath) {
      failures.push(`${name}: unknown target ${fixture.target}`);
      continue;
    }
    const inputQueryAST = await loadInputQuery(queryPath);
    const validation = await validateTestAssets({
      schema,
      fixture,
      inputQueryAST,
    });

    const problems = [
      ...validation.inputQuery.errors,
      ...validation.inputFixture.errors,
      ...validation.outputFixture.errors,
    ];
    if (problems.length) {
      failures.push(
        `${name}: fixture invalid: ${JSON.stringify(problems).slice(0, 300)}`,
      );
      continue;
    }

    const run = await runFunction(
      fixture,
      functionRunnerPath,
      wasmPath,
      queryPath,
      schemaPath,
    );
    if (run.error) {
      failures.push(`${name}: run error: ${String(run.error).slice(0, 300)}`);
      continue;
    }

    if (
      !isDeepStrictEqual(
        normalise(run.result.output),
        normalise(fixture.expectedOutput),
      )
    ) {
      failures.push(
        `${name}: output mismatch\n    got:      ${JSON.stringify(run.result.output)}\n    expected: ${JSON.stringify(fixture.expectedOutput)}`,
      );
      continue;
    }

    passed++;
  } catch (error) {
    failures.push(`${name}: threw: ${error?.message ?? error}`);
  }
}

console.log(
  `${passed} passed, ${failures.length} failed, ${files.length} total`,
);
for (const failure of failures) console.log(`FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
