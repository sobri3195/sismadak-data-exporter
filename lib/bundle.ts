import { strToU8, zipSync } from "fflate";
import {
  csvArchive,
  csvTable,
  verificationCSV,
  verificationReport,
  type Project,
} from "./data";
import { createPDF } from "./pdf";

/** Fixed entry names keep imported menu names out of ZIP paths. No network or disk IO. */
export function createDownloadBundle(project: Project): Uint8Array {
  if (!project.datasets.length) {
    throw new Error("Impor kumpulan data sebelum membuat paket unduhan.");
  }
  const files: Record<string, Uint8Array> = {
    "sismadak-gabungan.pdf": new Uint8Array(
      createPDF(project).output("arraybuffer"),
    ),
    "project.json": strToU8(JSON.stringify(project, null, 2)),
    "arsip.csv": strToU8(csvArchive(project)),
    "baris.csv": strToU8(csvTable(project)),
    "pemeriksaan.json": strToU8(
      JSON.stringify(verificationReport(project), null, 2),
    ),
    "pemeriksaan.csv": strToU8(verificationCSV(project)),
    "BACA-SAYA.txt": strToU8(
      [
        "SISMADAK Data Exporter — paket unduhan lokal",
        project.synthetic
          ? "CONTOH DATA SINTETIS: proyek mengandung data contoh."
          : "Data berasal dari file yang diimpor pengguna.",
        "Cakupan hanya data yang berhasil diimpor, bukan bukti seluruh data akun telah diambil.",
        "PDF memuat seluruh bagian, termasuk duplikasi, tanpa mengikuti filter pratinjau.",
        "project.json dan arsip.csv dapat diimpor ulang untuk mempertahankan nilai dan metadata asli.",
        "baris.csv memuat objek baris dan konteks sumber sebagai JSON; bukan CSV untuk impor ulang proyek.",
        "pemeriksaan.json/csv memuat status, temuan, dan inventaris yang belum diimpor.",
        "Kosong, nol, dan 0/0 tetap berbeda. Tidak ada penghapusan atau perbaikan otomatis.",
        "Periksa hasil sebelum dipakai. Simpan paket ini secara privat; jangan unggah ke repository publik.",
      ].join("\n"),
    ),
  };
  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        synthetic: !!project.synthetic,
        scope:
          "Hanya kumpulan data yang diimpor; seluruh cakupan akun belum dibuktikan.",
        datasets: project.datasets.length,
        rows: project.datasets.reduce(
          (count, dataset) => count + dataset.rows.length,
          0,
        ),
        files: Object.entries(files).map(([name, bytes]) => ({
          name,
          bytes: bytes.length,
        })),
      },
      null,
      2,
    ),
  );
  // Stored entries avoid worker/CDN dependencies and expensive recompression of PDF.
  return zipSync(files, { level: 0 });
}
