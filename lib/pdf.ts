import { jsPDF } from "jspdf";
import { pdfFont } from "./pdf-font";
import autoTable from "jspdf-autotable";
import { display, inspect, type Project } from "./data";
export function createPDF(project: Project) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", pdfFont);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.setFont("DejaVu");
  const toc: { title: string; page: number }[] = [];
  const tocPages = Math.max(1, Math.ceil(project.datasets.length / 20));
  for (let i = 1; i < tocPages; i++) doc.addPage();
  for (const d of project.datasets) {
    doc.addPage();
    const start = doc.getNumberOfPages();
    toc.push({ title: d.name, page: start });
    doc.setFontSize(21);
    doc.text("SISMADAK Data Exporter", 15, 28);
    doc.setFontSize(14);
    doc.text(doc.splitTextToSize(d.name, 265), 15, 44);
    doc.setFontSize(10);
    doc.text(
      doc.splitTextToSize(
        `${d.source.menu} | Unit: ${d.source.unit || "belum diketahui"} | Periode: ${d.source.period || "belum diketahui"}\nStatus: ${inspect(d, project.inventory).status}\n${d.rows.length} baris | Sumber: ${d.source.url || "impor lokal"}\n${project.synthetic ? "CONTOH DATA SINTETIS" : "Data sesuai file yang diimpor; cakupan global belum dibuktikan."}`,
        265,
      ),
      15,
      68,
    );
    const columns = inspect(d, project.inventory).columns;
    const anchor = columns.includes("Indikator") ? "Indikator" : columns[0];
    const rest = columns.filter((c) => c !== anchor);
    const chunks = Array.from(
      { length: Math.max(1, Math.ceil(rest.length / 5)) },
      (_, i) => [...(anchor ? [anchor] : []), ...rest.slice(i * 5, i * 5 + 5)],
    );
    for (let i = 0; i < chunks.length; i++) {
      doc.addPage();
      doc.setFontSize(11);
      doc.text(
        doc.splitTextToSize(
          `${d.source.menu} | Periode ${d.source.period || "?"} | Kelompok kolom ${i + 1}/${chunks.length}`,
          260,
        ),
        15,
        12,
      );
      autoTable(doc, {
        head: [chunks[i]],
        body: d.rows.map((r) => chunks[i].map((c) => display(r[c]))),
        startY: 23,
        margin: { top: 23, bottom: 17, left: 15, right: 15 },
        styles: {
          font: "DejaVu",
          fontStyle: "normal",
          fontSize: 8,
          cellPadding: 2,
          overflow: "linebreak",
        },
        headStyles: { fontStyle: "normal", fillColor: [15, 40, 65] },
        showHead: "everyPage",
        rowPageBreak: "avoid",
        horizontalPageBreak: false,
        tableWidth: 267,
      });
    }
  }
  for (let p = 1; p <= tocPages; p++) {
    doc.setPage(p);
    doc.setFontSize(23);
    doc.text("Daftar isi", 15, 25);
    doc.setFontSize(9);
    doc.text(
      "Cakupan: hanya kumpulan data yang diimpor. Tidak menyatakan seluruh data SISMADAK.",
      15,
      36,
    );
    toc.slice((p - 1) * 20, p * 20).forEach((t, i) => {
      doc.text(
        doc.splitTextToSize(`${(p - 1) * 20 + i + 1}. ${t.title}`, 235)[0],
        15,
        50 + i * 7,
      );
      doc.text(String(t.page), 277, 50 + i * 7, { align: "right" });
      doc.link(15, 45 + i * 7, 265, 7, { pageNumber: t.page });
    });
  }
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(
      `SISMADAK Data Exporter${project.synthetic ? " · SINTETIS" : ""}`,
      15,
      202,
    );
    doc.text(`Halaman ${p} dari ${pages}`, 282, 202, { align: "right" });
  }
  return doc;
}
