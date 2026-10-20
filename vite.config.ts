import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { reactRouter } from "@react-router/dev/vite";
import {
  defineConfig,
  normalizePath,
  transformWithEsbuild,
  type Plugin,
  type UserConfig,
} from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

const FUNCTION_DIR = normalizePath(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "extensions/tiered-discount",
  ),
);
const FUNCTION_ID_PREFIX = "\0discount-function:";

function isInFunctionDir(file: string): boolean {
  return normalizePath(file)
    .toLowerCase()
    .startsWith(`${FUNCTION_DIR.toLowerCase()}/`);
}

/**
 * The live preview imports the Function's source from
 * extensions/tiered-discount. In development Vite would serve those files at
 * /extensions/..., but the Shopify CLI's dev proxy sends every path starting
 * with /extensions to its own extensions server, which answers 404, so the
 * discount pages fail to load. This serves those files as virtual modules
 * instead (under /@id/), which the proxy passes through to Vite. Production
 * builds bundle the files and are unaffected.
 */
function functionSourceForDev(): Plugin {
  return {
    name: "discount-function-source",
    apply: "serve",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return null;

      const from = importer.startsWith(FUNCTION_ID_PREFIX)
        ? importer.slice(FUNCTION_ID_PREFIX.length)
        : importer.split("?")[0];
      const target = path.resolve(path.dirname(from), source);
      if (!isInFunctionDir(target)) return null;

      const file = [target, `${target}.ts`].find(
        (candidate) =>
          fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
      );

      return file ? FUNCTION_ID_PREFIX + normalizePath(file) : null;
    },
    async load(id) {
      if (!id.startsWith(FUNCTION_ID_PREFIX)) return null;

      const file = id.slice(FUNCTION_ID_PREFIX.length);
      this.addWatchFile(file);

      const result = await transformWithEsbuild(
        fs.readFileSync(file, "utf8"),
        file,
        { loader: "ts" },
      );

      // No source map: these files are only served in development.
      return { code: result.code, map: null };
    },
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [functionSourceForDev(), reactRouter(), tsconfigPaths()],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
}) satisfies UserConfig;
