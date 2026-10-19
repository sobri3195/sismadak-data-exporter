import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
function pdfText(doc: ReturnType<typeof createPDF>) {
  const dir = mkdtempSync(tmpdir() + "/sismadak-pdf-");
  try {
    writeFileSync(dir + "/test.pdf", Buffer.from(doc.output("arraybuffer")));
    return execFileSync("pdftotext", ["-layout", dir + "/test.pdf", "-"], {
      encoding: "utf8",
    });
  } finally {
    rmSync(dir, { recursive: true });
  }
}
import assert from "node:assert/strict";
import {
  groupRows,
  csvArchive,
  duplicates,
  importText,
  inspect,
  syntheticProject,
  valueKind,
  type Project,
} from "../lib/data";
import { createPDF } from "../lib/pdf";
test("112 synthetic indicators × 12 months preserve blank, zero, and 0/0", () => {
  const p = syntheticProject();
  assert.equal(p.datasets[0].rows.length, 112);
  assert.equal(Object.keys(p.datasets[0].rows[0]).length, 16);
  assert.equal(valueKind(p.datasets[0].rows[0].Januari), "nol");
  assert.equal(valueKind(p.datasets[0].rows[1].Januari), "kosong");
  assert.equal(valueKind(p.datasets[0].rows[2].Januari), "0/0");
  assert.equal(valueKind(null), "kosong");
  assert.equal(valueKind(0), "nol");
  assert.equal(inspect(p.datasets[0], p.inventory).status, "sebagian");
});
test("JSON and CSV archives round trip all raw types and metadata", () => {
  const p = syntheticProject();
  p.datasets[0].rows.push({
    raw: "=SUM(A1)",
    nullable: null,
    zero: 0,
    text: "001",
    nested: { a: 'a,b\n"c"' },
    empty: "",
  });
  for (const text of [JSON.stringify(p), csvArchive(p)]) {
    const q = importText(
      text,
      text.startsWith("{") ? "project.json" : "project.csv",
    );
    assert.deepEqual(q.datasets[0].rows, p.datasets[0].rows);
    assert.deepEqual(q.datasets[0].source, p.datasets[0].source);
    assert.deepEqual(q.inventory, p.inventory);
  }
});
test("ordinary CSV preserves numeric text and rejects malformed rows", () => {
  const p = importText(
    "No,Indikator,Januari\n001,Contoh,0\n002,Kosong,\n003,Rasio,0/0",
    "a.csv",
  );
  assert.equal(p.datasets[0].rows[0].No, "001");
  assert.equal(p.datasets[0].rows[1].Januari, "");
  assert.throws(() => importText("a,b\n1,2,3", "bad.csv"));
});
test("duplicates honor source context and canonical key order", () => {
  const p = syntheticProject();
  const d = p.datasets[0];
  d.rows = [
    { a: 0, b: "" },
    { b: "", a: 0 },
    { a: "0", b: "" },
  ];
  assert.equal(duplicates(p.datasets), 1);
  assert.equal(
    duplicates([d, { ...d, source: { ...d.source, period: "2024" } }]),
    2,
  );
  assert.equal(duplicates([d, { ...d, id: "another" }]), 4);
});
test("verification requires exact row evidence and inventory period; unknown fields retained", () => {
  const p = syntheticProject();
  const d = p.datasets[0];
  d.rows[1].Januari = "90%";
  assert.equal(inspect(d, p.inventory).status, "lengkap terverifikasi");
  assert.equal(inspect(d, []).status, "belum diperiksa");
  d.source.expectedRows = 113;
  assert.equal(inspect(d, p.inventory).status, "sebagian");
  d.source.check = "failed";
  assert.equal(inspect(d, p.inventory).status, "gagal");
  d.rows[0].Tambahan = "x";
  assert.ok(inspect(d, p.inventory).unknownColumns.includes("Tambahan"));
  delete d.rows[0].Februari;
  for (const r of d.rows) delete r.Februari;
  assert.ok(inspect(d, p.inventory).missingMonths.includes("Februari"));
});
test("invalid manifests fail clearly", () => {
  assert.throws(() => importText('{"datasets":[{"rows":[0]}]}', "bad.json"));
  assert.throws(() => importText('{"datasets":[],"inventory":{}}', "bad.json"));
});
test("PDF with 112 rows and 12 months has contents, all indicators, split columns, repeated headers and page numbers", () => {
  const p = syntheticProject();
  const doc = createPDF(p);
  const pdf = pdfText(doc);
  assert.ok(doc.getNumberOfPages() > 5);
  assert.match(pdf, /Daftar isi/);
  assert.match(pdf, /Indikator sintetis 112/);
  assert.match(pdf, /Desember/);
  assert.match(pdf, /≥ 80%/);
  assert.match(pdf, /0\/0/);
  assert.match(pdf, /Kelompok kolom 3\/3/);
  assert.ok((pdf.match(/Indikator/g) || []).length >= 3);
  assert.match(pdf, /Halaman 1 dari/);
  assert.match(pdf, /SINTETIS/);
});
test("PDF contents handles more than twenty sections", () => {
  const p: Project = {
    schemaVersion: 1,
    inventory: [],
    datasets: Array.from({ length: 21 }, (_, i) => ({
      id: String(i),
      name: `Section ${i + 1}`,
      source: { menu: "Test" },
      rows: [{ Indikator: "Example", Nilai: "0/0" }],
    })),
  };
  const pdf = pdfText(createPDF(p));
  assert.match(pdf, /21. Section 21/);
  assert.match(pdf, /Halaman 2 dari/);
});

test("grouping includes all 12 months and row-level unit/year context", () => {
  const p = syntheticProject();
  assert.equal(groupRows(p, "month").length, 12);
  assert.ok(groupRows(p, "month").every((g) => g.count === 112));
  assert.equal(groupRows(p, "indicator").length, 112);
  p.datasets[0].rows[0].Unit = "Unit A";
  assert.equal(
    groupRows(p, "unit").find((g) => g.label === "Unit A")?.count,
    1,
  );
});
