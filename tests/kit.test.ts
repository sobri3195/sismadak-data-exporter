import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";

test("downloadable collector ZIP contains only reviewed sources with matching checksums", () => {
  const dir = mkdtempSync(tmpdir() + "/sismadak-kit-");
  try {
    execFileSync(process.execPath, [
      "scripts/build-collector.mjs",
      dir + "/kit.zip",
    ]);
    const files = unzipSync(readFileSync(dir + "/kit.zip"));
    assert.deepEqual(
      Object.keys(files).sort(),
      [
        "collect.py",
        "adapters.py",
        "desktop.py",
        "report.py",
        "profiles.py",
        "requirements.txt",
        "PANDUAN.md",
        "mulai.cmd",
        "mulai.sh",
        "SHA256SUMS.txt",
      ].sort(),
    );
    for (const line of strFromU8(files["SHA256SUMS.txt"]).trim().split("\n")) {
      const [hash, name] = line.split("  ");
      assert.equal(
        createHash("sha256").update(files[name]).digest("hex"),
        hash,
      );
      assert.deepEqual(
        Buffer.from(files[name]),
        readFileSync("collector/" + name),
      );
    }
  } finally {
    rmSync(dir, { recursive: true });
  }
});
