import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspect,
  syntheticProject,
  verificationReport,
  verificationCSV,
  importText,
  groupRows,
  type Project,
} from "../lib/data";

test("capture completeness remains verified when source cells are blank or 0/0", () => {
  const p = syntheticProject();
  const d = p.datasets[0];
  const s = inspect(d, p.inventory);
  assert.equal(s.captureStatus, "lengkap terverifikasi");
  assert.equal(s.contentStatus, "perlu diperiksa");
  assert.equal(s.status, "sebagian");
  assert.ok(
    s.issues.some(
      (i) => i.row === 2 && i.column === "Januari" && i.kind === "kosong",
    ),
  );
  assert.ok(s.issues.some((i) => i.row === 3 && i.kind === "0/0"));
  assert.ok(!s.issues.some((i) => i.row === 1 && i.column === "Januari"));
  assert.equal(verificationReport(p).sections[0].actualRows, 112);
  assert.match(verificationCSV(p), /kosong/);
});
test("contradictory row and page evidence blocks verified capture", () => {
  const p = syntheticProject();
  const d = p.datasets[0];
  d.source.rowCount = 111;
  assert.equal(inspect(d, p.inventory).captureStatus, "gagal");
  delete d.source.rowCount;
  d.source.pages = [{ page: 1, rowCount: 111, rowsHash: "a".repeat(64) }];
  assert.equal(inspect(d, p.inventory).captureStatus, "gagal");
  d.source.pages[0].rowCount = 112;
  assert.equal(inspect(d, p.inventory).captureStatus, "lengkap terverifikasi");
  d.source.pages = [
    { page: 1, rowCount: 56, rowsHash: "a".repeat(64) },
    { page: 2, rowCount: 56, rowsHash: "a".repeat(64) },
  ];
  assert.equal(inspect(d, p.inventory).captureStatus, "gagal");
});
test("0/0 through original alias columns is reported without renaming raw values", () => {
  const p: Project = {
    schemaVersion: 1,
    inventory: [{ menu: "Area Klinik", period: "Jan" }],
    datasets: [
      {
        id: "1",
        name: "Sintetis",
        source: {
          menu: "Area Klinik",
          period: "Jan",
          expectedRows: 1,
          check: "passed",
          columnRoles: {
            numerator: "Pengukuran / Numerator",
            denominator: "Pengukuran / Denominator",
          },
        },
        rows: [
          { "Pengukuran / Numerator": "0", "Pengukuran / Denominator": "0" },
        ],
      },
    ],
  };
  const s = inspect(p.datasets[0], p.inventory);
  assert.equal(s.zeroOverZero, 1);
  assert.equal(s.captureStatus, "lengkap terverifikasi");
  assert.equal(s.contentStatus, "perlu diperiksa");
  assert.equal(s.issues[0].kind, "0/0");
});
test("malformed proof is rejected at import", () => {
  const p = syntheticProject();
  p.datasets[0].source.pages = [
    { page: 2, rowCount: 112, rowsHash: "a".repeat(64) },
  ];
  assert.throws(
    () => importText(JSON.stringify(p), "bad.json"),
    /Bukti halaman/,
  );
});
test("missing columns and errors are retained alongside cell findings in report", () => {
  const p = syntheticProject();
  const d = p.datasets[0];
  d.source.requiredColumns = ["Wajib"];
  d.source.errors = ["Total sumber berubah"];
  const csv = verificationCSV(p);
  assert.match(csv, /Wajib/);
  assert.match(csv, /Total sumber berubah/);
  assert.match(csv, /kosong/);
});
test("grouped monthly headers use role mappings and remain lossless", () => {
  const p = syntheticProject();
  const d = p.datasets[0];
  d.source.columnRoles = {};
  d.rows = d.rows.slice(0, 1);
  d.source.expectedRows = 1;
  for (const month of [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ]) {
    d.source.columnRoles["month:" + month] = "Hasil / " + month;
    d.rows[0]["Hasil / " + month] = d.rows[0][month];
    delete d.rows[0][month];
  }
  assert.deepEqual(inspect(d, p.inventory).missingMonths, []);
  assert.equal(groupRows(p, "month").length, 12);
});
test("verified empty source is distinct from failed capture", () => {
  const p: Project = {
    schemaVersion: 1,
    inventory: [{ menu: "Kegiatan", period: "Jan" }],
    datasets: [
      {
        id: "0",
        name: "Kosong",
        source: {
          menu: "Kegiatan",
          period: "Jan",
          check: "passed",
          expectedRows: 0,
          rowCount: 0,
          columns: ["Tanggal", "Kegiatan"],
          requiredColumns: ["Tanggal", "Kegiatan"],
        },
        rows: [],
      },
    ],
  };
  const s = inspect(p.datasets[0], p.inventory);
  assert.equal(s.captureStatus, "lengkap terverifikasi");
  assert.equal(s.contentStatus, "tidak ada data");
  assert.deepEqual(s.missingColumns, []);
});

test("inventory scoped to a different unit cannot verify this capture", () => {
  const p = syntheticProject();
  p.inventory[0].unit = "Unit Lain";
  assert.equal(
    inspect(p.datasets[0], p.inventory).captureStatus,
    "belum diperiksa",
  );
});
test("unknown calendar metadata requires content review without failing capture", () => {
  const p = syntheticProject();
  const d = p.datasets[0];
  d.rows = d.rows.slice(0, 1);
  d.source.expectedRows = 1;
  d.source.contentWarnings = ["Bulan/tahun belum dikenali"];
  assert.equal(inspect(d, p.inventory).captureStatus, "lengkap terverifikasi");
  assert.equal(inspect(d, p.inventory).contentStatus, "perlu diperiksa");
  assert.match(verificationCSV(p), /Bulan\/tahun belum dikenali/);
});

test("unimported inventory targets appear in both verification exports", () => {
  const p = syntheticProject();
  p.inventory.push({
    menu: "Kegiatan",
    unit: "Unit B",
    year: "2025",
    period: "Februari",
  });
  assert.equal(verificationReport(p).pendingInventory.length, 1);
  assert.match(verificationCSV(p), /Target inventaris belum diimpor/);
  assert.match(verificationCSV(p), /Unit B/);
});
