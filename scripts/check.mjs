import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["api", "lib", "public", "scripts", "test"];
const files = [];
function visit(path) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) visit(full);
    else if (/\.(js|mjs)$/.test(name)) files.push(full);
  }
}
for (const root of roots) visit(root);
for (const file of files) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
console.log(`Syntax checked ${files.length} JavaScript files`);
