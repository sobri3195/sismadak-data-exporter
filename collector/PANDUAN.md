# Tarik data SISMADAK → PDF

Paket ini hanya berisi kode collector, dependensi, dan launcher. Tidak ada password/cookie/token/data rumah sakit di dalamnya. Python 3.10+ dan komputer dengan desktop diperlukan; bukan untuk dijalankan di Vercel atau telepon seluler.

1. Ekstrak seluruh ZIP ke folder pribadi yang mudah ditemukan. Jangan menjalankannya dari dalam ZIP.
2. Windows: klik dua kali `mulai.cmd`. macOS/Linux: buka Terminal pada folder hasil ekstraksi dan jalankan `sh mulai.sh`. Launcher membuat virtualenv dan menginstal Playwright/Chromium dengan verifikasi TLS standar. Koneksi Internet dan ruang disk untuk Chromium diperlukan. Launcher Windows belum diuji pada Windows asli.
3. Masukkan URL HTTPS SISMADAK milik Anda di terminal. Login sendiri pada browser yang dibuka. Password/cookie tidak disimpan oleh collector.
4. Buka menu, atur unit/tahun/periode menggunakan kontrol yang tersedia, dan pindah ke halaman pertama tabel. Kembali ke terminal, tekan Enter, dan isi metadata sesuai tampilan. Konfirmasikan pengambilan. Pagination hanya dilanjutkan melalui kontrol yang ditemukan dan persetujuan Anda.
5. Ulangi untuk menu/periode berikutnya. Ketik `q` ketika selesai. File `collector-output/project.json` ditulis setiap bagian/halaman agar progres tidak hilang. Menjalankan launcher lagi melanjutkan proyek; bagian dengan konteks yang sama diambil ulang dari halaman pertama dan mengganti hasil bagian tersebut.
6. Kembali ke aplikasi web, pilih **Impor hasil collector**, lalu pilih `collector-output/project.json`. Periksa jumlah baris, menu/periode, dan pesan kesalahan. Klik **Buat PDF gabungan** untuk mengunduh PDF.

Adapter awal mengenali tabel datar Rekap IMUT RS (No, Kategori, Indikator, Januari–Desember, Benchmark). Format lain ditandai “adapter belum tersedia”. Area Manajemen/Klinik, rincian indikator, Kegiatan, dan lampiran memerlukan adapter tambahan; lampiran belum diunduh atau digabung. Inventaris hanya mencatat tautan yang ditemukan pada halaman yang dikunjungi. Tidak ada klaim semua data akun telah diambil.

Collector tidak melakukan edit/simpan/hapus pada SISMADAK, menebak endpoint, melewati pembatasan akses, atau menonaktifkan TLS. Proyek disimpan lokal dan mungkin memuat data sensitif: jangan letakkan di folder publik, commit ke Git, atau kirim ke layanan AI. Checksum sumber tersedia di `SHA256SUMS.txt` untuk memeriksa konsistensi paket.

Jika tidak memakai launcher: buat virtualenv, `pip install -r requirements.txt`, `python -m playwright install chromium`, lalu `python collect.py --url https://HOST-ANDA --resume`. Bila gagal instalasi, perbaiki koneksi/izin/dependensi sistem dari pesan resmi; jangan menonaktifkan pemeriksaan sertifikat.
