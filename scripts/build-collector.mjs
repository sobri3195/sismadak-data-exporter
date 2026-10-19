import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Only these reviewed source files belong in the public download. Never zip a directory.
const names = [
  "collect.py",
  "adapters.py",
  "desktop.py",
  "requirements.txt",
  "PANDUAN.md",
  "mulai.cmd",
  "mulai.sh",
];
const files = {};
const hashes = {};
for (const name of names) {
  const bytes = readFileSync(resolve(root, "collector", name));
  files[name] = [
    new Uint8Array(bytes),
    { mtime: new Date("2020-01-01T00:00:00Z") },
  ];
  hashes[name] = createHash("sha256").update(bytes).digest("hex");
}
files["SHA256SUMS.txt"] = [
  new TextEncoder().encode(
    Object.entries(hashes)
      .map(([name, hash]) => `${hash}  ${name}`)
      .join("\n") + "\n",
  ),
  { mtime: new Date("2020-01-01T00:00:00Z") },
];
const output = resolve(
  process.argv[2] || resolve(root, "public/sismadak-collector.zip"),
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, zipSync(files, { level: 9 }));
console.log(
  "Paket collector dibuat: hanya kode, launcher, panduan, dan checksum.",
);
