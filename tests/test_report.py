"""Offline PDF tests use only explicitly synthetic source data."""

import copy
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "collector"))
from report import create_pdf, inspect, validate


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.project = json.loads(
            (
                Path(__file__).resolve().parents[1]
                / "examples/sintetis-112-indikator.json"
            ).read_text()
        )
        self.tmp = tempfile.TemporaryDirectory()
        self.output = Path(self.tmp.name) / "report.pdf"

    def tearDown(self):
        self.tmp.cleanup()

    def pdf_text(self, project):
        create_pdf(project, self.output)
        return subprocess.check_output(
            ["pdftotext", "-layout", str(self.output), "-"], text=True
        )

    def test_112_indicators_all_months_toc_statuses_and_page_totals(self):
        before = copy.deepcopy(self.project)
        text = self.pdf_text(self.project)
        for value in [
            "Daftar isi",
            "Indikator sintetis 112",
            "Januari",
            "Desember",
            "0/0",
            "≥ 80%",
            "Penarikan: lengkap terverifikasi",
            "Isi: perlu diperiksa",
            "Laporan pemeriksaan",
            "Kelompok kolom 3/3",
        ]:
            self.assertIn(value, text)
        pages = text.count("\f")
        counters = re.findall(r"Halaman (\d+) dari (\d+)", text)
        self.assertGreater(pages, 5)
        self.assertEqual(
            [(int(n), int(total)) for n, total in counters],
            [(i, pages) for i in range(1, pages + 1)],
        )
        self.assertGreater(text.count("Indikator"), 3)
        self.assertEqual(self.project, before)
        if sys.platform != "win32":
            self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)

    def test_markup_unicode_and_very_long_cell_are_printed_as_text(self):
        p = self.project
        d = p["datasets"][0]
        d["rows"] = d["rows"][:1]
        d["source"]["expectedRows"] = 1
        d["rows"][0]["Indikator"] = (
            "<script>tidak dijalankan</script> & contoh ≥ 0 "
            + ("panjang " * 1200)
            + "PENANDA AKHIR"
        )
        text = self.pdf_text(p)
        self.assertTrue(
            "<script>tidak" in text and "dijalankan</script>" in text,
            "Markup harus tercetak sebagai teks literal meski membungkus baris.",
        )
        self.assertIn("PENANDA AKHIR", text)

    def test_empty_section_mismatch_unknown_and_pending_inventory_are_visible(self):
        p = self.project
        d = p["datasets"][0]
        d["rows"] = []
        d["source"]["rowCount"] = 112
        p["inventory"].append(
            {"menu": "Kegiatan", "unit": "Sintetis", "period": "Februari"}
        )
        text = self.pdf_text(p)
        self.assertIn("Penarikan: gagal", text)
        self.assertIn("Isi: tidak ada data", text)
        self.assertIn("Belum diimpor: Kegiatan", text)

    def test_invalid_manifest_does_not_replace_existing_output(self):
        self.output.write_bytes(b"original")
        self.project["datasets"][0]["source"]["pages"] = [
            {"page": 2, "rowCount": 112, "rowsHash": "a" * 64}
        ]
        with self.assertRaisesRegex(ValueError, "Bukti halaman"):
            create_pdf(self.project, self.output)
        self.assertEqual(self.output.read_bytes(), b"original")

    def test_verification_matches_expected_independent_axes(self):
        d = self.project["datasets"][0]
        s = inspect(d, self.project["inventory"])
        self.assertEqual(
            (
                s["captureStatus"],
                s["contentStatus"],
                s["emptyCells"],
                s["zeroOverZero"],
            ),
            ("lengkap terverifikasi", "perlu diperiksa", 1, 1),
        )
        d["source"]["rowCount"] = 111
        self.assertEqual(
            inspect(d, self.project["inventory"])["captureStatus"], "gagal"
        )

    def test_no_datasets_is_an_explicit_error(self):
        with self.assertRaisesRegex(ValueError, "Belum ada"):
            create_pdf(
                {"schemaVersion": 1, "datasets": [], "inventory": []}, self.output
            )


if __name__ == "__main__":
    unittest.main()
