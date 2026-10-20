# SISMADAK Data Exporter

Aplikasi Next.js App Router + TypeScript untuk menggabungkan **data yang berhasil diimpor**, memeriksa bukti kelengkapannya, dan mengunduh PDF/CSV/JSON. Antarmuka Bahasa Indonesia; putih, navy, dan teal. Collector Playwright Python berjalan terpisah di komputer pengguna. **Tidak ada integrasi SISMADAK asli yang sudah diverifikasi.**

## Jalankan di Vercel

Import repository ini melalui [Vercel New Project](https://vercel.com/new), pilih preset **Next.js**, Root Directory root repository, Node.js **24.x**, lalu Deploy. Konfigurasi `vercel.json` sudah menyediakan `npm ci` dan `npm run build`; biarkan Output Directory default. Tidak perlu Python, browser Playwright, database, atau environment variable di Vercel.

Setelah deployment, buka situs → **Impor hasil collector** (JSON/CSV/HTML) → periksa cakupan → **Buat PDF gabungan**. Tombol **Coba 112 indikator sintetis** dapat dipakai untuk menguji PDF tanpa data pengguna. Proses impor dan PDF berjalan di browser; simpan JSON sebelum menutup tab.

Untuk mengambil data baru dari akun SISMADAK, collector dijalankan terpisah di komputer pengguna. Login SISMADAK tidak dijalankan di server Vercel. Aplikasi Windows dan PDF desktop merupakan pilihan tambahan; aplikasi web tetap dapat dipakai tanpa menjalankan EXE jika file sumber sudah tersedia.

## Tarik data lalu jadikan PDF

**Windows tanpa Python:** buka tautan **Aplikasi Windows tanpa Python** → pilih run berhasil workflow desktop di GitHub → unduh artifact `SISMADAK-Collector-Windows-x64` → ekstrak ZIP di dalamnya → jalankan `SISMADAK-Collector.exe` bersama folder `_internal`. Chromium dan runtime Python sudah dikemas. Artifact memerlukan login GitHub dan tersedia 30 hari; workflow dapat dijalankan kembali. Build portabel x64 ini belum ditandatangani dengan sertifikat penerbit.

Isi alamat HTTPS, klik **Buka browser / login**, login sendiri, lalu pilih menu/filter melalui SISMADAK. Isi metadata sumber, klik **Periksa tabel**, pilih tabel, dan **Ambil tabel**. Gunakan **Buka folder hasil** untuk menemukan `project.json`; klik **4. Simpan PDF langsung** untuk membuat PDF lokal. Untuk pemeriksaan per baris, Anda juga dapat mengimpor ke aplikasi Vercel → periksa **Penarikan** dan **Isi** → **Buat PDF gabungan**. GUI menyediakan progres, konfirmasi pagination, pilihan folder, dan penghentian setelah halaman aktif.

Alternatif sumber untuk Windows/macOS/Linux: unduh collector ZIP, ekstrak dan jalankan `mulai.cmd` atau `sh mulai.sh`. Alternatif ini masih membutuhkan Python 3.10+ dan Tkinter; launcher memasang dependensi dan Chromium sebelum membuka GUI. CLI tetap tersedia melalui `python collector/collect.py --url https://HOST-ANDA --resume`.

Paket sumber publik dibuat saat prebuild/predev oleh Node.js dari sembilan file kode/panduan yang diizinkan secara eksplisit, ditambah checksum. Build Vercel tidak menjalankan Python/Chromium dan tidak mengemas data pengguna atau kredensial. Paket Windows dibangun terpisah di workflow Windows menggunakan PyInstaller dan Chromium; self-test menjalankan EXE yang dibekukan, memuat GUI, membuka browser headless, serta mengambil fixture sintetis. Hasil self-test dan artifact harus diperiksa sebelum distribusi. Tidak ada integrasi SISMADAK asli yang sudah diverifikasi.

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

Pusat verifikasi menampilkan dua sumbu untuk setiap dataset:

- **Penarikan:** lengkap terverifikasi jika periode dan inventaris cocok, check collector passed, serta total sumber sama dengan hasil; sebagian jika jumlah belum cocok; gagal jika collector mencatat kesalahan atau bukti saling bertentangan; belum diperiksa jika bukti belum cukup. File lama tanpa bukti halaman tetap dinilai dari manifest dan diberi label tersebut.
- **Isi:** lengkap jika tidak ada temuan yang dikenal; perlu diperiksa untuk sel kosong, 0/0, kolom wajib hilang, atau kolom tidak dikenal; tidak ada data untuk hasil tanpa baris. Nilai nol tidak dianggap kosong. Sumber dengan total nol dapat mempunyai penarikan terverifikasi dan isi tidak ada data.

Ringkasan gabungan konservatif tetap tersedia untuk kompatibilitas. Contoh 112 indikator memiliki penarikan terverifikasi berdasarkan manifest sintetis, tetapi isi perlu diperiksa karena ada sel kosong dan 0/0. Sel kosong pada sumber tidak dengan sendirinya berarti penarikan gagal.

Bukti baru memuat `source.columns`, `requiredColumns`, `columnRoles`, `rowCount`, dan `pages` (nomor halaman, jumlah baris, fingerprint SHA-256, waktu). Aplikasi memeriksa konsistensi jumlah baris manifest/hasil/halaman dan fingerprint halaman berulang. Hash disajikan sebagai metadata bukti; aplikasi tidak mengklaim autentisitas atau tanda tangan kriptografis dari file impor. Inventaris menu/periode yang belum diimpor tetap ditampilkan.

Buka temuan kosong/0/0 untuk melompat ke baris terkait. Pratinjau membatasi 50 temuan pertama per bagian; laporan JSON/CSV memuat seluruh temuan, kolom wajib hilang, kolom tidak dikenal, dan kesalahan. Laporan pemeriksaan dan PDF mencantumkan status penarikan/isi secara terpisah. Tidak ada perubahan otomatis pada nilai asli.

Inventaris hanya mencakup tautan yang ditemukan dan periode yang dikonfirmasi pengguna. Belum ada pembuktian seluruh periode akun. Mengubah metadata sumber di UI mengembalikan check menjadi belum diperiksa. Status file impor adalah penilaian atas bukti yang diberikan, bukan konfirmasi live dari SISMADAK.

## Ekspor

- **Paket ZIP**: tombol **Unduh paket ZIP** pada Ekspor hasil proyek menggabungkan PDF, `project.json`, CSV arsip/baris, laporan pemeriksaan JSON/CSV, manifest jumlah bagian/baris serta ukuran file, dan petunjuk. Semua bagian dan duplikasi disertakan, terlepas dari filter pratinjau. `project.json` atau `arsip.csv` dapat diimpor ulang; ekstrak ZIP terlebih dahulu. ZIP tidak menjadi bukti seluruh data akun terambil. Dibuat sepenuhnya di browser tanpa upload; simpan secara privat. PDF dan salinan arsip dapat memakai banyak memori untuk proyek besar; unduh JSON terpisah jika paket gagal.
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
4. Adapter berbasis skema tersedia untuk Rekap IMUT RS, Area Manajemen/Klinik harian, rincian indikator, Kegiatan, dan daftar lampiran. Konteks menu serta header wajib harus cocok; bentuk lain tetap **adapter belum tersedia**. Header bertingkat dan rowspan isi didukung; colspan isi ditolak. GUI dapat memilih tabel ketika beberapa tabel ditemukan; CLI menolak ambiguitas.
5. Pengguliran ancestor tabel yang benar-benar memiliki overflow dibaca; tampilan yang tumpang tindih digabung memakai kolom `No`. Konflik nomor dicatat sebagai gagal. Tabel biasa mempertahankan duplikasi. Virtualisasi tanpa identitas nomor stabil belum didukung.
6. Pagination hanya memakai kontrol Next/Berikutnya/Selanjutnya/rel=next yang benar-benar ditemukan di wrapper pagination. Setiap klik memerlukan persetujuan terminal. Tidak mengklik tombol umum di luar pagination. Kontrol tak dikenal, ambigu, atau halaman berulang tidak membuktikan selesai.
7. Total sumber diambil hanya dari ringkasan eksplisit `Showing 1 to 10 of 112 entries` atau `Menampilkan 1 sampai 10 dari 112 entri/data` di wrapper tabel. Tanpa total yang dikenal, status tetap belum diperiksa. Perbandingan total dan baris bukan bukti semua menu/periode akun sudah didapat.
8. Progres di `collector-output/project.json` ditulis atomik setelah inventaris dan setiap halaman; izin file dibatasi pada sistem POSIX. Jangan masukkan hasil asli ke Git atau folder `public`.

```sh
python collector/collect.py --url https://HOST-SISMADAK-ANDA --resume
```

Resume mempertahankan bagian yang sudah disimpan. Untuk bagian yang terputus, login lagi, setel **filter yang sama dan halaman pertama**, lalu ambil ulang: dataset dengan konteks menu/unit/tahun/periode/URL yang sama diganti, bukan ditambahkan ganda. Bukan pemulihan cookie atau posisi pagination otomatis. Jangan memakai output resume yang tidak Anda percayai. Periksa manifest kesalahan sebelum impor.

`ADAPTERS` di `collector/adapters.py` merupakan titik ekstensi. Skema dan alias yang didukung dijelaskan di [panduan collector](collector/PANDUAN.md), dengan fixture berlabel sintetis di `tests/fixtures`. Adapter rincian mendukung bentuk parameter/keterangan serta pengukuran harian. Daftar lampiran hanya mengambil tabel daftar, belum mengambil berkas. Seluruh adapter baru berstatus `schema-fixtures-only`; pengujian terhadap contoh HTML tersamarkan dan akun SISMADAK yang diizinkan tetap diperlukan. Inventaris belum merupakan crawler menyeluruh dan tidak ada bypass akses/TLS.

## Validasi browser dan collector sintetis

```sh
# Gunakan virtualenv collector di atas. Pada Linux tersedia Chromium sistem:
SISMADAK_TEST_CHROMIUM=/usr/bin/chromium .venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
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

## Membangun aplikasi Windows

Workflow `.github/workflows/desktop.yml` memakai Windows Server 2022/Python 3.12, Playwright yang dipin, serta PyInstaller 6.16.0. Chromium diunduh dengan verifikasi standar, kemudian EXE one-directory dan browser dikemas dalam ZIP. Self-test frozen EXE harus lulus sebelum artifact diunggah. Workflow berjalan pada PR/perubahan collector di main dan dapat dijalankan manual. Tidak ada proses build desktop di Vercel.

Artifact GitHub bukan installer bertanda tangan atau rilis publik permanen. Sertifikat penandatanganan dan penerbitan rilis permanen memerlukan konfigurasi pemilik repository; tidak ada kredensial yang ditanam. Untuk build pengembangan desktop lokal: instal requirements, jalankan `python collector/desktop.py`.

## PDF langsung dan profil RSPAU

Alamat publik `https://sismadak.rspauhardjolukito.co.id/login.php` menjadi nilai awal URL di GUI dan pilihan default CLI. Tidak ada username, password, cookie, atau token yang disimpan dalam profil, kode, ZIP, atau PDF contoh. Profil URL tidak berarti login dan struktur halaman situs tersebut sudah diuji. Akses situs dari workspace pengembangan terakhir diblokir proxy CONNECT 403; pengujian akun nyata masih tertunda sampai akses jaringan diaktifkan.

GUI: setelah mengambil tabel, klik **4. Simpan PDF langsung**, pilih lokasi PDF, lalu tunggu pesan berhasil. Ekspor membaca `project.json` lokal dan tidak membutuhkan sesi login aktif atau koneksi ke Vercel. Jika belum ada proyek pada folder hasil, dialog dapat memilih JSON hasil collector yang sudah tersedia. File asli tidak diubah.

CLI penarikan: `python collector/collect.py --url https://HOST-ANDA/login.php --resume --pdf exports/laporan.pdf`; PDF dibuat ketika pengguna menyelesaikan penarikan dengan `q`. PDF dari proyek yang sudah ada tanpa membuka SISMADAK: `python collector/report.py collector-output/project.json exports/laporan.pdf`.

PDF lokal dibuat menggunakan ReportLab dengan font Vera yang didistribusikan bersama dependensinya, daftar isi beserta nomor halaman/outline, pembatas bagian, tabel berulang dengan maksimal enam kolom per kelompok, dan lampiran pemeriksaan. Sel panjang dapat dibagi lintas halaman. Teks sumber di-escape dan tidak dieksekusi sebagai HTML. Nilai kosong, nol, 0/0 dan status penarikan/isi dipertahankan; PDF bukan bukti semua data akun sudah terambil. Pemrosesan berlangsung lokal, tanpa permintaan jaringan.

Workflow desktop juga menjalankan ekspor PDF dari EXE frozen pada Windows tanpa perintah Python di PATH; artifact harus lulus self-test GUI, Chromium, dan PDF sebelum diunggah. Paket sumber Python membutuhkan `pip install -r collector/requirements.txt` untuk menambahkan ReportLab.
