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
};
export type Dataset = { id: string; name: string; source: Source; rows: Row[] };
export type InventoryItem = {
  menu: string;
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
          (x.status !== undefined && typeof x.status !== "string"),
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
export function inspect(d: Dataset, inventory: InventoryItem[]) {
  const columns = Array.from(new Set(d.rows.flatMap(Object.keys)));
  const rekap =
    d.source.adapter === "rekap-imut-rs" ||
    (columns.includes("Indikator") && MONTHS.some((m) => columns.includes(m)));
  const missingMonths = rekap ? MONTHS.filter((m) => !columns.includes(m)) : [];
  const emptyCells = d.rows.reduce(
    (n, r) => n + columns.filter((c) => valueKind(r[c]) === "kosong").length,
    0,
  );
  const zeroOverZero = d.rows.filter(
    (r) =>
      (valueKind(r.Pembilang) === "nol" && valueKind(r.Penyebut) === "nol") ||
      Object.values(r).some((v) => valueKind(v) === "0/0"),
  ).length;
  const unknownColumns = columns.filter((c) => !known.has(c));
  const matched =
    d.source.expectedRows !== undefined &&
    d.source.expectedRows === d.rows.length;
  const inventoried = inventory.some(
    (i) => i.menu === d.source.menu && i.period === d.source.period,
  );
  const status =
    d.source.check === "failed" || (d.source.errors?.length ?? 0) > 0
      ? "gagal"
      : missingMonths.length ||
          emptyCells ||
          (d.source.expectedRows !== undefined && !matched) ||
          !d.rows.length
        ? "sebagian"
        : matched &&
            inventoried &&
            d.source.check === "passed" &&
            !!d.source.period
          ? "lengkap terverifikasi"
          : "belum diperiksa";
  return {
    columns,
    missingMonths,
    emptyCells,
    zeroOverZero,
    unknownColumns,
    status,
    matched,
    inventoried,
  };
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
              : MONTHS.filter((m) => Object.hasOwn(r, m));
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
