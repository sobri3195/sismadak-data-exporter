"use client";
import { useRef, useState } from "react";
import {
  inventoryMatches,
  verificationReport,
  verificationCSV,
  groupRows,
  type GroupDimension,
  MONTHS,
  emptyProject,
  importText,
  importHTML,
  inspect,
  duplicates,
  syntheticProject,
  csvArchive,
  csvTable,
  display,
  valueKind,
  type Project,
  type Dataset,
} from "../lib/data";
function download(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Home() {
  const [project, setProject] = useState<Project>(emptyProject);
  const [selected, setSelected] = useState("");
  const [focusRow, setFocusRow] = useState<{ id: string; row: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [unit, setUnit] = useState("");
  const [year, setYear] = useState("");
  const [menu, setMenu] = useState("");
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState<GroupDimension>("menu");
  const input = useRef<HTMLInputElement>(null);
  const current =
    project.datasets.find((d) => d.id === selected) || project.datasets[0];
  const total = project.datasets.reduce((n, d) => n + d.rows.length, 0);
  const dup = duplicates(project.datasets);
  const stats = current ? inspect(current, project.inventory) : null;
  async function files(list: FileList | null) {
    if (!list) return;
    setBusy(true);
    setError("");
    try {
      const incoming: Project[] = [];
      for (const f of Array.from(list)) {
        if (f.size > 30_000_000)
          throw new Error(`${f.name}: ukuran maksimal 30 MB.`);
        if (!/\.(json|csv|html?)$/i.test(f.name))
          throw new Error("Gunakan file JSON, CSV, atau HTML.");
        const text = await f.text();
        incoming.push(
          /\.html?$/i.test(f.name)
            ? importHTML(text, f.name)
            : importText(text, f.name),
        );
      }
      setProject((p) => ({
        schemaVersion: 1,
        synthetic: p.synthetic || incoming.some((x) => x.synthetic),
        inventory: [...p.inventory, ...incoming.flatMap((x) => x.inventory)],
        datasets: [...p.datasets, ...incoming.flatMap((x) => x.datasets)],
      }));
      setSelected(incoming[0]?.datasets[0]?.id || "");
      setPage(0);
      setNotice(
        `${incoming.reduce((n, p) => n + p.datasets.length, 0)} kumpulan data ditambahkan. Data hanya berada di memori browser.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impor gagal.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function exportPDF() {
    if (!total || exporting) return;
    setExporting(true);
    setError("");
    try {
      const { createPDF } = await import("../lib/pdf");
      createPDF(project).save("sismadak-gabungan.pdf");
    } catch {
      setError(
        "PDF belum berhasil dibuat. Coba kembali atau simpan proyek sebagai JSON.",
      );
    } finally {
      setExporting(false);
    }
  }
  function updateSource(key: keyof Dataset["source"], value: string) {
    if (!current) return;
    setProject((p) => ({
      ...p,
      datasets: p.datasets.map((d) =>
        d.id === current.id
          ? { ...d, source: { ...d.source, [key]: value, check: "unchecked" } }
          : d,
      ),
    }));
  }
  const visible = project.datasets.filter(
    (d) =>
      (!menu || d.source.menu === menu) &&
      (!unit || d.source.unit === unit) &&
      (!year || d.source.year === year),
  );
  const rows =
    current?.rows.filter(
      (r) =>
        (!query ||
          Object.values(r).some((v) =>
            display(v).toLowerCase().includes(query.toLowerCase()),
          )) &&
        (!month ||
          Object.hasOwn(
            r,
            current?.source.columnRoles?.[`month:${month}`] ?? month,
          ) ||
          display(r.Bulan) === month),
    ) || [];
  const monthColumns = MONTHS.map(
    (m) => current?.source.columnRoles?.[`month:${m}`] ?? m,
  );
  const columns = (stats?.columns || []).filter(
    (c) =>
      !month ||
      !monthColumns.includes(c) ||
      c === (current?.source.columnRoles?.[`month:${month}`] ?? month),
  );
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          <span className="logo">S</span>
          <span>
            SISMADAK<small>DATA EXPORTER</small>
          </span>
        </a>
        <div className="workspace-label">RUANG KERJA</div>
        <nav>
          <a className="active" href="#workspace">
            ▦ &nbsp; Tarik data & PDF
          </a>
          <a href="#coverage">◷ &nbsp; Pemeriksaan cakupan</a>
          <a href="#export">↗ &nbsp; Ekspor dokumen</a>
          <a href="#collector">⌘ &nbsp; Panduan collector</a>
        </nav>
        <div className="privacy">
          <span>◉ &nbsp; Pemrosesan lokal</span>
          <p>Isi file diproses di browser Anda. Tanpa unggah ke server.</p>
        </div>
        <div className="aside-bottom">
          SISMADAK Data Exporter
          <br />
          <small>Versi 0.1 · Ruang kerja pribadi</small>
        </div>
      </aside>
      <main id="workspace">
        <header>
          <div>
            Ruang kerja <span>/</span> Proyek data
          </div>
          <span className="pill">● &nbsp; Lokal di browser</span>
        </header>
        <section className="heading">
          <div>
            <div className="eyebrow">DARI SISMADAK KE DOKUMEN ANDA</div>
            <h1>Tarik data, jadikan PDF</h1>
            <p>
              Ambil data lewat collector lokal, impor hasilnya, lalu unduh satu
              PDF gabungan.
            </p>
          </div>
          <button onClick={() => input.current?.click()} disabled={busy}>
            ＋ Impor hasil collector
          </button>
        </section>
        <section
          className="workflow"
          aria-label="Langkah tarik data menjadi PDF"
        >
          <article>
            <span className="step-number">1</span>
            <h2>Tarik data SISMADAK</h2>
            <p>
              Unduh dan ekstrak collector. Jalankan di komputer, login sendiri,
              lalu ambil menu/periode yang diperlukan.
            </p>
            <a
              className="action-link"
              href="https://github.com/sobri3195/sismadak-data-exporter/actions/workflows/desktop.yml"
              target="_blank"
              rel="noopener noreferrer"
            >
              Aplikasi Windows tanpa Python ↗
            </a>
            <small>
              Buka build berhasil → Artifacts → ekstrak ZIP, lalu jalankan
              SISMADAK-Collector.exe. Unduhan artifact memerlukan login GitHub.
              Build portabel belum ditandatangani.
            </small>
            <a className="text-link" href="/sismadak-collector.zip" download>
              ↓ Unduh collector (.zip)
            </a>
            <a className="text-link" href="#collector">
              Lihat cara menjalankan →
            </a>
          </article>
          <article>
            <span className="step-number">2</span>
            <h2>Impor hasil collector</h2>
            <p>
              Pilih file <code>collector-output/project.json</code>, lalu
              periksa cakupan, jumlah baris, dan pesan kesalahan.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              Pilih file hasil penarikan
            </button>
          </article>
          <article>
            <span className="step-number">3</span>
            <h2>Buat PDF gabungan</h2>
            <p>
              Gabungkan semua bagian yang diimpor. Status pemeriksaan setiap
              bagian tetap tercantum di PDF.
            </p>
            <button
              disabled={!total || exporting}
              aria-busy={exporting}
              onClick={() => void exportPDF()}
            >
              {exporting ? "Menyusun PDF…" : "Buat PDF gabungan"}
            </button>
            <small>
              {total
                ? `${total.toLocaleString("id-ID")} baris siap diekspor`
                : "Impor data terlebih dahulu untuk membuat PDF."}
            </small>
          </article>
        </section>
        <input
          ref={input}
          type="file"
          accept=".json,.csv,.html,.htm"
          multiple
          hidden
          onChange={(e) => void files(e.target.files)}
        />
        <div className="scope-note">
          <span>ⓘ</span>
          <div>
            <strong>Cakupan mengikuti data yang diimpor</strong>
            <p>
              Kelengkapan hanya terverifikasi jika tersedia inventaris
              menu/periode dan bukti jumlah baris yang sesuai.
            </p>
          </div>
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        <div className="metrics">
          <article>
            <span>Kumpulan data</span>
            <strong>{project.datasets.length.toLocaleString("id-ID")}</strong>
            <small>Dari semua file yang diimpor</small>
          </article>
          <article>
            <span>Total baris</span>
            <strong>{total.toLocaleString("id-ID")}</strong>
            <small>Nilai asli tetap dipertahankan</small>
          </article>
          <article>
            <span>Duplikasi terdeteksi</span>
            <strong className={dup ? "amber" : ""}>{dup}</strong>
            <small>Baris sama dalam konteks sumber sama</small>
          </article>
          <article>
            <span>Penarikan terverifikasi</span>
            <strong>
              {
                project.datasets.filter(
                  (d) =>
                    inspect(d, project.inventory).captureStatus ===
                    "lengkap terverifikasi",
                ).length
              }
              <em> / {project.datasets.length}</em>
            </strong>
            <small>Berdasarkan manifest dan inventaris</small>
          </article>
        </div>
        {!!project.datasets.length && (
          <section className="panel grouping">
            <div className="panel-head">
              <div>
                <h2>Pengelompokan proyek</h2>
                <p>
                  Seluruh kumpulan data. Bulan pada tabel lebar dihitung sebagai
                  pasangan indikator–bulan.
                </p>
              </div>
              <label>
                Kelompokkan menurut
                <select
                  aria-label="Kelompokkan menurut"
                  value={group}
                  onChange={(e) => setGroup(e.target.value as GroupDimension)}
                >
                  <option value="menu">Menu</option>
                  <option value="unit">Unit</option>
                  <option value="year">Tahun</option>
                  <option value="month">Bulan</option>
                  <option value="indicator">Indikator</option>
                </select>
              </label>
            </div>
            <div className="group-list">
              {groupRows(project, group).map((g) => (
                <div key={g.label}>
                  <span>{g.label}</span>
                  <strong>{g.count.toLocaleString("id-ID")}</strong>
                </div>
              ))}
            </div>
          </section>
        )}
        {!project.datasets.length ? (
          <section
            className="import-box"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void files(e.dataTransfer.files);
            }}
          >
            <div className="upload-icon">↥</div>
            <h2>Mulai dengan mengimpor data</h2>
            <p>
              Tarik file ke sini atau pilih dari komputer Anda.
              <br />
              Gabungkan beberapa hasil collector dalam satu proyek.
            </p>
            <button disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Membaca file…" : "Pilih file"}
            </button>
            <div className="formats">
              JSON <span>·</span> CSV <span>·</span> HTML tabel <span>·</span>{" "}
              Maks. 30 MB per file
            </div>
            <div className="sample">
              Belum punya data?{" "}
              <button
                className="link"
                onClick={() => {
                  const p = syntheticProject();
                  setProject(p);
                  setSelected(p.datasets[0].id);
                }}
              >
                Coba 112 indikator sintetis →
              </button>
            </div>
          </section>
        ) : (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Kumpulan data</h2>
                <p>
                  {project.synthetic
                    ? "Proyek mengandung CONTOH SINTETIS. "
                    : ""}
                  Pilih bagian untuk melihat data dan sumbernya.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  if (
                    window.confirm(
                      "Kosongkan proyek dari memori browser? Unduh JSON lebih dahulu untuk menyimpan.",
                    )
                  ) {
                    setProject(emptyProject());
                    setSelected("");
                  }
                }}
              >
                Kosongkan proyek
              </button>
            </div>
            <div className="filters">
              {[
                [
                  "Menu",
                  menu,
                  setMenu,
                  project.datasets.map((d) => d.source.menu),
                ],
                [
                  "Unit",
                  unit,
                  setUnit,
                  project.datasets.map((d) => d.source.unit || ""),
                ],
                [
                  "Tahun",
                  year,
                  setYear,
                  project.datasets.map((d) => d.source.year || ""),
                ],
              ].map(([label, val, set, options]) => (
                <label key={String(label)}>
                  {String(label)}
                  <select
                    value={String(val)}
                    onChange={(e) =>
                      (set as (v: string) => void)(e.target.value)
                    }
                  >
                    <option value="">Semua</option>
                    {Array.from(new Set(options as string[]))
                      .filter(Boolean)
                      .map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="dataset-list">
              {visible.map((d) => (
                <button
                  className={`dataset ${current?.id === d.id ? "selected" : ""}`}
                  key={d.id}
                  onClick={() => {
                    setSelected(d.id);
                    setPage(0);
                    setQuery("");
                    setMonth("");
                  }}
                >
                  <span>
                    <strong>{d.name}</strong>
                    <small>
                      {d.source.menu} · {d.source.unit || "Unit belum diisi"} ·{" "}
                      {d.source.period || "Periode belum diisi"}
                    </small>
                  </span>
                  <span>
                    {d.rows.length} baris{" "}
                    <b className="badge">
                      {inspect(d, project.inventory).status}
                    </b>
                  </span>
                </button>
              ))}
            </div>
            {current && stats && (
              <>
                <div className="source-edit">
                  <h3>Metadata sumber</h3>
                  <p>
                    Perubahan manual menandai pemeriksaan sebagai belum
                    diperiksa. Metadata ini tidak mengubah sel asli.
                  </p>
                  <div className="filters">
                    {(
                      [
                        ["menu", "Menu"],
                        ["unit", "Unit"],
                        ["year", "Tahun"],
                        ["period", "Periode / filter"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          value={current.source[key] || ""}
                          onChange={(e) => updateSource(key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="panel-head">
                  <div>
                    <h3>Pratinjau tabel</h3>
                    <p>
                      Kosong, 0, dan 0/0 ditampilkan berbeda. Tidak ada
                      penghapusan duplikasi otomatis.
                    </p>
                  </div>
                </div>
                <div className="filters">
                  <label className="search">
                    Cari indikator atau nilai
                    <input
                      placeholder="Cari dalam tabel…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(0);
                      }}
                    />
                  </label>
                  <label>
                    Bulan
                    <select
                      value={month}
                      onChange={(e) => {
                        setMonth(e.target.value);
                        setPage(0);
                      }}
                    >
                      <option value="">Semua bulan</option>
                      {MONTHS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="table-wrap" id="data-preview">
                  <table>
                    <thead>
                      <tr>
                        {columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(page * 25, (page + 1) * 25).map((r, i) => (
                        <tr
                          key={i}
                          className={
                            focusRow?.id === current.id &&
                            focusRow.row === page * 25 + i + 1
                              ? "focused-row"
                              : ""
                          }
                        >
                          {columns.map((c) => (
                            <td key={c}>
                              <span className={`cell-${valueKind(r[c])}`}>
                                {valueKind(r[c]) === "kosong"
                                  ? r[c] === null
                                    ? "∅ null"
                                    : "— kosong"
                                  : display(r[c])}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <span>
                    {rows.length} baris · Halaman {page + 1} /{" "}
                    {Math.max(1, Math.ceil(rows.length / 25))}
                  </span>
                  <button
                    className="secondary"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Sebelumnya
                  </button>
                  <button
                    className="secondary"
                    disabled={(page + 1) * 25 >= rows.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Berikutnya
                  </button>
                </div>
              </>
            )}
          </section>
        )}
        <section id="coverage" className="panel">
          <div className="panel-head">
            <div>
              <h2>Pusat verifikasi</h2>
              <p>
                Periksa keberhasilan penarikan dan kelengkapan isi secara
                terpisah. Nol, kosong, dan 0/0 tetap berbeda.
              </p>
            </div>
            <span className="badge">
              {project.inventory.length} entri inventaris
            </span>
          </div>
          {!!project.datasets.length && (
            <div className="verification-tools">
              <button
                className="secondary"
                onClick={() =>
                  download(
                    JSON.stringify(verificationReport(project), null, 2),
                    "sismadak-pemeriksaan.json",
                    "application/json",
                  )
                }
              >
                Unduh laporan pemeriksaan JSON
              </button>
              <button
                className="secondary"
                onClick={() =>
                  download(
                    verificationCSV(project),
                    "sismadak-temuan.csv",
                    "text/csv;charset=utf-8",
                  )
                }
              >
                Unduh temuan CSV
              </button>
              <p>
                Status berdasarkan manifest impor. Hash halaman bukan tanda
                tangan digital atau bukti akses live.
              </p>
            </div>
          )}
          {project.datasets.length ? (
            <div className="coverage-list">
              {project.datasets.map((d) => {
                const s = inspect(d, project.inventory);
                return (
                  <article key={d.id}>
                    <div>
                      <strong>
                        {d.source.menu} ·{" "}
                        {d.source.period || "Periode tidak diketahui"}
                      </strong>
                      <span className="badge">Ringkasan: {s.status}</span>
                    </div>
                    <div className="verification-status">
                      <span>
                        Penarikan: <b>{s.captureStatus}</b>
                      </span>
                      <span>
                        Isi: <b>{s.contentStatus}</b>
                      </span>
                    </div>
                    <p>
                      {s.evidenceLevel} · Adapter:{" "}
                      {d.source.adapter || "impor umum"}
                      {d.source.adapterValidation === "schema-fixtures-only"
                        ? " · Skema diuji dengan fixture; SISMADAK asli belum diverifikasi."
                        : ""}
                    </p>
                    {!!s.missingColumns.length && (
                      <p className="amber">
                        Kolom wajib belum tersedia:{" "}
                        {s.missingColumns.join(", ")}
                      </p>
                    )}
                    {d.source.contentWarnings?.map((w) => (
                      <p className="amber" key={w}>
                        {w}
                      </p>
                    ))}
                    {s.evidenceErrors.map((e) => (
                      <p className="amber" key={e}>
                        {e}
                      </p>
                    ))}
                    {!!d.source.pages?.length && (
                      <details>
                        <summary>Bukti {d.source.pages.length} halaman</summary>
                        <div className="evidence-list">
                          {d.source.pages.map((p) => (
                            <div key={p.page}>
                              Halaman {p.page}: {p.rowCount} baris · SHA-256{" "}
                              <code>{p.rowsHash}</code>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {!!s.issues.length && (
                      <details>
                        <summary>
                          {s.issues.length} temuan isi — lihat baris
                        </summary>
                        <ul className="issue-list">
                          {s.issues.slice(0, 50).map((issue, i) => (
                            <li key={i}>
                              <button
                                className="link"
                                onClick={() => {
                                  setSelected(d.id);
                                  setQuery("");
                                  setMonth("");
                                  setPage(Math.floor((issue.row - 1) / 25));
                                  setFocusRow({ id: d.id, row: issue.row });
                                  requestAnimationFrame(() =>
                                    document
                                      .getElementById("data-preview")
                                      ?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "center",
                                      }),
                                  );
                                }}
                              >
                                Baris {issue.row}, {issue.column}: {issue.kind}
                              </button>
                            </li>
                          ))}
                        </ul>
                        {s.issues.length > 50 && (
                          <p>
                            Pratinjau 50 temuan pertama. Unduh laporan untuk
                            seluruh temuan.
                          </p>
                        )}
                      </details>
                    )}
                    <p>
                      {d.rows.length} baris diimpor /{" "}
                      {d.source.expectedRows ?? "total sumber tidak tersedia"} ·{" "}
                      {s.emptyCells} sel kosong · {s.zeroOverZero} baris 0/0 ·{" "}
                      {s.inventoried
                        ? "tercantum dalam inventaris"
                        : "belum cocok dengan inventaris"}
                    </p>
                    {!!s.missingMonths.length && (
                      <p className="amber">
                        Bulan tanpa kolom: {s.missingMonths.join(", ")}
                      </p>
                    )}
                    {!!s.unknownColumns.length && (
                      <p>
                        Kolom tidak dikenal (tetap disimpan):{" "}
                        {s.unknownColumns.join(", ")}
                      </p>
                    )}
                    {d.source.errors?.map((e, i) => (
                      <p className="amber" key={i}>
                        {e}
                      </p>
                    ))}
                  </article>
                );
              })}
              {project.inventory
                .filter(
                  (i) =>
                    !project.datasets.some((d) =>
                      inventoryMatches(d.source, i),
                    ),
                )
                .map((i, n) => (
                  <article key={n}>
                    <strong>
                      {i.menu} · {i.period || "Periode belum diinventarisasi"}
                    </strong>
                    <p>Belum diperiksa / belum diimpor. {i.status}</p>
                  </article>
                ))}
            </div>
          ) : (
            <div className="empty-inline">
              Belum ada data untuk diperiksa. Impor file beserta manifest
              collector terlebih dahulu.
            </div>
          )}
          <div className="status-legend">
            <span>● Lengkap terverifikasi</span>
            <span>◐ Sebagian</span>
            <span>○ Belum diperiksa</span>
            <span>⊗ Gagal</span>
          </div>
        </section>
        <section id="export" className="panel">
          <div className="panel-head">
            <div>
              <h2>Ekspor hasil proyek</h2>
              <p>
                Ekspor mencakup seluruh kumpulan data proyek, termasuk baris
                duplikat.
              </p>
            </div>
          </div>
          <div className="export-grid">
            <article>
              <h3>Dokumen PDF gabungan</h3>
              <p>
                Daftar isi, pembatas bagian, header berulang, nomor halaman, dan
                kolom terbagi.
              </p>
              <button
                disabled={!total || exporting}
                aria-busy={exporting}
                onClick={() => void exportPDF()}
              >
                {exporting ? "Menyusun PDF…" : "↓ Unduh PDF"}
              </button>
            </article>
            <article>
              <h3>Data & manifest asli</h3>
              <p>
                JSON dan CSV arsip mempertahankan tipe nilai, metadata,
                inventaris, dan seluruh kolom.
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={!project.datasets.length}
                  onClick={() =>
                    download(
                      JSON.stringify(project, null, 2),
                      "sismadak-proyek.json",
                      "application/json",
                    )
                  }
                >
                  ↓ JSON
                </button>
                <button
                  className="secondary"
                  disabled={!project.datasets.length}
                  onClick={() =>
                    download(
                      csvArchive(project),
                      "sismadak-arsip.csv",
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  ↓ CSV arsip
                </button>
                <button
                  className="secondary"
                  disabled={!total}
                  onClick={() =>
                    download(
                      csvTable(project),
                      "sismadak-baris.csv",
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  ↓ CSV baris
                </button>
              </div>
              <small>
                CSV baris berisi konteks sumber dan objek baris asli dalam kolom
                JSON; CSV arsip dapat diimpor ulang.
              </small>
            </article>
          </div>
        </section>
        <section id="collector" className="collector">
          <div className="collector-icon">⌘</div>
          <div>
            <h2>Menjalankan collector untuk menarik data</h2>
            <p>
              Unduh ZIP pada langkah 1, lalu ekstrak seluruh isinya. Komputer
              memerlukan Python 3.10 atau lebih baru dan koneksi Internet untuk
              instalasi awal.
            </p>
            <ol className="collector-steps">
              <li>
                <strong>Windows:</strong> klik dua kali <code>mulai.cmd</code>.{" "}
                <strong>macOS/Linux:</strong> buka Terminal di folder ekstraksi,
                lalu jalankan <code>sh mulai.sh</code>.
              </li>
              <li>
                Masukkan URL HTTPS SISMADAK di terminal. Login sendiri di
                browser yang terbuka; jangan memasukkan password ke aplikasi
                ini.
              </li>
              <li>
                Pilih menu, unit, tahun, dan periode di SISMADAK. Ikuti
                konfirmasi terminal untuk mengambil tabel dan pagination.
              </li>
              <li>
                Ketik <code>q</code> untuk selesai. Pada langkah 2, impor{" "}
                <code>collector-output/project.json</code>, periksa hasilnya,
                lalu buat PDF.
              </li>
            </ol>
            <p>
              Jika terputus, jalankan launcher lagi untuk melanjutkan proyek.
              Bagian yang diambil ulang harus dimulai dari halaman pertama.
              Panduan lengkap tersedia di dalam ZIP.
            </p>
            <p className="muted">
              Adapter skema: Rekap IMUT RS, Area Manajemen/Klinik harian,
              rincian indikator, Kegiatan, dan daftar lampiran. Format yang
              tidak cocok tetap ditandai “adapter belum tersedia”. Daftar
              lampiran tidak mengunduh berkas lampiran. Lihat README untuk batas
              skema.
            </p>
          </div>
        </section>
        <footer>
          Data tetap di perangkat Anda. Simpan JSON proyek sebelum menutup atau
          memuat ulang halaman.<span>SISMADAK Data Exporter</span>
        </footer>
      </main>
    </div>
  );
}
