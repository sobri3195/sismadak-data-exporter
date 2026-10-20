import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { createDownloadBundle } from "../lib/bundle";
import {
  duplicates,
  emptyProject,
  importText,
  syntheticProject,
} from "../lib/data";

test("ZIP preserves all sections, raw values, duplicates and pending inventory without mutating source", () => {
  const project = syntheticProject();
  project.datasets.push({
    ...structuredClone(project.datasets[0]),
    id: "second",
    name: "../../menu/≠",
  });
  project.datasets[1].rows = [
    {
      No: "001",
      Indikator: "=1+1",
      Januari: 0,
      Februari: null,
      Maret: "0/0",
      detail: { raw: "001" },
    },
  ];
  project.datasets[1].rows.push(structuredClone(project.datasets[0].rows[0]));
  project.inventory.push({ menu: "Kegiatan belum diimpor", period: "2026" });
  const before = JSON.stringify(project);
  const files = unzipSync(createDownloadBundle(project));
  assert.deepEqual(
    Object.keys(files).sort(),
    [
      "BACA-SAYA.txt",
      "arsip.csv",
      "baris.csv",
      "manifest.json",
      "pemeriksaan.csv",
      "pemeriksaan.json",
      "project.json",
      "sismadak-gabungan.pdf",
    ].sort(),
  );
  assert.equal(
    strFromU8(files["sismadak-gabungan.pdf"].subarray(0, 4)),
    "%PDF",
  );
  assert.deepEqual(JSON.parse(strFromU8(files["project.json"])), project);
  const roundTrip = importText(strFromU8(files["arsip.csv"]), "arsip.csv");
  assert.deepEqual(
    roundTrip.datasets.map((d) => d.rows),
    project.datasets.map((d) => d.rows),
  );
  assert.deepEqual(roundTrip.inventory, project.inventory);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.equal(manifest.datasets, 2);
  assert.equal(manifest.rows, 114);
  assert.equal(duplicates(roundTrip.datasets), duplicates(project.datasets));
  assert.ok(duplicates(roundTrip.datasets) > 0);
  assert.equal(manifest.synthetic, true);
  for (const file of manifest.files)
    assert.equal(files[file.name].length, file.bytes);
  const report = strFromU8(files["pemeriksaan.json"]);
  assert.match(report, /Kegiatan belum diimpor/);
  assert.match(report, /perlu diperiksa/);
  assert.match(strFromU8(files["BACA-SAYA.txt"]), /CONTOH DATA SINTETIS/);
  assert.equal(JSON.stringify(project), before);
});

test("ZIP rejects missing datasets and retains an imported empty source with its evidence", () => {
  assert.throws(
    () => createDownloadBundle(emptyProject()),
    /Impor kumpulan data/,
  );
  const project = syntheticProject();
  project.datasets[0].rows = [];
  const files = unzipSync(createDownloadBundle(project));
  const report = JSON.parse(strFromU8(files["pemeriksaan.json"]));
  assert.equal(report.sections[0].actualRows, 0);
  assert.notEqual(report.sections[0].captureStatus, "lengkap terverifikasi");
  assert.deepEqual(JSON.parse(strFromU8(files["project.json"])), project);
});
