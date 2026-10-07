import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { describe, beforeAll, test, expect } from "vitest";
import {
  buildFunction,
  getFunctionInfo,
  loadSchema,
  loadInputQuery,
  loadFixture,
  validateTestAssets,
  runFunction,
} from "@shopify/shopify-function-test-helpers";

const testsDir = path.dirname(fileURLToPath(import.meta.url));

describe("Quantity based discount", () => {
  let schema;
  let functionDir;
  let functionInfo;
  let schemaPath;
  let targeting;
  let functionRunnerPath;
  let wasmPath;

  beforeAll(async () => {
    functionDir = path.dirname(testsDir);
    await buildFunction(functionDir);
    functionInfo = await getFunctionInfo(functionDir);
    ({ schemaPath, functionRunnerPath, wasmPath, targeting } = functionInfo);
    schema = await loadSchema(schemaPath);
  }, 120000);

  const fixturesDir = path.join(testsDir, "fixtures");
  const fixtureFiles = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(fixturesDir, file));

  fixtureFiles.forEach((fixtureFile) => {
    test(`${path.basename(fixtureFile, ".json")}`, async () => {
      const fixture = await loadFixture(fixtureFile);
      const targetInputQueryPath = targeting[fixture.target].inputQueryPath;
      const inputQueryAST = await loadInputQuery(targetInputQueryPath);

      const validationResult = await validateTestAssets({
        schema,
        fixture,
        inputQueryAST,
      });
      expect(validationResult.inputQuery.errors).toEqual([]);
      expect(validationResult.inputFixture.errors).toEqual([]);
      expect(validationResult.outputFixture.errors).toEqual([]);

      const runResult = await runFunction(
        fixture,
        functionRunnerPath,
        wasmPath,
        targetInputQueryPath,
        schemaPath,
      );
      expect(runResult.error).toBeNull();
      expect(runResult.result.output).toEqual(fixture.expectedOutput);
    }, 20000);
  });
});
