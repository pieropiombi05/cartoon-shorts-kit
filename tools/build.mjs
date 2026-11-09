// Bundle the engine + this project's story.ts into web/bundle.js (one IIFE, loads from file://, no server needed).
// Usage (from the project folder): node tools/build.mjs
import { build } from "esbuild";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const root = process.cwd();
const story = resolve(root, "story.ts");
if (!existsSync(story)) { console.error("story.ts not found in " + root); process.exit(1); }
await build({
  entryPoints: [resolve(root, "engine/src/main.ts")],
  bundle: true, format: "iife", target: "es2022", outfile: resolve(root, "web/bundle.js"),
  alias: { "@story": story, "@kit": resolve(root, "engine/src") },
  nodePaths: [resolve(root, "node_modules")],
  sourcemap: "inline", logLevel: "warning",
  loader: { ".ts": "ts" },
});
console.log("built web/bundle.js");
