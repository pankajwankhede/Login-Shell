import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

// ui/src/app.css
const source = resolve(scriptDir, "../src/app.css");

// plugin/src/main/resources/web/app.css
const destination = resolve(
  scriptDir,
  "../../src/main/resources/web/app.css"
);

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);

console.log("Copied React CSS:");
console.log("  from:", source);
console.log("  to:  ", destination);
