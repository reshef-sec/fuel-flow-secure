/**
 * Resolve hooks for running the src/lib/*.test.ts suites with Node's native
 * TypeScript type stripping (Node >= 22.18 / 24): maps the "@/..." alias to src/
 * and resolves extensionless relative imports to .ts files, as Vite does.
 *   node --import ./scripts/ts-test-hooks.mjs --test "src/lib/*.test.ts"
 */
import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
const EXTS = [".ts", ".tsx", ".js", ".mjs"];

function withExtension(file) {
  if (existsSync(file) && statSync(file).isFile()) return file;
  for (const ext of EXTS) if (existsSync(file + ext)) return file + ext;
  for (const ext of EXTS) {
    const index = path.join(file, `index${ext}`);
    if (existsSync(index)) return index;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = null;
    if (specifier.startsWith("@/")) {
      target = withExtension(path.join(srcDir, specifier.slice(2)));
    } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const parent = fileURLToPath(context.parentURL);
      if (!parent.includes(`${path.sep}node_modules${path.sep}`)) {
        target = withExtension(path.resolve(path.dirname(parent), specifier));
      }
    }
    return nextResolve(target ? pathToFileURL(target).href : specifier, context);
  },
});
