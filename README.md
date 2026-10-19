# SISMADAK Data Exporter

Aplikasi Next.js App Router + TypeScript untuk menggabungkan **data yang berhasil diimpor**, memeriksa bukti kelengkapannya, dan mengunduh PDF/CSV/JSON. Antarmuka Bahasa Indonesia; putih, navy, dan teal. Collector Playwright Python berjalan terpisah di komputer pengguna. **Tidak ada integrasi SISMADAK asli yang sudah diverifikasi.**

## Tarik data lalu jadikan PDF

Dari aplikasi Vercel: **Unduh collector (.zip)** → ekstrak dan jalankan **mulai.cmd** (Windows) atau **sh mulai.sh** (macOS/Linux) → masukkan URL HTTPS SISMADAK → login sendiri → ambil tabel pada menu/periode yang dipilih → impor **collector-output/project.json** → **Buat PDF gabungan**. Python 3.10+ dibutuhkan di komputer pengguna. Tidak perlu clone repository untuk memakai paket collector. Launcher menginstal dependensi dan Chromium dengan verifikasi TLS standar; launcher Windows belum diuji pada Windows asli.

Paket publik dibuat saat `npm run build`/`npm run dev` oleh script Node.js dari lima file kode/panduan yang diizinkan secara eksplisit, ditambah checksum. Proses build Vercel hanya mengemas sumber Python sebagai ZIP; tidak menjalankan Python atau browser dan tidak menyertakan progres, cookie, kredensial, atau data pengguna. PDF tetap bisa dibuat dari impor JSON/CSV/HTML yang sudah dimiliki pengguna.

## Menjalankan aplikasi

Prasyarat Node.js 24 dan npm (sesuai runtime deployment Vercel).

```sh
npm ci
npm run dev
```

Buka alamat lokal yang ditampilkan Next.js. Impor beberapa file JSON/CSV/HTML atau klik contoh sintetis. Seluruh proyek hanya disimpan dalam memori tab browser: **unduh JSON sebelum refresh/menutup halaman**. Tidak ada database, API upload, analytics, layanan AI, localStorage, password, atau variabel environment aplikasi yang diperlukan. Karena tidak ada variabel wajib, `.env.example` tidak diperlukan.

```sh
npm test
npm run build
npm start
```

Pengujian PDF memakai `pdftotext` dari Poppler (`poppler-utils` pada Debian/Ubuntu; `brew install poppler` pada macOS). Produksi tidak membutuhkan Python, Chromium, atau Poppler.

## Alur dan format impor

- Satu proyek bisa berisi beberapa kumpulan data. Pilih menu/unit/tahun, lalu cari indikator atau saring bulan untuk pratinjau. Penyaringan hanya memengaruhi pratinjau; ekspor mencakup seluruh proyek.
- CSV biasa: baris header datar dengan nama kolom asli, UTF-8, koma/titik koma sesuai deteksi Papa Parse. Angka dibaca sebagai string supaya `001`, `0`, dan sel kosong tidak berubah. CSV dengan jumlah kolom salah ditolak. Tidak ada normalisasi angka/persen otomatis.
- HTML: tabel statis dengan satu baris header dan sel biasa. Semua tabel dibaca secara inert, tanpa mengeksekusi script. `rowspan`/`colspan` ditolak secara eksplisit. Bukan parser semantik untuk semua halaman SISMADAK. Header dan isi sel HTML dirapikan whitespace tepinya; gunakan JSON collector jika membutuhkan nilai terstruktur.
- JSON: array objek baris atau proyek dengan `schemaVersion: 1`, `datasets`, dan `inventory`. ID internal baru dibuat saat impor agar beberapa file tidak saling menimpa. Kolom tak dikenal tetap disimpan dan dilaporkan.
- Nilai `null`/string kosong ditandai kosong, `0` dan `"0"` ditandai nol, string `0/0` tetap rasio tak terdefinisi; pembilang dan penyebut nol juga dihitung sebagai baris 0/0. Nilai asli tidak diubah. Sel yang tidak memiliki kolom tertentu ikut dihitung kosong.
- Duplikasi: kesamaan seluruh isi baris dan konteks menu/unit/tahun/periode, dengan urutan key diabaikan. Tidak ada penghapusan otomatis. Angka `0` berbeda dari string `"0"`. Potensi duplikasi dari beda nama menu tidak disimpulkan sama.
- Batas file 30 MB. PDF dan impor dikerjakan di thread browser; proyek sangat besar dapat memerlukan waktu dan memori. Jangan gunakan data produksi untuk contoh atau pengujian.

Contoh struktur (nilai sintetis):

```json
{
  "schemaVersion": 1,
  "inventory": [{ "menu": "Rekap IMUT RS", "period": "2025" }],
  "datasets": [
    {
      "id": "contoh",
      "name": "Rekap 2025",
      "source": {
        "menu": "Rekap IMUT RS",
        "unit": "RS Contoh",
        "year": "2025",
        "period": "2025",
        "adapter": "rekap-imut-rs",
        "capturedAt": "2026-01-01T00:00:00Z",
        "expectedRows": 1,
        "check": "passed",
        "errors": []
      },
      "rows": [
        {
          "No": "1",
          "Kategori": "Sintetis",
          "Indikator": "Contoh",
          "Januari": "0/0"
        }
      ]
    }
  ]
}
```

`examples/sintetis-112-indikator.json` menyediakan **112 indikator × 12 bulan**, dengan contoh kosong, nol, 0/0, dan simbol benchmark. Label sintetis ikut ditampilkan di proyek dan PDF. Status contoh sengaja **sebagian** karena satu sel kosong; jumlah baris cocok tidak membuktikan semua nilai terisi.

## Status dan batas pembuktian

Status dihitung per kumpulan data:

- **Lengkap terverifikasi**: manifest `check: passed`, periode dinyatakan, menu+periode ada dalam inventaris, `expectedRows` persis sama jumlah baris, tidak ada kesalahan, baris tersedia, tidak ada sel kosong, dan semua kolom Januari–Desember tersedia untuk Rekap IMUT.
- **Sebagian**: jumlah baris tidak cocok, sel kosong, tanpa baris, atau kolom bulan Rekap IMUT hilang.
- **Belum diperiksa**: bukti total sumber, periode, kecocokan inventaris, atau pemeriksaan collector belum cukup.
- **Gagal**: pemeriksaan collector gagal atau manifest mencatat kesalahan. Format belum dikenal juga masuk kategori ini dengan penjelasan adapter.

Entri inventaris yang belum mempunyai dataset ditampilkan sebagai belum diperiksa/belum diimpor. Tahun/bulan yang wajib hanya dapat ditentukan dari inventaris/filter yang benar-benar diketahui, bukan ditebak. Inventaris tautan tanpa periode **bukan** bukti semua periode diperiksa. Mengubah metadata sumber di UI mengembalikan pemeriksaan ke belum diperiksa. Tidak ada klaim “seluruh data berhasil diambil”. Status adalah penilaian atas bukti file, bukan tanda tangan kriptografis atau konfirmasi live dari server SISMADAK.

## Ekspor

- **PDF gabungan**: daftar isi dengan tautan halaman, halaman pembatas untuk setiap dataset, status/sumber/periode, nomor halaman, header tabel berulang. Kolom dibagi dalam kelompok maksimal enam kolom dengan pengulangan indikator/kolom kunci. Teks panjang dibungkus. Font DejaVu disertakan untuk teks Indonesia dan simbol seperti `≥`; lisensi di `licenses/DejaVu.txt`. Aksara di luar cakupan font memerlukan font tambahan.
- **JSON**: arsip proyek lengkap; tipe nilai, metadata sumber, inventaris, dan kolom asli dipertahankan.
- **CSV arsip**: satu kolom `__sismadak_project_json` berisi JSON proyek utuh; dapat diimpor ulang tanpa kehilangan tipe nilai atau konteks. Format ini ditujukan untuk arsip/pertukaran aplikasi, bukan grid spreadsheet besar (spreadsheet mempunyai batas panjang sel).
- **CSV baris**: satu baris per rekaman, dengan `sumber_json` dan `baris_asli_json`. Konteks dan objek asli disimpan sebagai JSON agar tipe nilai dan nama kolom tetap utuh. Tidak dimaksudkan untuk impor ulang sebagai proyek. JSON di awal sel juga menghindari formula spreadsheet dari teks sumber. Kedua CSV memakai quoting standar, bukan konversi nilai menjadi angka.

## Collector lokal Python

Jalankan di komputer dengan desktop/browser. Tidak berjalan di request Vercel.

```sh
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r collector/requirements.txt
python -m playwright install chromium
python collector/collect.py --url https://HOST-SISMADAK-ANDA
```

1. Masukkan URL HTTPS yang Anda ketahui. Browser dibuka dengan konteks sementara; login sendiri. Cookie/password/token tidak ditulis ke file.
2. Navigasikan menu dan kontrol filter **yang benar-benar ada** secara manual. Collector tidak menebak URL/endpoint dan tidak mengklik menu atau formulir edit/simpan/hapus.
3. Kembali ke terminal, Enter, lalu catat nama menu, periode/filter, unit, dan tahun yang sedang aktif. Pastikan pagination berada di halaman pertama. Collector menginventarisasi tautan pada halaman host yang sama, tanpa query/fragment URL.
4. Collector mengenali tabel datar Rekap IMUT RS (`No`, `Kategori`, `Indikator`, Januari–Desember, `Benchmark`). Tabel lainnya dicatat **adapter belum tersedia**. Beberapa tabel cocok, header gabungan, atau sel tak sesuai header memerlukan penyesuaian adapter, bukan tebakan.
5. Pengguliran ancestor tabel yang benar-benar memiliki overflow dibaca; tampilan yang tumpang tindih digabung memakai kolom `No`. Konflik nomor dicatat sebagai gagal. Tabel biasa mempertahankan duplikasi. Virtualisasi tanpa identitas nomor stabil belum didukung.
6. Pagination hanya memakai kontrol Next/Berikutnya/Selanjutnya/rel=next yang benar-benar ditemukan di wrapper pagination. Setiap klik memerlukan persetujuan terminal. Tidak mengklik tombol umum di luar pagination. Kontrol tak dikenal, ambigu, atau halaman berulang tidak membuktikan selesai.
7. Total sumber diambil hanya dari ringkasan eksplisit `Showing 1 to 10 of 112 entries` atau `Menampilkan 1 sampai 10 dari 112 entri/data` di wrapper tabel. Tanpa total yang dikenal, status tetap belum diperiksa. Perbandingan total dan baris bukan bukti semua menu/periode akun sudah didapat.
8. Progres di `collector-output/project.json` ditulis atomik setelah inventaris dan setiap halaman; izin file dibatasi pada sistem POSIX. Jangan masukkan hasil asli ke Git atau folder `public`.

```sh
python collector/collect.py --url https://HOST-SISMADAK-ANDA --resume
```

Resume mempertahankan bagian yang sudah disimpan. Untuk bagian yang terputus, login lagi, setel **filter yang sama dan halaman pertama**, lalu ambil ulang: dataset dengan konteks menu/unit/tahun/periode/URL yang sama diganti, bukan ditambahkan ganda. Bukan pemulihan cookie atau posisi pagination otomatis. Jangan memakai output resume yang tidak Anda percayai. Periksa manifest kesalahan sebelum impor.

`ADAPTERS` di `collector/collect.py` merupakan titik ekstensi. Adapter **Area Manajemen harian, Area Klinik harian, rincian indikator, Kegiatan, dan lampiran** masih memerlukan contoh HTML yang sudah disamarkan serta bukti pagination/total/filter. Lampiran belum diunduh/digabung sebagai berkas PDF; jangan menganggapnya sudah tercakup. Inventaris saat ini berdasarkan tautan yang ditemukan pada halaman yang dikunjungi, belum crawler menyeluruh. Kontrol berbasis JavaScript atau struktur nonstandar memerlukan adapter tambahan. Tidak ada bypass akses atau penonaktifan verifikasi TLS.

## Validasi browser dan collector sintetis

```sh
# Gunakan virtualenv collector di atas. Pada Linux tersedia Chromium sistem:
SISMADAK_TEST_CHROMIUM=/usr/bin/chromium .venv/bin/python -m unittest discover -s tests -p 'test_collector.py' -v
# Di terminal lain: npm run build && npm start
SISMADAK_TEST_CHROMIUM=/usr/bin/chromium .venv/bin/python tests/browser_smoke.py
SISMADAK_TEST_CHROMIUM=/usr/bin/chromium .venv/bin/python tests/collector_to_pdf.py
```

Sesuaikan `SISMADAK_TEST_CHROMIUM` dengan executable Chromium lokal. Pengujian tidak menghubungi SISMADAK: fixture 112 baris, mismatch total, adapter tidak dikenal, pagination, gulir, inventaris, resume, impor HTML/CSV, unduh PDF, dan tampilan ponsel. Tes TypeScript memeriksa round-trip JSON/CSV, tipe nilai, duplikasi, syarat kelengkapan, PDF 112 indikator/12 bulan, serta daftar isi lebih dari 20 bagian. Tes `collector_to_pdf.py` mengunduh ZIP dari aplikasi yang berjalan, menjalankan modul collector dari ZIP terhadap fixture 112 indikator × 12 bulan, mengimpor manifest, dan memeriksa isi PDF hasilnya. Ini bukan pengujian login SISMADAK asli.

Validasi produksi harus dijalankan pada akun/HTML SISMADAK yang diizinkan sebelum mengklaim integrasi nyata.

## Deployment Vercel

1. Push repository ini ke GitHub milik Anda.
2. Import repository di Vercel, pilih preset **Next.js**, root directory repository ini. Gunakan Node.js **24.x**, sesuai `engines.node` di `package.json`.
3. Install `npm ci`, build `npm run build`, output default Next.js. Tidak perlu mengatur secret atau memasang Python/Playwright di Vercel.
4. Deploy, lalu uji impor contoh sintetis dan unduh PDF. Header keamanan di `next.config.ts` membatasi koneksi ke origin sendiri, menolak frame/object/gambar eksternal, dan menonaktifkan referrer. Tidak ada route server yang menerima file.

Konfigurasi `vercel.json` menetapkan framework Next.js, instalasi `npm ci`, dan build `npm run build`. Biarkan Output Directory pada default Next.js; jangan ubah menjadi `out` atau `public`. Untuk repository ini, Root Directory adalah root repository (bukan folder `app` atau `collector`). `.vercelignore` mengecualikan virtualenv, browser, pengujian, contoh file, dan hasil ekspor dari upload Vercel CLI. Sumber collector tetap disertakan sebagai input pembentukan paket ZIP publik dengan allowlist; kode Python tidak dijalankan oleh build. File contoh tetap dapat dicoba melalui tombol sintetis di aplikasi. Git integration Vercel memakai checkout repository, tetapi collector tidak diimpor oleh aplikasi atau dijalankan selama build.

Tidak perlu custom server, perintah `npm start`, atau proses Playwright pada deployment Vercel. Vercel mengelola runtime Next.js. Workflow GitHub Actions memeriksa instalasi, tes aplikasi/PDF dan paket collector, build dengan Node.js 24, serta collector dan alur ZIP → PDF sintetis pada push ke main dan pull request.

Setelah deployment, uji halaman utama, tombol contoh sintetis, impor ulang CSV arsip, unduh JSON/PDF, dan refresh halaman. Data proyek memang hilang ketika refresh; simpan JSON terlebih dahulu. Tidak perlu mengaktifkan Vercel Analytics atau mengatur secret aplikasi. Jika build gagal, periksa Build Logs, Node.js 24.x, Root Directory, dan output default sebelum menambahkan konfigurasi lain.

Build dan alur browser diuji menggunakan data sintetis pada mesin pengembangan dan CI GitHub. Periksa check Vercel pada PR untuk status deployment commit terkait. Status Ready membuktikan proses deployment selesai, bukan bahwa login dan seluruh menu SISMADAK asli sudah diuji. Git integration Vercel yang diaktifkan pemilik project dapat membuat preview otomatis saat branch didorong. Jangan mengaktifkan analytics yang membaca isi data. Jika kelak membutuhkan penyimpanan server, tambahkan autentikasi dan penyimpanan privat dalam pekerjaan terpisah sebelum mengunggah data pengguna.
