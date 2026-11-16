// Exports all project source code into one printable HTML file for the
// "Code PDF" submission requirement: open export/StrokeSense-code.html in a
// browser and choose Print → Save as PDF.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const INCLUDE_DIRS = ["src", "scripts", "public", "ml", "python"];
const INCLUDE_FILES = ["package.json", "next.config.ts", "tsconfig.json", "eslint.config.mjs", "vitest.config.mts", "vitest.eval.config.mts"];
const EXTS = new Set([".ts", ".tsx", ".mjs", ".js", ".css", ".json", ".svg", ".py", ".txt"]);
const SKIP = [/^public[\\/](mediapipe|models)/, /favicon\.ico$/, /^ml[\\/]\.venv/, /^python[\\/](\.venv|.*egg-info)/, /\.pytest_cache/, /__pycache__/, /speech-model\.reference\.json$/, /features\.fixture\.json$/, /parity\.fixture\.json$/];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (SKIP.some((re) => re.test(rel))) continue;
    if (entry.isDirectory()) out.push(...(await walk(rel)));
    else if (EXTS.has(extname(entry.name))) out.push(rel);
  }
  return out;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const files = [...INCLUDE_FILES, ...(await Promise.all(INCLUDE_DIRS.map(walk))).flat().sort()];
let lines = 0;
const sections = [];
for (const f of files) {
  const text = await readFile(join(root, f), "utf8");
  lines += text.split("\n").length;
  const id = f.replace(/[^\w]/g, "-");
  sections.push(`<section id="${id}"><h2>${esc(f.replace(/\\/g, "/"))}</h2><pre>${esc(text)}</pre></section>`);
}

const toc = files.map((f) => `<li><a href="#${f.replace(/[^\w]/g, "-")}">${esc(f.replace(/\\/g, "/"))}</a></li>`).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>StrokeSense — source code</title>
<style>
@page { size: A4; margin: 12mm; }
body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; }
h1 { margin: 0; } h1 span { color: #e11d48; }
h2 { font-size: 11pt; background: #0f172a; color: #fff; padding: 4px 8px; border-radius: 4px; margin: 18px 0 6px; break-after: avoid; }
pre { font-family: Consolas, "Courier New", monospace; font-size: 7.6pt; line-height: 1.32; white-space: pre-wrap; word-break: break-word; margin: 0; }
ol { columns: 2; font-size: 8.5pt; }
a { color: #0f172a; }
</style></head><body>
<h1>Stroke<span>Sense</span> — source code</h1>
<p>${files.length} files · ${lines.toLocaleString()} lines · generated ${new Date().toISOString().slice(0, 10)}.
Vendored MediaPipe runtime and model binaries are excluded (downloaded by scripts/setup-assets.mjs).</p>
<h2>Contents</h2><ol>${toc}</ol>
${sections.join("\n")}
</body></html>`;

await mkdir(join(root, "export"), { recursive: true });
const outFile = join(root, "export", "StrokeSense-code.html");
await writeFile(outFile, html);
console.log(`Wrote ${relative(root, outFile)} (${files.length} files, ${lines} lines)`);
