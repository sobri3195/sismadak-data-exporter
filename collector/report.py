"""Offline combined PDF export. No network requests or credential handling."""

import argparse
import io
import json
import os
import re
import threading
import tempfile
from html import escape
from pathlib import Path
from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    PageBreak,
    LongTable,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents
from adapters import MONTHS

LOCK = threading.Lock()
KNOWN = {
    "No",
    "Kategori",
    "Indikator",
    *MONTHS,
    "Benchmark",
    "Unit",
    "Tahun",
    "Bulan",
    "Pembilang",
    "Penyebut",
    "Tanggal",
    "Nilai",
    "Status",
}


def kind(value):
    if value is None or value == "":
        return "kosong"
    if isinstance(value, str) and re.fullmatch(r"\s*0\s*/\s*0\s*", value):
        return "0/0"
    if value == "0" or type(value) in (int, float) and value == 0:
        return "nol"
    return "nilai"


def validate(project):
    if (
        not isinstance(project, dict)
        or project.get("schemaVersion") != 1
        or not isinstance(project.get("datasets"), list)
        or not isinstance(project.get("inventory", []), list)
    ):
        raise ValueError("Format proyek tidak valid; gunakan JSON hasil collector.")
    for item in project.get("inventory", []):
        if not isinstance(item, dict) or not isinstance(item.get("menu"), str):
            raise ValueError("Inventaris tidak valid.")
        if any(
            k in item and not isinstance(item[k], str)
            for k in ("unit", "year", "period")
        ):
            raise ValueError("Konteks inventaris tidak valid.")
    for d in project["datasets"]:
        if (
            not isinstance(d, dict)
            or not isinstance(d.get("rows"), list)
            or any(not isinstance(r, dict) for r in d["rows"])
        ):
            raise ValueError("Baris proyek tidak valid.")
        source = d.get("source")
        if not isinstance(source, dict) or not isinstance(source.get("menu"), str):
            raise ValueError("Metadata sumber tidak valid.")
        for key in ("unit", "year", "period", "url", "adapter", "capturedAt"):
            if key in source and not isinstance(source[key], str):
                raise ValueError("Metadata sumber harus berupa teks.")
        for key in ("expectedRows", "rowCount"):
            if key in source and (type(source[key]) is not int or source[key] < 0):
                raise ValueError("Jumlah baris sumber tidak valid.")
        for key in ("columns", "requiredColumns", "contentWarnings", "errors"):
            if key in source and (
                not isinstance(source[key], list)
                or any(not isinstance(c, str) for c in source[key])
            ):
                raise ValueError("Daftar metadata sumber tidak valid.")
        if "columnRoles" in source and (
            not isinstance(source["columnRoles"], dict)
            or any(not isinstance(v, str) for v in source["columnRoles"].values())
        ):
            raise ValueError("Pemetaan kolom tidak valid.")
        if "check" in source and source["check"] not in (
            "passed",
            "failed",
            "unchecked",
        ):
            raise ValueError("Status penarikan tidak valid.")
        if "pages" in source:
            if not isinstance(source["pages"], list):
                raise ValueError("Bukti halaman tidak valid.")
            for i, p in enumerate(source["pages"]):
                if (
                    not isinstance(p, dict)
                    or type(p.get("page")) is not int
                    or p["page"] != i + 1
                    or type(p.get("rowCount")) is not int
                    or p["rowCount"] < 0
                    or not isinstance(p.get("rowsHash"), str)
                    or not re.fullmatch("[a-f0-9]{64}", p["rowsHash"])
                ):
                    raise ValueError("Bukti halaman tidak valid.")


def matches(source, item):
    return (
        item.get("menu") == source.get("menu")
        and item.get("period") == source.get("period")
        and all(k not in item or item[k] == source.get(k, "") for k in ("unit", "year"))
    )


def inspect(d, inventory):
    source = d["source"]
    rows = d["rows"]
    roles = source.get("columnRoles", {})
    columns = list(
        dict.fromkeys([*source.get("columns", []), *(k for row in rows for k in row)])
    )
    rekap = (
        source.get("adapter") == "rekap-imut-rs"
        or "Indikator" in columns
        and any(m in columns for m in MONTHS)
    )
    missing_months = (
        [m for m in MONTHS if roles.get("month:" + m, m) not in columns]
        if rekap
        else []
    )
    required = source.get(
        "requiredColumns",
        ["No", "Kategori", "Indikator", *MONTHS, "Benchmark"] if rekap else [],
    )
    missing = [c for c in required if c not in columns]
    empty = sum(kind(row.get(c)) == "kosong" for row in rows for c in columns)
    ratios = sum(
        any(kind(v) == "0/0" for v in row.values())
        or kind(row.get(roles.get("numerator", "Pembilang"))) == "nol"
        and kind(row.get(roles.get("denominator", "Penyebut"))) == "nol"
        for row in rows
    )
    unknown = [c for c in columns if c not in KNOWN and c not in roles.values()]
    evidence = []
    if "rowCount" in source and source["rowCount"] != len(rows):
        evidence.append("Jumlah baris manifest berbeda dari file yang diimpor.")
    if "pages" in source:
        if sum(p["rowCount"] for p in source["pages"]) != len(rows):
            evidence.append("Jumlah baris bukti halaman berbeda dari hasil impor.")
        if len({p["rowsHash"] for p in source["pages"]}) != len(source["pages"]):
            evidence.append(
                "Fingerprint halaman berulang; periksa duplikasi pagination."
            )
    errors = [*source.get("errors", []), *evidence]
    capture = (
        "gagal"
        if source.get("check") == "failed" or errors
        else (
            "sebagian"
            if "expectedRows" in source and source["expectedRows"] != len(rows)
            else (
                "lengkap terverifikasi"
                if source.get("check") == "passed"
                and source.get("expectedRows") == len(rows)
                and source.get("period")
                and any(matches(source, i) for i in inventory)
                else "belum diperiksa"
            )
        )
    )
    content = (
        "tidak ada data"
        if not rows
        else (
            "perlu diperiksa"
            if empty
            or missing
            or missing_months
            or ratios
            or unknown
            or source.get("contentWarnings")
            else "lengkap"
        )
    )
    return {
        "columns": columns,
        "captureStatus": capture,
        "contentStatus": content,
        "emptyCells": empty,
        "zeroOverZero": ratios,
        "missingColumns": missing,
        "missingMonths": missing_months,
        "unknownColumns": unknown,
        "errors": errors,
    }


def text(value):
    if value is None:
        return "null"
    if isinstance(value, (dict, list, bool)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


class ReportDoc(BaseDocTemplate):
    def build(self, flowables, *args, **kwargs):
        super().build(flowables, *args, **kwargs)
        self.previousPageCount = self.page

    def afterFlowable(self, flow):
        if getattr(flow, "_bookmarkName", None):
            key = flow._bookmarkName
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flow.getPlainText(), key, 0, False)
            self.notify("TOCEntry", (0, flow.getPlainText(), self.page, key))


def create_pdf(project, output):
    validate(project)
    if not project["datasets"]:
        raise ValueError("Belum ada kumpulan data untuk dibuat PDF.")
    # ReportLab font registration is process-global; serialize exports in GUI/CLI.
    with LOCK:
        if "CollectorVera" not in pdfmetrics.getRegisteredFontNames():
            font = Path(rl_config.__file__).parent / "fonts" / "Vera.ttf"
            pdfmetrics.registerFont(TTFont("CollectorVera", str(font)))
        styles = getSampleStyleSheet()
        for style in styles.byName.values():
            style.fontName = "CollectorVera"
        body = ParagraphStyle(
            "RawValue",
            fontName="CollectorVera",
            fontSize=8,
            leading=11,
            splitLongWords=True,
        )
        metadata = ParagraphStyle(
            "SourceInfo", parent=body, fontSize=10, leading=15, spaceAfter=9
        )

        def para(value, style=body):
            return Paragraph(escape(text(value)).replace("\n", "<br/>"), style)

        def table(headers, rows):
            width = 267 * mm / len(headers)
            result = LongTable(
                [[para(h) for h in headers], *[[para(v) for v in row] for row in rows]],
                colWidths=[width] * len(headers),
                repeatRows=1,
                splitByRow=1,
                splitInRow=1,
                hAlign=TA_LEFT,
            )
            result.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e7f3f3")),
                        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cdd8df")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 6),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                        ("TOPPADDING", (0, 0), (-1, -1), 5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ]
                )
            )
            return result

        buffer = io.BytesIO()
        doc = ReportDoc(
            buffer,
            pagesize=landscape(A4),
            leftMargin=15 * mm,
            rightMargin=15 * mm,
            topMargin=19 * mm,
            bottomMargin=18 * mm,
            title="SISMADAK Data Exporter",
            author="SISMADAK Collector",
        )
        frame = Frame(
            doc.leftMargin,
            doc.bottomMargin,
            doc.width,
            doc.height,
            id="body",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )

        def header(canv, document):
            canv.saveState()
            canv.setFont("CollectorVera", 8)
            canv.drawString(
                15 * mm,
                201 * mm,
                "SISMADAK Data Exporter"
                + (" · CONTOH SINTETIS" if project.get("synthetic") else ""),
            )
            canv.drawRightString(
                282 * mm,
                9 * mm,
                f'Halaman {document.page} dari {getattr(document,"previousPageCount","?")}',
            )
            canv.restoreState()

        doc.addPageTemplates([PageTemplate(id="report", frames=[frame], onPage=header)])
        story = [
            para("SISMADAK Data Exporter", styles["Title"]),
            Spacer(1, 8 * mm),
            para("Daftar isi", styles["Heading2"]),
            para(
                "Cakupan hanya data yang berhasil diimpor/ditarik. Tidak menyatakan seluruh data akun telah diambil.",
                metadata,
            ),
        ]
        toc = TableOfContents()
        toc.levelStyles = [
            ParagraphStyle(
                "TOC",
                fontName="CollectorVera",
                fontSize=10,
                leading=15,
                leftIndent=0,
                rightIndent=20,
            )
        ]
        story += [toc, PageBreak()]
        for index, d in enumerate(project["datasets"]):
            source = d["source"]
            check = inspect(d, project.get("inventory", []))
            name = d.get("name") or source["menu"]
            heading = para(name, styles["Heading1"])
            heading._bookmarkName = f"section-{index}"
            story.append(heading)
            for line in [
                f"Menu: {source['menu']} | Unit: {source.get('unit') or 'belum diketahui'} | Periode: {source.get('period') or 'belum diketahui'}",
                f"Penarikan: {check['captureStatus']} | Isi: {check['contentStatus']}",
                f"Baris: {len(d['rows'])} / {source.get('expectedRows','total sumber belum tersedia')} | Waktu: {source.get('capturedAt','belum diketahui')}",
                f"Sumber: {source.get('url','impor lokal')}",
            ]:
                story.append(para(line, metadata))
            if source.get("adapterValidation") == "schema-fixtures-only":
                story.append(
                    para(
                        "Adapter berbasis skema; kecocokan pada SISMADAK asli belum diverifikasi.",
                        metadata,
                    )
                )
            columns = check["columns"]
            anchor = source.get("columnRoles", {}).get("indicator", "Indikator")
            if anchor not in columns:
                anchor = columns[0] if columns else None
            rest = [c for c in columns if c != anchor]
            groups = (
                [[anchor] + rest[i : i + 5] for i in range(0, max(1, len(rest)), 5)]
                if anchor
                else []
            )
            for number, group in enumerate(groups):
                story += [
                    PageBreak(),
                    para(
                        f"{source['menu']} · Kelompok kolom {number+1}/{len(groups)}",
                        styles["Heading2"],
                    ),
                    table(
                        group,
                        [
                            [
                                (
                                    "— kosong"
                                    if kind(row.get(c)) == "kosong"
                                    else text(row[c])
                                )
                                for c in group
                            ]
                            for row in d["rows"]
                        ],
                    ),
                ]
            story.append(PageBreak())
        heading = para("Laporan pemeriksaan", styles["Heading1"])
        heading._bookmarkName = "verification"
        story.append(heading)
        summary = []
        for d in project["datasets"]:
            check = inspect(d, project.get("inventory", []))
            summary.append(
                [
                    d.get("name") or d["source"]["menu"],
                    check["captureStatus"],
                    check["contentStatus"],
                    f"{len(d['rows'])} / {d['source'].get('expectedRows','?')}",
                    str(check["emptyCells"]),
                    str(check["zeroOverZero"]),
                ]
            )
        story.append(
            table(
                ["Bagian", "Penarikan", "Isi", "Baris / total", "Kosong", "Baris 0/0"],
                summary,
            )
        )
        for d in project["datasets"]:
            check = inspect(d, project.get("inventory", []))
            notes = [*check["errors"], *d["source"].get("contentWarnings", [])]
            if check["missingColumns"]:
                notes.append(
                    "Kolom wajib hilang: " + ", ".join(check["missingColumns"])
                )
            if check["unknownColumns"]:
                notes.append(
                    "Kolom tidak dikenal: " + ", ".join(check["unknownColumns"])
                )
            for note in notes:
                story += [
                    Spacer(1, 3 * mm),
                    para(f"{d['source']['menu']}: {note}", metadata),
                ]
        for item in project.get("inventory", []):
            if not any(matches(d["source"], item) for d in project["datasets"]):
                story.append(
                    para(
                        f"Belum diimpor: {item['menu']} · {item.get('unit','')} · {item.get('period','periode belum diperiksa')}",
                        metadata,
                    )
                )
        doc.multiBuild(story)
        output = Path(output)
        output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, name = tempfile.mkstemp(
            prefix=".sismadak-pdf-", suffix=".tmp", dir=output.parent
        )
        temporary = Path(name)
        try:
            with os.fdopen(fd, "wb") as target:
                target.write(buffer.getvalue())
            os.replace(temporary, output)
        finally:
            if temporary.exists():
                temporary.unlink()
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        create_pdf(json.loads(args.project.read_text(encoding="utf-8")), args.output)
    except ValueError as exc:
        parser.error(str(exc))
    except Exception as exc:
        parser.error(
            f"PDF gagal dibuat ({type(exc).__name__}). Data sumber tidak diubah."
        )
    print("PDF lokal berhasil dibuat.")


if __name__ == "__main__":
    main()
