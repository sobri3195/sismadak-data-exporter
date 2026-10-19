# Collector desktop SISMADAK → PDF

## Windows portabel — tanpa Python terpasang

1. Dari tautan Aplikasi Windows di aplikasi web, buka run berhasil pada workflow **Build Windows desktop collector** di GitHub → **Artifacts** → `SISMADAK-Collector-Windows-x64`. Unduhan artifact memerlukan login GitHub dan disimpan 30 hari; pemilik repository dapat menjalankan workflow lagi dari tab Actions bila kedaluwarsa.
2. Ekstrak unduhan artifact, lalu ekstrak `SISMADAK-Collector-Windows-x64.zip` di dalamnya. Pertahankan seluruh folder, termasuk `_internal`; jangan memindahkan EXE sendirian.
3. Buka `SISMADAK-Collector.exe`. Python, Playwright, dan Chromium sudah dikemas. Build ini portabel x64 untuk Windows 10/11 dan belum ditandatangani dengan sertifikat penerbit. Jangan menonaktifkan perlindungan perangkat; gunakan kebijakan instalasi yang berlaku di organisasi Anda.
4. Isi alamat HTTPS awal tanpa query/fragment. Klik **Buka browser / login**, lalu login sendiri di browser. Collector tidak menyimpan password/cookie/token.
5. Pilih menu, unit, tahun, dan periode melalui kontrol SISMADAK yang benar-benar ada. Isi metadata yang sama di collector, lalu klik **Periksa tabel**. Pilih satu tabel dari daftar yang ditemukan. Tabel tanpa adapter tidak dapat diambil dengan menebak struktur.
6. Pastikan pagination ada di halaman pertama, lalu klik **Ambil tabel**. Konfirmasi halaman berikutnya melalui dialog. Tombol hentikan bekerja setelah halaman aktif; data yang sudah disimpan tetap tersedia. Jika login habis, login kembali melalui browser dan ulangi bagian dari halaman pertama.
7. Hasil default ada di folder pribadi `SISMADAK-Collector/project.json`; gunakan **Pilih folder hasil** atau **Buka folder hasil**. Penarikan berikutnya membaca proyek yang sama dan mengganti bagian dengan konteks yang sama. Proyek tidak mempertahankan versi lama secara otomatis.
8. Klik **4. Simpan PDF langsung**, pilih lokasi PDF, lalu tunggu pesan berhasil. Ekspor membaca proyek lokal tanpa login aktif dan tanpa upload. Jika belum ada file pada folder hasil, pilih JSON hasil collector melalui dialog. Anda juga dapat mengimpor `project.json` ke aplikasi web. Periksa status **Penarikan** dan **Isi** secara terpisah, buka temuan per baris, lalu buat PDF dan/atau unduh laporan pemeriksaan.

## Alternatif paket sumber Python (Windows/macOS/Linux)

Paket ZIP sumber memerlukan Python 3.10+ dengan Tkinter dan komputer dengan desktop. Ekstrak seluruh ZIP. Windows: jalankan `mulai.cmd`. macOS/Linux: jalankan `sh mulai.sh`. Launcher membuat virtualenv, memasang dependensi serta Chromium melalui TLS standar, lalu membuka GUI `desktop.py`. Pada distribusi Linux tertentu, Tkinter/venv harus tersedia dari paket sistem; ikuti pesan resmi instalasi.

Untuk CLI: buat virtualenv, `pip install -r requirements.txt`, `python -m playwright install chromium`, lalu `python collect.py --url https://HOST-ANDA --resume`. CLI menyimpan hasil di `collector-output/project.json` relatif folder saat dijalankan. GUI menyimpan ke folder pribadi yang dipilih. ZIP publik hanya berisi kode, launcher, panduan, dan checksum sumber; tidak memuat data rumah sakit.

## Skema adapter dan batas pengujian

- Rekap IMUT RS: No, Kategori, Indikator, Januari–Desember, Benchmark; header bertingkat dapat dipetakan melalui nama daun yang unik.
- Area Manajemen/Klinik harian: Tanggal/Tgl/Tanggal Pengukuran, Indikator/Nama Indikator, dan Nilai/Hasil/Capaian atau Pembilang/Numerator + Penyebut/Denominator. Nama menu harus sesuai konteks area.
- Matriks harian Area Manajemen/Klinik: Indikator + minimal 28 kolom hari unik 1–31 (atau 01–31). Jika metadata bulan Indonesia dan tahun dikenali, kolom wajib dibandingkan dengan kalender; bila tidak, catatan isi mewajibkan pemeriksaan periode. Nilai dan header hari tetap dipertahankan.
- Rincian/detail indikator: Parameter/Komponen + Keterangan/Deskripsi/Uraian/Nilai; tabel pengukuran harian dengan Tanggal + Indikator + nilai atau pembilang/penyebut juga dikenali.
- Kegiatan: Tanggal/Tanggal Pelaksanaan + Kegiatan/Nama Kegiatan.
- Daftar lampiran: Nama File/Nama Berkas/Lampiran + Jenis/Ukuran/Keterangan/Tipe. Adapter ini membaca daftar, **tidak mengunduh atau menggabungkan berkas lampiran**.

Nama kolom dan nilai sumber dipertahankan. Colspan/rowspan pada header dan rowspan isi diekspansi secara terstruktur; colspan isi (misalnya baris total) ditolak karena tidak aman menebak maknanya. Beberapa tabel memerlukan pilihan pengguna. Tabel virtual tanpa identitas `No` unik belum didukung. Format yang tidak memenuhi skema dicatat **adapter belum tersedia**.

Skema ini diuji menggunakan fixture sintetis. Kecocokan login, filter, pagination, dan format SISMADAK asli belum diverifikasi. Contoh HTML yang sudah disamarkan masih dibutuhkan untuk menguji variasi halaman nyata. Tidak ada klaim seluruh menu/periode akun telah diambil.

## Pemeriksaan dan keamanan

Setiap halaman mencatat jumlah baris dan SHA-256 representasi baris. Aplikasi membandingkan total sumber, jumlah hasil, dan penjumlahan bukti halaman. Fingerprint adalah metadata pemeriksaan, bukan tanda tangan digital. Tanpa total sumber yang dapat dibaca, status penarikan tetap belum diperiksa. Sel kosong dan 0/0 dinilai pada sumbu isi, sehingga berbeda dari kegagalan penarikan.

Collector hanya membaca; tidak mengedit, menyimpan perubahan, menghapus, menebak endpoint, melewati pembatasan akses, atau mengabaikan TLS. Jangan commit hasil asli, cookie, token, atau file .env; jangan tempatkan data pengguna di direktori publik. File proyek disimpan atomik dengan izin terbatas pada sistem POSIX. Data tidak dikirim ke analytics atau layanan AI.

## Alamat awal dan PDF tanpa browser login

URL awal GUI adalah `https://sismadak.rspauhardjolukito.co.id/login.php` dan dapat diganti. Profil hanya menyimpan alamat publik, tanpa kredensial. Login dilakukan sendiri di browser; akses dan format situs RSPAU asli belum diverifikasi dari environment pengembangan karena pembatasan jaringan.

Tombol **4. Simpan PDF langsung** tersedia setelah memiliki hasil JSON dan dapat dipakai tanpa membuka browser SISMADAK. PDF mencakup seluruh dataset proyek serta status penarikan/isi, daftar isi, nomor halaman, header tabel berulang, pembagian kolom, dan laporan pemeriksaan. Dokumen yang mengandung sumber gagal/sebagian tetap berlabel status tersebut.

Dari CLI sumber, tambahkan `--pdf laporan.pdf` saat menjalankan collector agar PDF dibuat setelah `q`. Untuk JSON yang sudah ada: `python report.py collector-output/project.json laporan.pdf`. Pengguna paket Windows tidak perlu memasang Python/ReportLab; keduanya dikemas pada build desktop.
