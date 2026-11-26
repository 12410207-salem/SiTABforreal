const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Password hashing utility using Node.js crypto
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

// Verification code (OTP) hash
function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// Database schema default structure
function getInitialSchema() {
  return {
    meta: { version: '1.0', last_updated: new Date().toISOString() },
    counters: {
      pengguna: 0,
      kurir: 0,
      jadwal_kurir: 0,
      lokasi: 0,
      permintaan: 0,
      penugasan: 0,
      riwayat_status: 0,
      serah_terima: 0,
      transaksi: 0,
      laporan_kehilangan: 0,
      ulasan: 0,
      notifikasi: 0,
      verifikasi_email: 0,
      resi_seq: 252
    },
    pengguna: [],
    kurir: [],
    jadwal_kurir: [],
    lokasi: [],
    permintaan: [],
    penugasan: [],
    riwayat_status: [],
    serah_terima: [],
    transaksi: [],
    laporan_kehilangan: [],
    ulasan: [],
    notifikasi: [],
    verifikasi_email: []
  };
}

class Database {
  constructor(filepath = DB_FILE) {
    this.filepath = filepath;
    this.data = null;
    this.init();
  }

  init() {
    if (!fs.existsSync(this.filepath)) {
      this.data = getInitialSchema();
      this.seedData();
      this.save();
    } else {
      try {
        const raw = fs.readFileSync(this.filepath, 'utf8');
        this.data = JSON.parse(raw);
      } catch (e) {
        console.error('Error reading database, creating new initial DB:', e);
        this.data = getInitialSchema();
        this.seedData();
        this.save();
      }
    }
  }

  save() {
    this.data.meta.last_updated = new Date().toISOString();
    fs.writeFileSync(this.filepath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  reset() {
    this.data = getInitialSchema();
    this.seedData();
    this.save();
  }

  nextId(table) {
    this.data.counters[table] = (this.data.counters[table] || 0) + 1;
    return this.data.counters[table];
  }

  nextResi() {
    this.data.counters.resi_seq = (this.data.counters.resi_seq || 0) + 1;
    const num = String(this.data.counters.resi_seq).padStart(4, '0');
    return `STB-${num}`;
  }

  seedData() {
    const now = new Date().toISOString();

    // 1. Lokasi Kampus (Lengkap dengan 7 Pos Drop Point Resmi UNKLAB & Gedung)
    const locs = [
      { id_lokasi: 1, nama_lokasi: 'Pos 1 - Gedung GK1', jenis: 'drop_point', kapasitas_loker: 12, slot_tersedia: 8, keterangan: 'Lantai 1 · Sebelah lobi utama · Buka 07.00–20.00' },
      { id_lokasi: 2, nama_lokasi: 'Pos 2 - Perpustakaan', jenis: 'drop_point', kapasitas_loker: 10, slot_tersedia: 7, keterangan: 'Lobi perpustakaan lantai dasar · Buka 08.00–18.00' },
      { id_lokasi: 3, nama_lokasi: 'Asrama Crystal', jenis: 'gedung', kapasitas_loker: 0, slot_tersedia: 0, keterangan: 'Lobi Asrama Crystal' },
      { id_lokasi: 4, nama_lokasi: 'Kantin', jenis: 'gedung', kapasitas_loker: 0, slot_tersedia: 0, keterangan: 'Kantin utama kampus UNKLAB' },
      { id_lokasi: 5, nama_lokasi: 'Gedung A', jenis: 'gedung', kapasitas_loker: 0, slot_tersedia: 0, keterangan: 'Lobi perkuliahan Gedung A' },
      // 5 Pos Baru Tambahan untuk Titip Barang Mandiri:
      { id_lokasi: 6, nama_lokasi: 'Pos 3 - Student Center / Hall UNKLAB', jenis: 'drop_point', kapasitas_loker: 16, slot_tersedia: 12, keterangan: 'Lantai dasar depan Student Affairs · Buka 07.00–21.00' },
      { id_lokasi: 7, nama_lokasi: 'Pos 4 - Pos Satpam Utama (Gate 1)', jenis: 'drop_point', kapasitas_loker: 15, slot_tersedia: 10, keterangan: 'Gerbang utama kampus UNKLAB · Buka 24 Jam' },
      { id_lokasi: 8, nama_lokasi: 'Pos 5 - Asrama Edelweiss', jenis: 'drop_point', kapasitas_loker: 12, slot_tersedia: 9, keterangan: 'Lobi depan Asrama Putri Edelweiss · Buka 06.00–22.00' },
      { id_lokasi: 9, nama_lokasi: 'Pos 6 - Gedung Kuliah Pascasarjana', jenis: 'drop_point', kapasitas_loker: 10, slot_tersedia: 8, keterangan: 'Lantai 1 lobi Pascasarjana · Buka 07.30–19.00' },
      { id_lokasi: 10, nama_lokasi: 'Pos 7 - Gedung Pioneer Chapel', jenis: 'drop_point', kapasitas_loker: 8, slot_tersedia: 6, keterangan: 'Sebelah kanan pintu masuk Pioneer Chapel · Buka 07.00–18.00' }
    ];
    this.data.lokasi = locs;
    this.data.counters.lokasi = 10;

    // 2. Pengguna Awal
    // Administrator
    const passHash = hashPassword('password123');
    const uAdmin = {
      id_pengguna: 1,
      nama: 'Salem, Jovitly Mike',
      email_kampus: 'admin@student.unklab.ac.id',
      no_hp: '081234567890',
      password_hash: passHash,
      peran: 'administrator',
      status_akun: 'aktif',
      waktu_daftar: now
    };

    // Mahasiswa 1
    const uMhs1 = {
      id_pengguna: 2,
      nama: 'Michelle Lumentut',
      email_kampus: '12410601@student.unklab.ac.id',
      no_hp: '081234567891',
      password_hash: passHash,
      peran: 'mahasiswa',
      status_akun: 'aktif',
      waktu_daftar: now
    };

    // Mahasiswa 2
    const uMhs2 = {
      id_pengguna: 3,
      nama: 'Andrew Sahala',
      email_kampus: '12410207@student.unklab.ac.id',
      no_hp: '081234567892',
      password_hash: passHash,
      peran: 'mahasiswa',
      status_akun: 'aktif',
      waktu_daftar: now
    };

    // Mahasiswa Kurir (Active Courier - NOT Daniel Rantung!)
    const uKurir = {
      id_pengguna: 4,
      nama: 'Sanjaya, Liandy',
      email_kampus: 'S2410602@student.unklab.ac.id',
      no_hp: '081234567893',
      password_hash: passHash,
      peran: 'kurir',
      status_akun: 'aktif',
      waktu_daftar: now
    };

    this.data.pengguna = [uAdmin, uMhs1, uMhs2, uKurir];
    this.data.counters.pengguna = 4;

    // 3. Kurir Record
    const kurirRecord = {
      id_kurir: 1,
      id_pengguna: 4,
      status_verifikasi: 'disetujui',
      status_ketersediaan: 'tersedia',
      rating_rata: 4.90,
      waktu_pengajuan: now,
      setuju_kode_etik: true,
      alasan_penolakan: null
    };
    this.data.kurir = [kurirRecord];
    this.data.counters.kurir = 1;

    // 4. Jadwal Kurir (Senin s.d. Minggu 07.00 - 21.00)
    const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    this.data.jadwal_kurir = days.map((day, idx) => ({
      id_jadwal: idx + 1,
      id_kurir: 1,
      hari: day,
      jam_mulai: '07:00',
      jam_selesai: '21:00'
    }));
    this.data.counters.jadwal_kurir = 7;

    // 5. Permintaan Contoh (Untuk langsung demo dan visualisasi UI)
    // Permintaan 1: STB-0248 (Antar, Dalam Perjalanan)
    const req1 = {
      id_permintaan: 1,
      kode_resi: 'STB-0248',
      id_pemesan: 2, // Michelle Lumentut
      jenis: 'antar',
      deskripsi_barang: 'Buku referensi (2 buah), dalam tote bag krem',
      nama_penerima: 'Gabriella Manoppo',
      foto_barang: '/uploads/sample_book.jpg',
      id_lokasi_asal: 2, // Perpustakaan
      id_lokasi_tujuan: 3, // Asrama Crystal
      status: 'Dalam Perjalanan',
      estimasi_waktu: 15,
      waktu_dibuat: new Date(Date.now() - 3600000).toISOString()
    };

    // Permintaan 2: STB-0252 (Titip, Disimpan)
    const req2 = {
      id_permintaan: 2,
      kode_resi: 'STB-0252',
      id_pemesan: 2, // Michelle
      jenis: 'titip',
      deskripsi_barang: 'Buku Algoritma, sampul biru',
      nama_penerima: 'Michelle Lumentut',
      foto_barang: '/uploads/sample_algoritma.jpg',
      id_lokasi_asal: 1, // GK1
      id_lokasi_tujuan: 1,
      status: 'Disimpan',
      estimasi_waktu: 0,
      waktu_dibuat: new Date(Date.now() - 7200000).toISOString()
    };

    // Permintaan 3: STB-0001 (Selesai/Terkirim)
    const req3 = {
      id_permintaan: 3,
      kode_resi: 'STB-0001',
      id_pemesan: 2,
      jenis: 'antar',
      deskripsi_barang: 'Kabel charger iPhone type-C',
      nama_penerima: 'Andrew Sahala',
      foto_barang: '/uploads/sample_charger.jpg',
      id_lokasi_asal: 4, // Kantin
      id_lokasi_tujuan: 1, // GK1
      status: 'Terkirim',
      estimasi_waktu: 10,
      waktu_dibuat: new Date(Date.now() - 86400000).toISOString()
    };

    this.data.permintaan = [req1, req2, req3];
    this.data.counters.permintaan = 3;

    // 6. Penugasan
    this.data.penugasan = [
      { id_penugasan: 1, id_permintaan: 1, id_kurir: 1, metode: 'otomatis', waktu_ditugaskan: req1.waktu_dibuat },
      { id_penugasan: 2, id_permintaan: 3, id_kurir: 1, metode: 'otomatis', waktu_ditugaskan: req3.waktu_dibuat }
    ];
    this.data.counters.penugasan = 2;

    // 7. Riwayat Status
    this.data.riwayat_status = [
      { id_riwayat: 1, id_permintaan: 1, status: 'Menunggu', waktu: req1.waktu_dibuat, id_pengubah: 2 },
      { id_riwayat: 2, id_permintaan: 1, status: 'Dijemput', waktu: new Date(Date.now() - 2400000).toISOString(), id_pengubah: 4 },
      { id_riwayat: 3, id_permintaan: 1, status: 'Dalam Perjalanan', waktu: new Date(Date.now() - 1200000).toISOString(), id_pengubah: 4 },
      { id_riwayat: 4, id_permintaan: 2, status: 'Disimpan', waktu: req2.waktu_dibuat, id_pengubah: 2 },
      { id_riwayat: 5, id_permintaan: 3, status: 'Menunggu', waktu: req3.waktu_dibuat, id_pengubah: 2 },
      { id_riwayat: 6, id_permintaan: 3, status: 'Dijemput', waktu: new Date(Date.now() - 80000000).toISOString(), id_pengubah: 4 },
      { id_riwayat: 7, id_permintaan: 3, status: 'Dalam Perjalanan', waktu: new Date(Date.now() - 75000000).toISOString(), id_pengubah: 4 },
      { id_riwayat: 8, id_permintaan: 3, status: 'Terkirim', waktu: new Date(Date.now() - 70000000).toISOString(), id_pengubah: 4 }
    ];
    this.data.counters.riwayat_status = 8;

    // 8. Serah Terima
    this.data.serah_terima = [
      { id_serah_terima: 1, id_permintaan: 1, jenis: 'penjemputan', foto_bukti: '/uploads/sample_pickup.jpg', kode_otp: '4829', jumlah_percobaan_otp: 0, waktu: new Date(Date.now() - 2400000).toISOString() },
      { id_serah_terima: 2, id_permintaan: 2, jenis: 'penitipan', foto_bukti: '/uploads/sample_algoritma.jpg', kode_otp: '5173', jumlah_percobaan_otp: 0, waktu: req2.waktu_dibuat },
      { id_serah_terima: 3, id_permintaan: 3, jenis: 'pengambilan', foto_bukti: '/uploads/sample_delivered.jpg', kode_otp: '1904', jumlah_percobaan_otp: 0, waktu: new Date(Date.now() - 70000000).toISOString() }
    ];
    this.data.counters.serah_terima = 3;

    // 9. Transaksi
    this.data.transaksi = [
      { id_transaksi: 1, id_permintaan: 1, biaya_jasa: 5000, honor_kurir: 4000, metode_pembayaran: 'Tunai saat serah-terima', status_bayar: 'belum', waktu: req1.waktu_dibuat },
      { id_transaksi: 2, id_permintaan: 2, biaya_jasa: 0, honor_kurir: 0, metode_pembayaran: 'Gratis Drop Point', status_bayar: 'lunas', waktu: req2.waktu_dibuat },
      { id_transaksi: 3, id_permintaan: 3, biaya_jasa: 5000, honor_kurir: 4000, metode_pembayaran: 'Tunai', status_bayar: 'lunas', waktu: new Date(Date.now() - 70000000).toISOString() }
    ];
    this.data.counters.transaksi = 3;

    // 10. Ulasan
    this.data.ulasan = [
      { id_ulasan: 1, id_permintaan: 3, id_kurir: 1, id_pemberi: 2, rating: 5, komentar: 'Pengantaran sangat cepat dan barang aman!' }
    ];
    this.data.counters.ulasan = 1;

    // 11. Notifikasi
    this.data.notifikasi = [
      { id_notifikasi: 1, id_pengguna: 2, id_permintaan: 1, pesan: 'Pesanan STB-0248 diambil kurir Sanjaya sedang menuju lokasi pengantaran', sudah_dibaca: false, waktu: new Date(Date.now() - 1200000).toISOString() },
      { id_notifikasi: 2, id_pengguna: 2, id_permintaan: 2, pesan: 'Penitipan STB-0252 berhasil. Barang tersimpan di loker Gedung GK1', sudah_dibaca: true, waktu: new Date(Date.now() - 7200000).toISOString() },
      { id_notifikasi: 3, id_pengguna: 1, id_permintaan: null, pesan: 'Sistem SiTAB Kampus UNKLAB siap beroperasi.', sudah_dibaca: false, waktu: now }
    ];
    this.data.counters.notifikasi = 3;
  }
}

const db = new Database();

module.exports = {
  db,
  Database,
  hashPassword,
  verifyPassword,
  hashOtp
};
