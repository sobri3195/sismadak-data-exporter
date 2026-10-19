import Papa from "papaparse";
export const MONTHS = [
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
];
export type Row = Record<string, unknown>;
export type Source = {
  menu: string;
  unit?: string;
  year?: string;
  period?: string;
  url?: string;
  capturedAt?: string;
  expectedRows?: number;
  check?: "passed" | "failed" | "unchecked";
  errors?: string[];
  adapter?: string;
  unknownColumns?: string[];
  rowCount?: number;
  columns?: string[];
  contentWarnings?: string[];
  requiredColumns?: string[];
  columnRoles?: Record<string, string>;
  adapterValidation?: string;
  pages?: {
    page: number;
    rowCount: number;
    rowsHash: string;
    capturedAt?: string;
  }[];
};
export type Dataset = { id: string; name: string; source: Source; rows: Row[] };
export type InventoryItem = {
  menu: string;
  unit?: string;
  year?: string;
  url?: string;
  period?: string;
  status?: string;
};
export type Project = {
  schemaVersion: 1;
  synthetic?: boolean;
  datasets: Dataset[];
  inventory: InventoryItem[];
};
export const emptyProject = (): Project => ({
  schemaVersion: 1,
  datasets: [],
  inventory: [],
});
const known = new Set([
  "No",
  "Kategori",
  "Indikator",
  ...MONTHS,
  "Benchmark",
  "Unit",
  "Tahun",
  "Bulan",
  "Pembilang",
  "Penyebut",
  "Tanggal",
  "Nilai",
  "Status",
]);
export function valueKind(value: unknown) {
  if (value === null || value === undefined || value === "") return "kosong";
  if (typeof value === "string" && /^\s*0\s*\/\s*0\s*$/.test(value))
    return "0/0";
  if (value === 0 || value === "0") return "nol";
  return "nilai";
}
export function display(value: unknown): string {
  return value === null
    ? "null"
    : value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
}
function assertRows(rows: unknown): asserts rows is Row[] {
  if (
    !Array.isArray(rows) ||
    rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
  )
    throw new Error("Data harus berupa daftar objek baris.");
}
function normalizeDataset(
  value: unknown,
  index: number,
  name: string,
): Dataset {
  if (!value || typeof value !== "object")
    throw new Error("Kumpulan data tidak valid.");
  const d = value as Partial<Dataset>;
  assertRows(d.rows);
  if (d.source && (typeof d.source.menu !== "string" || !d.source.menu.trim()))
    throw new Error("Nama menu sumber tidak valid.");
  if (d.source) {
    for (const k of [
      "unit",
      "year",
      "period",
      "url",
      "capturedAt",
      "adapter",
    ] as const) {
      if (d.source[k] !== undefined && typeof d.source[k] !== "string")
        throw new Error("Metadata sumber harus berupa teks.");
    }
    if (
      d.source.errors !== undefined &&
      (!Array.isArray(d.source.errors) ||
        d.source.errors.some((e) => typeof e !== "string"))
    )
      throw new Error("Daftar kesalahan manifest tidak valid.");
    if (
      d.source.check !== undefined &&
      !["passed", "failed", "unchecked"].includes(d.source.check)
    )
      throw new Error("Status pemeriksaan tidak valid.");
  }
  if (
    d.source?.expectedRows !== undefined &&
    (!Number.isInteger(d.source.expectedRows) || d.source.expectedRows < 0)
  )
    throw new Error("Jumlah baris harapan tidak valid.");
  if (d.source) {
    const source = d.source;
    if (
      source.rowCount !== undefined &&
      (!Number.isInteger(source.rowCount) || source.rowCount < 0)
    )
      throw new Error("Jumlah baris manifest tidak valid.");
    if (
      source.contentWarnings !== undefined &&
      (!Array.isArray(source.contentWarnings) ||
        source.contentWarnings.some((w) => typeof w !== "string"))
    )
      throw new Error("Catatan isi tidak valid.");
    if (
      source.columns !== undefined &&
      (!Array.isArray(source.columns) ||
        source.columns.some((c) => typeof c !== "string"))
    )
      throw new Error("Header sumber tidak valid.");
    if (
      source.requiredColumns !== undefined &&
      (!Array.isArray(source.requiredColumns) ||
        source.requiredColumns.some((c) => typeof c !== "string"))
    )
      throw new Error("Kolom wajib manifest tidak valid.");
    if (
      source.columnRoles !== undefined &&
      (!source.columnRoles ||
        typeof source.columnRoles !== "object" ||
        Array.isArray(source.columnRoles) ||
        Object.values(source.columnRoles).some((v) => typeof v !== "string"))
    )
      throw new Error("Pemetaan kolom tidak valid.");
    if (
      source.pages !== undefined &&
      (!Array.isArray(source.pages) ||
        source.pages.some(
          (p, i) =>
            !p ||
            p.page !== i + 1 ||
            !Number.isInteger(p.rowCount) ||
            p.rowCount < 0 ||
            typeof p.rowsHash !== "string" ||
            !/^[a-f0-9]{64}$/.test(p.rowsHash),
        ))
    )
      throw new Error("Bukti halaman tidak valid.");
    if (
      source.adapterValidation !== undefined &&
      typeof source.adapterValidation !== "string"
    )
      throw new Error("Validasi adapter tidak valid.");
  }
  return {
    id: crypto.randomUUID(),
    name: typeof d.name === "string" ? d.name : `${name} ${index + 1}`,
    source: d.source || { menu: name, check: "unchecked" },
    rows: d.rows,
  };
}
export function importText(text: string, name: string): Project {
  if (text.length > 30_000_000)
    throw new Error("File terlalu besar (maksimal 30 MB).");
  if (/\.json$/i.test(name)) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        "JSON tidak valid. Periksa tanda kutip, koma, dan struktur file.",
      );
    }
    if (Array.isArray(parsed)) {
      assertRows(parsed);
      return {
        schemaVersion: 1,
        inventory: [],
        datasets: [normalizeDataset({ rows: parsed }, 0, name)],
      };
    }
    if (!parsed || !Array.isArray(parsed.datasets))
      throw new Error("JSON harus berisi datasets atau array baris.");
    if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1)
      throw new Error("Versi skema JSON belum didukung.");
    const inventory = parsed.inventory ?? [];
    if (
      !Array.isArray(inventory) ||
      inventory.some(
        (x: InventoryItem) =>
          !x ||
          typeof x.menu !== "string" ||
          (x.period !== undefined && typeof x.period !== "string") ||
          (x.status !== undefined && typeof x.status !== "string") ||
          (x.unit !== undefined && typeof x.unit !== "string") ||
          (x.year !== undefined && typeof x.year !== "string"),
      )
    )
      throw new Error("Inventaris tidak valid.");
    return {
      schemaVersion: 1,
      synthetic: parsed.synthetic === true,
      inventory,
      datasets: parsed.datasets.map((d: unknown, i: number) =>
        normalizeDataset(d, i, name),
      ),
    };
  }
  const parsed = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  if (
    Object.keys(
      (parsed.meta as { renamedHeaders?: Record<string, string> })
        .renamedHeaders || {},
    ).length
  )
    throw new Error("Header CSV berulang; nama kolom harus unik.");
  const errors = parsed.errors.filter(
    (e) => e.code !== "UndetectableDelimiter",
  );
  if (errors.length) throw new Error(`CSV tidak valid: ${errors[0].message}`);
  if (parsed.meta.fields?.includes("__sismadak_project_json")) {
    if (parsed.data.length !== 1) throw new Error("Arsip CSV tidak valid.");
    return importText(
      String(parsed.data[0].__sismadak_project_json),
      "archive.json",
    );
  }
  assertRows(parsed.data);
  return {
    schemaVersion: 1,
    inventory: [],
    datasets: [normalizeDataset({ rows: parsed.data }, 0, name)],
  };
}
export function importHTML(text: string, name: string): Project {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  if (!tables.length)
    throw new Error("Tidak ada elemen tabel HTML yang ditemukan.");
  const datasets = tables.map((t, i) => {
    const trs = Array.from(t.rows);
    const header = trs.findIndex((r) => r.querySelector("th"));
    const h = header < 0 ? 0 : header;
    const columns = Array.from(trs[h]?.cells || []).map(
      (c) => c.textContent?.trim() || "Kolom",
    );
    if (new Set(columns).size !== columns.length)
      throw new Error("Header HTML berulang; gunakan hasil collector JSON.");
    if (
      trs.some((r) =>
        Array.from(r.cells).some((c) => c.colSpan !== 1 || c.rowSpan !== 1),
      )
    )
      throw new Error(
        "Tabel dengan colspan/rowspan belum didukung; gunakan collector atau CSV dengan header datar.",
      );
    const rows = trs.slice(h + 1).map((r) => {
      if (r.cells.length !== columns.length)
        throw new Error("Jumlah sel HTML tidak sesuai header.");
      return Object.fromEntries(
        columns.map((c, j) => [c, r.cells[j]?.textContent?.trim() ?? ""]),
      );
    });
    return normalizeDataset(
      {
        name: `${name} · Tabel ${i + 1}`,
        source: { menu: name, check: "unchecked" },
        rows,
      },
      i,
      name,
    );
  });
  return { schemaVersion: 1, datasets, inventory: [] };
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable((value as Row)[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "undefined";
}
export function duplicates(datasets: Dataset[]) {
  const seen = new Set<string>();
  let count = 0;
  for (const d of datasets)
    for (const row of d.rows) {
      const key = stable([
        d.source.menu,
        d.source.unit ?? "",
        d.source.year ?? "",
        d.source.period ?? "",
        row,
      ]);
      if (seen.has(key)) count++;
      else seen.add(key);
    }
  return count;
}
export function inventoryMatches(source: Source, item: InventoryItem) {
  return (
    item.menu === source.menu &&
    item.period === source.period &&
    (item.unit === undefined || item.unit === (source.unit ?? "")) &&
    (item.year === undefined || item.year === (source.year ?? ""))
  );
}
export function inspect(d: Dataset, inventory: InventoryItem[]) {
  const columns = Array.from(
    new Set([...(d.source.columns ?? []), ...d.rows.flatMap(Object.keys)]),
  );
  const rekap =
    d.source.adapter === "rekap-imut-rs" ||
    (columns.includes("Indikator") && MONTHS.some((m) => columns.includes(m)));
  const missingMonths = rekap
    ? MONTHS.filter(
        (m) => !columns.includes(d.source.columnRoles?.[`month:${m}`] ?? m),
      )
    : [];
  const emptyCells = d.rows.reduce(
    (n, r) => n + columns.filter((c) => valueKind(r[c]) === "kosong").length,
    0,
  );
  const zeroOverZero = d.rows.filter(
    (r) =>
      (valueKind(r[d.source.columnRoles?.numerator ?? "Pembilang"]) === "nol" &&
        valueKind(r[d.source.columnRoles?.denominator ?? "Penyebut"]) ===
          "nol") ||
      Object.values(r).some((v) => valueKind(v) === "0/0"),
  ).length;
  const requiredColumns =
    d.source.requiredColumns ??
    (rekap ? ["No", "Kategori", "Indikator", ...MONTHS, "Benchmark"] : []);
  const missingColumns = requiredColumns.filter((c) => !columns.includes(c));
  const unknownColumns = columns.filter(
    (c) =>
      !known.has(c) && !Object.values(d.source.columnRoles ?? {}).includes(c),
  );
  const matched =
    d.source.expectedRows !== undefined &&
    d.source.expectedRows === d.rows.length;
  const inventoried = inventory.some((i) => inventoryMatches(d.source, i));
  const evidenceErrors: string[] = [];
  if (d.source.rowCount !== undefined && d.source.rowCount !== d.rows.length)
    evidenceErrors.push(
      "Jumlah baris manifest berbeda dari file yang diimpor.",
    );
  if (
    d.source.pages !== undefined &&
    d.source.pages.reduce((n, p) => n + p.rowCount, 0) !== d.rows.length
  )
    evidenceErrors.push("Jumlah baris bukti halaman berbeda dari hasil impor.");
  if (
    d.source.pages &&
    new Set(d.source.pages.map((p) => p.rowsHash)).size !==
      d.source.pages.length
  )
    evidenceErrors.push(
      "Fingerprint halaman berulang; periksa duplikasi pagination.",
    );
  const captureStatus =
    d.source.check === "failed" ||
    (d.source.errors?.length ?? 0) > 0 ||
    evidenceErrors.length > 0
      ? "gagal"
      : d.source.expectedRows !== undefined && !matched
        ? "sebagian"
        : matched &&
            inventoried &&
            d.source.check === "passed" &&
            !!d.source.period
          ? "lengkap terverifikasi"
          : "belum diperiksa";
  const contentStatus = !d.rows.length
    ? "tidak ada data"
    : emptyCells ||
        missingColumns.length ||
        missingMonths.length ||
        zeroOverZero ||
        unknownColumns.length ||
        (d.source.contentWarnings?.length ?? 0) > 0
      ? "perlu diperiksa"
      : "lengkap";
  // Preserve the conservative combined status for legacy consumers while exposing both axes.
  const status =
    captureStatus === "gagal"
      ? "gagal"
      : contentStatus !== "lengkap" || captureStatus === "sebagian"
        ? "sebagian"
        : captureStatus;
  const issues: { row: number; column: string; kind: string }[] = [];
  const numerator = d.source.columnRoles?.numerator ?? "Pembilang";
  const denominator = d.source.columnRoles?.denominator ?? "Penyebut";
  for (let i = 0; i < d.rows.length; i++) {
    const row = d.rows[i];
    for (const c of columns) {
      if (valueKind(row[c]) === "kosong")
        issues.push({ row: i + 1, column: c, kind: "kosong" });
      else if (valueKind(row[c]) === "0/0")
        issues.push({ row: i + 1, column: c, kind: "0/0" });
    }
    if (
      valueKind(row[numerator]) === "nol" &&
      valueKind(row[denominator]) === "nol"
    )
      issues.push({
        row: i + 1,
        column: `${numerator} / ${denominator}`,
        kind: "0/0",
      });
  }
  return {
    columns,
    missingMonths,
    missingColumns,
    emptyCells,
    zeroOverZero,
    unknownColumns,
    status,
    captureStatus,
    contentStatus,
    matched,
    inventoried,
    evidenceErrors,
    issues,
    evidenceLevel: d.source.pages?.length
      ? "bukti per halaman"
      : "manifest tanpa bukti halaman",
  };
}
export function verificationReport(project: Project) {
  return {
    schemaVersion: 1,
    scope: "Hanya data dan bukti yang diimpor; bukan konfirmasi live SISMADAK.",
    pendingInventory: project.inventory.filter(
      (i) => !project.datasets.some((d) => inventoryMatches(d.source, i)),
    ),
    sections: project.datasets.map((d) => {
      const s = inspect(d, project.inventory);
      return {
        dataset: d.name,
        menu: d.source.menu,
        unit: d.source.unit,
        year: d.source.year,
        period: d.source.period,
        adapter: d.source.adapter,
        adapterValidation: d.source.adapterValidation,
        contentWarnings: d.source.contentWarnings ?? [],
        captureStatus: s.captureStatus,
        contentStatus: s.contentStatus,
        actualRows: d.rows.length,
        expectedRows: d.source.expectedRows,
        evidenceLevel: s.evidenceLevel,
        pages: d.source.pages ?? [],
        missingColumns: s.missingColumns,
        unknownColumns: s.unknownColumns,
        errors: [...(d.source.errors ?? []), ...s.evidenceErrors],
        issues: s.issues,
      };
    }),
  };
}
export function verificationCSV(project: Project) {
  return Papa.unparse(
    [
      ...verificationReport(project).sections.flatMap((s) => {
        const context = {
          menu: s.menu,
          unit: s.unit ?? "",
          tahun: s.year ?? "",
          periode: s.period,
          penarikan: s.captureStatus,
          isi: s.contentStatus,
        };
        return [
          {
            ...context,
            baris: "",
            kolom: "",
            temuan: `Ringkasan: ${s.actualRows} / ${s.expectedRows ?? "total tidak tersedia"} baris`,
          },
          ...s.issues.map((i) => ({
            ...context,
            baris: String(i.row),
            kolom: i.column,
            temuan: i.kind,
          })),
          ...s.contentWarnings.map((e) => ({
            ...context,
            baris: "",
            kolom: "",
            temuan: e,
          })),
          ...s.errors.map((e) => ({
            ...context,
            baris: "",
            kolom: "",
            temuan: e,
          })),
          ...s.missingColumns.map((c) => ({
            ...context,
            baris: "",
            kolom: c,
            temuan: "Kolom wajib hilang",
          })),
          ...s.unknownColumns.map((c) => ({
            ...context,
            baris: "",
            kolom: c,
            temuan: "Kolom tidak dikenal; dipertahankan",
          })),
        ];
      }),
      ...verificationReport(project).pendingInventory.map((i) => ({
        menu: i.menu,
        unit: i.unit ?? "",
        tahun: i.year ?? "",
        periode: i.period ?? "",
        penarikan: "belum diperiksa",
        isi: "belum diimpor",
        baris: "",
        kolom: "",
        temuan: "Target inventaris belum diimpor",
      })),
    ],
    { escapeFormulae: true },
  );
}

export function csvArchive(project: Project) {
  return Papa.unparse([{ __sismadak_project_json: JSON.stringify(project) }]);
}
export function csvTable(project: Project) {
  return Papa.unparse(
    project.datasets.flatMap((d) =>
      d.rows.map((r) => ({
        sumber_json: JSON.stringify(d.source),
        baris_asli_json: JSON.stringify(r),
      })),
    ),
  );
}
export function syntheticProject(): Project {
  return {
    schemaVersion: 1,
    synthetic: true,
    inventory: [
      { menu: "Rekap IMUT RS", period: "2025", status: "inventaris sintetis" },
    ],
    datasets: [
      {
        id: "synthetic-112",
        name: "CONTOH SINTETIS · 112 indikator",
        source: {
          menu: "Rekap IMUT RS",
          unit: "RS Contoh",
          year: "2025",
          period: "2025",
          adapter: "rekap-imut-rs",
          capturedAt: "2026-01-01T00:00:00Z",
          expectedRows: 112,
          check: "passed",
        },
        rows: Array.from({ length: 112 }, (_, i) => ({
          No: String(i + 1),
          Kategori: `Kategori ${Math.floor(i / 28) + 1}`,
          Indikator: `Indikator sintetis ${i + 1}`,
          ...Object.fromEntries(
            MONTHS.map((m, j) => [
              m,
              i === 0 && j === 0
                ? "0"
                : i === 1 && j === 0
                  ? ""
                  : i === 2 && j === 0
                    ? "0/0"
                    : `${80 + ((i + j) % 20)}%`,
            ]),
          ),
          Benchmark: "≥ 80%",
        })),
      },
    ],
  };
}
export type GroupDimension = "menu" | "unit" | "year" | "month" | "indicator";
export function groupRows(project: Project, dimension: GroupDimension) {
  const counts = new Map<string, number>();
  for (const d of project.datasets)
    for (const r of d.rows) {
      let keys: unknown[];
      switch (dimension) {
        case "menu":
          keys = [r.Menu ?? d.source.menu];
          break;
        case "unit":
          keys = [r.Unit ?? d.source.unit];
          break;
        case "year":
          keys = [r.Tahun ?? d.source.year];
          break;
        case "indicator":
          keys = [r.Indikator];
          break;
        case "month":
          keys =
            r.Bulan !== undefined
              ? [r.Bulan]
              : MONTHS.filter((m) =>
                  Object.hasOwn(r, d.source.columnRoles?.[`month:${m}`] ?? m),
                );
          break;
      }
      if (!keys.length) keys = ["Belum diketahui"];
      for (const key of keys) {
        const label = display(key) || "Belum diketahui";
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
  return Array.from(counts, ([label, count]) => ({ label, count }));
}
