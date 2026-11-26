# SiTAB — Sistem Titip Antar Barang Kampus UNKLAB

**Final Project – System Analysis and Design**  
Fakultas Ilmu Komputer, Universitas Klabat (UNKLAB), Airmadidi  
**Kelompok Miedal** · Model SDLC: Agile (Scrum)

---

## 👥 Tim Pengembang (Kelompok Miedal)

| NIM | Nama | Peran |
|---|---|---|
| **105022410043** | Salem, Jovitly Mike | Project Manager / Ketua Kelompok |
| **105022410044** | Sanjaya, Liandy Maygiven | System Analyst |
| **105022410118** | Makarewa, Miracle Evangelio | Quality Assurance / Dokumentasi |
| **105012410026** | Sahala, Andrew | Developer / Perancang Antarmuka |

---

## 🚀 Fitur dan Alur Kerja Utama

Aplikasi web full-stack SiTAB dirancang dengan tampilan **Web Application modern & responsif** untuk mendigitalkan penitipan dan pengantaran barang di kampus Universitas Klabat:

1. **Akses & Autentikasi Pengguna (`L-01`, `L-13`, `L-14`)**:
   - Registrasi khusus mahasiswa UNKLAB dengan format email kampus: `[nomor_registrasi 8 karakter]@student.unklab.ac.id`.
   - Verifikasi email kampus menggunakan kode verifikasi 6 digit (berlaku 15 menit, batas 5 kali percobaan).
   - Login multi-peran dengan perlindungan kredensial (password di-hash menggunakan PBKDF2/SHA-512) yang langsung mengarahkan pengguna ke antarmuka web sesuai peran (*Mahasiswa*, *Mahasiswa Kurir*, atau *Administrator*).
   - Bar pintas demo cepat untuk langsung beralih antar peran dengan sekali klik.

2. **Titip Barang Mandiri di 7 Pos Drop Point (`L-03`)**:
   - Tersedia **7 Pos Drop Point Resmi UNKLAB**:
     1. Pos 1: Gedung GK1 (12 Loker)
     2. Pos 2: Perpustakaan (10 Loker)
     3. Pos 3: Student Center / Hall UNKLAB (16 Loker)
     4. Pos 4: Pos Satpam Utama / Gate 1 (15 Loker)
     5. Pos 5: Asrama Edelweiss (12 Loker)
     6. Pos 6: Gedung Kuliah Pascasarjana (10 Loker)
     7. Pos 7: Gedung Pioneer Chapel (8 Loker)
   - Indikator slot loker real-time (hijau tersedia, abu-abu terisi).
   - Mahasiswa menitipkan barang -> sistem mengeluarkan kode OTP 4 digit pengambilan.
   - Pengambilan mandiri diselesaikan langsung antara mahasiswa ke kurir pos cukup dengan memasukkan kode OTP 4 digit (status langsung *Terkirim* dan slot loker pos otomatis kembali kosong), **tanpa perlu persetujuan admin**.

3. **Pesan Antar Barang Kampus (`L-04`, `L-05`, `L-08`, `L-09`)**:
   - Pemesanan antar lokasi dengan validasi lokasi jemput dan tujuan tidak boleh sama.
   - Estimasi otomatis waktu (10–15 menit) dan tarif layanan standar kampus (Rp5.000, honor kurir Rp4.000).
   - Kurir on-duty dapat langsung menerima/mengambil tugas pengantaran secara mandiri tanpa menunggu konfirmasi admin.
   - Serah-terima penjemputan dan pengantaran diverifikasi menggunakan kode OTP 4 digit langsung antara mahasiswa dan kurir.

4. **Peran Fokus Administrator (`L-12`)**:
   - **Pemantauan Real-time**: Memonitor arus transaksi dan utilisasi loker di 7 Pos kampus.
   - **Manajemen & Aktivasi Kurir**: Mengaktifkan dan menonaktifkan kurir dengan satu klik (*toggle aktif/nonaktif*) agar kurir leluasa bekerja, serta mengonfirmasi pendaftaran mahasiswa yang ingin menjadi kurir baru.
   - **Audit Laporan Kehilangan**: Menindaklanjuti kronologi dan bukti serah-terima dari mahasiswa pelapor hingga selesai.

5. **Rating & Ulasan Kurir (`L-11`)**:
   - Penilaian bintang 1–5 dan ulasan performa kurir setelah status barang mencapai *Terkirim*.

---

## 📂 Struktur Proyek

```text
SiTABforreal/
├── data/
│   └── database.json          # Basis data terstruktur relasional persisten (13 tabel ERD)
├── public/
│   ├── css/
│   │   └── style.css          # Desain mobile-first modern, responsif & bersih
│   ├── js/
│   │   └── app.js             # Logika antarmuka klien & interaktivitas (L-01 s.d. L-15)
│   ├── uploads/               # Penyimpanan berkas foto barang dan bukti serah-terima
│   ├── index.html             # Shell interaktif seluruh 15 layar (L-01 s.d. L-15)
│   ├── login.html             # Layar L-01 Login
│   ├── dashboard-mahasiswa.html # Layar L-02 Dashboard Mahasiswa
│   ├── titip-barang.html      # Layar L-03 Form Titip Barang
│   ├── pesan-antar.html       # Layar L-04 Form Pesan Antar
│   ├── lacak-status.html      # Layar L-05 Lacak Status Barang
│   ├── notifikasi.html        # Layar L-06 Notifikasi
│   ├── riwayat.html           # Layar L-07 Riwayat Transaksi
│   ├── dashboard-kurir.html   # Layar L-08 Dashboard Kurir
│   ├── serah-terima.html      # Layar L-09 Verifikasi Serah-Terima
│   ├── lapor-kehilangan.html  # Layar L-10 Lapor Kehilangan
│   ├── beri-rating.html       # Layar L-11 Beri Rating dan Ulasan
│   ├── dashboard-admin.html   # Layar L-12 Dashboard Administrator
│   ├── register.html          # Layar L-13 Registrasi Mahasiswa
│   ├── verifikasi-email.html  # Layar L-14 Verifikasi Email
│   └── register-kurir.html    # Layar L-15 Registrasi Mahasiswa Kurir
├── db.js                      # Engine basis data, hashing kredensial & seeder awal
├── server.js                  # REST API Server berbasis Node.js HTTP murni
├── test_logic.js              # Skrip pengujian otomatis komprehensif TC-01 s.d. TC-41
├── start.bat                  # Script sekali-klik untuk menjalankan server di Windows
├── package.json               # Konfigurasi dependensi dan skrip proyek
└── README.md                  # Dokumentasi teknis proyek
```

---

## 🗄️ Skema Database (13 Entitas ERD)

1. `pengguna` (`id_pengguna`, `nama`, `email_kampus` UNIQUE, `no_hp`, `password_hash`, `peran`, `status_akun`, `waktu_daftar`)
2. `kurir` (`id_kurir`, `id_pengguna` FK, `status_verifikasi`, `status_ketersediaan`, `rating_rata`, `waktu_pengajuan`, `setuju_kode_etik`, `alasan_penolakan`)
3. `jadwal_kurir` (`id_jadwal`, `id_kurir` FK, `hari`, `jam_mulai`, `jam_selesai`)
4. `lokasi` (`id_lokasi`, `nama_lokasi`, `jenis`, `kapasitas_loker`, `slot_tersedia`, `keterangan`)
5. `permintaan` (`id_permintaan`, `kode_resi` UNIQUE, `id_pemesan` FK, `jenis`, `deskripsi_barang`, `nama_penerima`, `foto_barang`, `id_lokasi_asal` FK, `id_lokasi_tujuan` FK, `status`, `estimasi_waktu`, `waktu_dibuat`)
6. `penugasan` (`id_penugasan`, `id_permintaan` FK, `id_kurir` FK, `metode`, `waktu_ditugaskan`)
7. `riwayat_status` (`id_riwayat`, `id_permintaan` FK, `status`, `waktu`, `id_pengubah` FK)
8. `serah_terima` (`id_serah_terima`, `id_permintaan` FK, `jenis`, `foto_bukti`, `kode_otp`, `jumlah_percobaan_otp`, `waktu`)
9. `transaksi` (`id_transaksi`, `id_permintaan` FK, `biaya_jasa`, `honor_kurir`, `metode_pembayaran`, `status_bayar`, `waktu`)
10. `laporan_kehilangan` (`id_laporan`, `id_permintaan` FK, `id_pelapor` FK, `deskripsi`, `foto_bukti`, `status`, `tindak_lanjut`, `id_admin` FK)
11. `ulasan` (`id_ulasan`, `id_permintaan` FK UNIQUE, `id_kurir` FK, `id_pemberi` FK, `rating`, `komentar`)
12. `notifikasi` (`id_notifikasi`, `id_pengguna` FK, `id_permintaan` FK, `pesan`, `sudah_dibaca`, `waktu`)
13. `verifikasi_email` (`id_verifikasi`, `id_pengguna` FK, `kode_verifikasi`, `waktu_dibuat`, `waktu_kedaluwarsa`, `jumlah_percobaan`, `status`)

---

## 🔑 Akun Seeder Awal (Siap Diuji)

Password seluruh akun awal adalah: **`password123`**

| Peran | Nama | Email Kampus | Keterangan |
|---|---|---|---|
| **Administrator** | Salem, Jovitly Mike | `admin@student.unklab.ac.id` | Akses penuh Dashboard Admin (`L-12`) |
| **Mahasiswa Kurir** | Sanjaya, Liandy | `S2410602@student.unklab.ac.id` | Kurir aktif, shift setiap hari 07.00–21.00 (`L-08`) |
| **Mahasiswa 1** | Michelle Lumentut | `12410601@student.unklab.ac.id` | Mahasiswa aktif pemesan (`L-02`) |
| **Mahasiswa 2** | Andrew Sahala | `12410207@student.unklab.ac.id` | Mahasiswa aktif penerima (`L-02`) |

*Catatan: Tombol "Akses demo sebagai [Mahasiswa | Kurir | Admin]" pada halaman Login (L-01) secara otomatis mengisi kredensial untuk mempermudah demonstrasi.*

---

## ⚙️ Cara Menjalankan Aplikasi

### 1. Menjalankan Server
Jalankan file batch:
```cmd
start.bat
```
Atau melalui terminal:
```bash
node server.js
```
Server akan berjalan di: **`http://localhost:3000`**

### 2. Menjalankan Pengujian Otomatis (TC-01 s.d. TC-41)
Jalankan skrip pengujian:
```bash
node test_logic.js
```

**Hasil Pengujian:**
```text
========================================================================
 HASIL AKHIR: 41 / 41 KASUS UJI LULUS (0 GAGAL)
========================================================================
```
Semua 41 kasus uji yang dispesifikasikan dalam dokumen SRS berhasil divalidasi 100%.
