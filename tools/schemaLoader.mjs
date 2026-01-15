import fs from "fs";
import path from "path";

/**
 * File-based schema loader (v0.1)
 *
 * Treats schema refs as relative to repo root.
 * Example in policy:
 *   ./packs/stripe-webhook/schemas/event.v1.json
 * or
 *   ./examples/schemas/license.activate.request.json
 */
export function fileSchemaLoader(rootDir) {
  return (ref) => {
    const clean = ref.startsWith("./") ? ref.slice(2) : ref;
    const abs = path.isAbsolute(clean) ? clean : path.join(rootDir, clean);
    if (!fs.existsSync(abs)) throw new Error(`Schema not found: ${ref} -> ${abs}`);
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  };
}
