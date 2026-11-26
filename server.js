const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { db, hashPassword, verifyPassword, hashOtp } = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-memory active sessions: token -> { userId, expiresAt }
const sessions = new Map();

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  sessions.set(token, { userId, expiresAt });
  return token;
}

function getSessionUser(token) {
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    sessions.delete(token);
    return null;
  }
  const user = db.data.pengguna.find(u => u.id_pengguna === sess.userId);
  return user || null;
}

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function getAuthUser(req) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const cookies = parseCookies(req);
    token = cookies.sitab_token;
  }
  return getSessionUser(token);
}

// Helper: send JSON response
function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...headers
  });
  res.end(JSON.stringify(data));
}

// Helper: parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // 10MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        // Try urlencoded
        try {
          const qs = require('querystring').parse(body);
          resolve(qs);
        } catch {
          resolve({});
        }
      }
    });
    req.on('error', reject);
  });
}

// Add notification helper
function createNotification(id_pengguna, pesan, id_permintaan = null) {
  const notif = {
    id_notifikasi: db.nextId('notifikasi'),
    id_pengguna,
    id_permintaan,
    pesan,
    sudah_dibaca: false,
    waktu: new Date().toISOString()
  };
  db.data.notifikasi.unshift(notif);
  db.save();
  return notif;
}

// Notify all administrators
function notifyAdmins(pesan, id_permintaan = null) {
  const admins = db.data.pengguna.filter(u => u.peran === 'administrator');
  admins.forEach(admin => {
    createNotification(admin.id_pengguna, pesan, id_permintaan);
  });
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Forbidden goods keywords (BR-02)
const FORBIDDEN_WORDS = ['uang tunai', 'senjata', 'narkoba', 'bahan peledak', 'mudah meledak'];

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // -------------------------------------------------------------
    // API ROUTES
    // -------------------------------------------------------------

    // 1. POST /api/auth/register (Registrasi Mahasiswa, UC-16)
    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = await parseBody(req);
      const { nama, email_kampus, no_hp, password, confirm_password } = body;

      // Validasi kolom wajib
      if (!nama || !email_kampus || !no_hp || !password || !confirm_password) {
        return sendJson(res, 400, {
          success: false,
          message: 'Semua kolom wajib diisi.',
          field_errors: {
            nama: !nama ? 'Nama lengkap wajib diisi' : null,
            email_kampus: !email_kampus ? 'Email kampus wajib diisi' : null,
            no_hp: !no_hp ? 'Nomor telepon wajib diisi' : null,
            password: !password ? 'Password wajib diisi' : null,
            confirm_password: !confirm_password ? 'Konfirmasi password wajib diisi' : null
          }
        });
      }

      // Validasi domain & format email kampus UNKLAB: [8 angka atau S + 7 angka]@student.unklab.ac.id
      const unklabEmailRegex = /^([0-9]{8}|S[0-9]{7})@student\.unklab\.ac\.id$/i;
      if (!email_kampus.toLowerCase().endsWith('@student.unklab.ac.id')) {
        return sendJson(res, 400, {
          success: false,
          message: 'Email harus berupa email mahasiswa UNKLAB (@student.unklab.ac.id).',
          field_errors: { email_kampus: 'Gunakan email mahasiswa UNKLAB (@student.unklab.ac.id)' }
        });
      }
      if (!unklabEmailRegex.test(email_kampus)) {
        return sendJson(res, 400, {
          success: false,
          message: 'Format email harus nomor registrasi 8 karakter (contoh: 12410601@student.unklab.ac.id atau S2410601@student.unklab.ac.id).',
          field_errors: { email_kampus: 'Format nomor registrasi tidak valid (8 digit angka atau S + 7 digit angka)' }
        });
      }

      // Validasi nomor telepon: 10-15 digit angka
      if (!/^[0-9]{10,15}$/.test(no_hp)) {
        return sendJson(res, 400, {
          success: false,
          message: 'Nomor telepon hanya boleh berisi angka, 10–15 digit.',
          field_errors: { no_hp: 'Nomor telepon hanya berisi angka, 10–15 digit' }
        });
      }

      // Validasi panjang password
      if (password.length < 8) {
        return sendJson(res, 400, {
          success: false,
          message: 'Password minimal 8 karakter.',
          field_errors: { password: 'Password minimal 8 karakter' }
        });
      }

      // Validasi konfirmasi password
      if (password !== confirm_password) {
        return sendJson(res, 400, {
          success: false,
          message: 'Konfirmasi password tidak sama dengan password.',
          field_errors: { confirm_password: 'Konfirmasi password tidak cocok' }
        });
      }

      // Periksa apakah email sudah terdaftar
      const existingUser = db.data.pengguna.find(u => u.email_kampus.toLowerCase() === email_kampus.toLowerCase());
      if (existingUser) {
        if (existingUser.status_akun === 'belum_diverifikasi') {
          return sendJson(res, 400, {
            success: false,
            message: 'Email sudah terdaftar namun belum diverifikasi. Silakan masukkan kode verifikasi atau kirim ulang.',
            already_registered: true,
            status_akun: 'belum_diverifikasi',
            email_kampus: existingUser.email_kampus
          });
        }
        return sendJson(res, 400, {
          success: false,
          message: 'Email sudah terdaftar. Silakan login atau hubungi administrator.',
          already_registered: true
        });
      }

      // Simpan akun baru
      const now = new Date().toISOString();
      const newUserId = db.nextId('pengguna');
      const newUser = {
        id_pengguna: newUserId,
        nama: nama.trim(),
        email_kampus: email_kampus.toLowerCase().trim(),
        no_hp: no_hp.trim(),
        password_hash: hashPassword(password),
        peran: 'mahasiswa',
        status_akun: 'belum_diverifikasi',
        waktu_daftar: now
      };
      db.data.pengguna.push(newUser);

      // Generate 6 digit verification code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const exp = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins
      const verifRecord = {
        id_verifikasi: db.nextId('verifikasi_email'),
        id_pengguna: newUserId,
        kode_verifikasi: hashOtp(code),
        waktu_dibuat: now,
        waktu_kedaluwarsa: exp,
        jumlah_percobaan: 0,
        status: 'menunggu'
      };
      db.data.verifikasi_email.push(verifRecord);
      db.save();

      console.log(`[SIMULASI EMAIL KAMPUS] Kode verifikasi untuk ${email_kampus}: ${code}`);

      return sendJson(res, 201, {
        success: true,
        message: 'Registrasi berhasil! Kode verifikasi telah dikirim ke email kampus Anda.',
        email_kampus: newUser.email_kampus,
        simulation_code: code // Dikirimkan untuk kemudahan demonstrasi lokal
      });
    }

    // 2. POST /api/auth/verify-email (Verifikasi Email, UC-17)
    if (pathname === '/api/auth/verify-email' && method === 'POST') {
      const body = await parseBody(req);
      const { email_kampus, kode } = body;

      if (!email_kampus || !kode) {
        return sendJson(res, 400, { success: false, message: 'Email kampus dan kode verifikasi wajib diisi.' });
      }

      const user = db.data.pengguna.find(u => u.email_kampus.toLowerCase() === email_kampus.toLowerCase());
      if (!user) {
        return sendJson(res, 404, { success: false, message: 'Akun tidak ditemukan.' });
      }

      // Ambil kode verifikasi yang berstatus 'menunggu'
      const verifs = db.data.verifikasi_email
        .filter(v => v.id_pengguna === user.id_pengguna && v.status === 'menunggu')
        .sort((a, b) => new Date(b.waktu_dibuat) - new Date(a.waktu_dibuat));

      if (verifs.length === 0) {
        return sendJson(res, 400, { success: false, message: 'Tidak ada kode verifikasi aktif. Silakan minta kode baru.' });
      }

      const activeVerif = verifs[0];

      // Cek apakah sudah kedaluwarsa
      if (new Date() > new Date(activeVerif.waktu_kedaluwarsa)) {
        activeVerif.status = 'kedaluwarsa';
        db.save();
        return sendJson(res, 400, { success: false, message: 'Kode verifikasi telah kedaluwarsa (berlaku 15 menit). Silakan kirim ulang kode.' });
      }

      // Cek percobaan melebihi 5 kali
      if (activeVerif.jumlah_percobaan >= 5) {
        activeVerif.status = 'kedaluwarsa';
        db.save();
        return sendJson(res, 400, { success: false, message: 'Percobaan salah melebihi batas (5 kali). Silakan minta kode baru.' });
      }

      // Periksa kecocokan hash kode
      const inputHash = hashOtp(kode.trim());
      if (inputHash !== activeVerif.kode_verifikasi) {
        activeVerif.jumlah_percobaan += 1;
        const sisa = 5 - activeVerif.jumlah_percobaan;
        db.save();
        return sendJson(res, 400, {
          success: false,
          message: `Kode verifikasi salah. Sisa percobaan: ${sisa}`,
          sisa_percobaan: sisa
        });
      }

      // Berhasil diverifikasi
      activeVerif.status = 'terpakai';
      user.status_akun = 'aktif';
      db.save();

      createNotification(user.id_pengguna, 'Selamat! Email kampus Anda berhasil diverifikasi. Akun SiTAB Anda kini telah aktif.');

      return sendJson(res, 200, {
        success: true,
        message: 'Verifikasi email berhasil! Akun Anda kini aktif. Silakan masuk.'
      });
    }

    // 3. POST /api/auth/resend-code (Kirim ulang kode verifikasi, UC-17)
    if (pathname === '/api/auth/resend-code' && method === 'POST') {
      const body = await parseBody(req);
      const { email_kampus } = body;

      if (!email_kampus) {
        return sendJson(res, 400, { success: false, message: 'Email kampus wajib diisi.' });
      }

      const user = db.data.pengguna.find(u => u.email_kampus.toLowerCase() === email_kampus.toLowerCase());
      if (!user) {
        return sendJson(res, 404, { success: false, message: 'Akun tidak ditemukan.' });
      }

      // Batalkan kode sebelumnya
      db.data.verifikasi_email.forEach(v => {
        if (v.id_pengguna === user.id_pengguna && v.status === 'menunggu') {
          v.status = 'kedaluwarsa';
        }
      });

      const now = new Date().toISOString();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const exp = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const verifRecord = {
        id_verifikasi: db.nextId('verifikasi_email'),
        id_pengguna: user.id_pengguna,
        kode_verifikasi: hashOtp(code),
        waktu_dibuat: now,
        waktu_kedaluwarsa: exp,
        jumlah_percobaan: 0,
        status: 'menunggu'
      };
      db.data.verifikasi_email.push(verifRecord);
      db.save();

      console.log(`[SIMULASI EMAIL KAMPUS] Kode verifikasi baru untuk ${email_kampus}: ${code}`);

      return sendJson(res, 200, {
        success: true,
        message: 'Kode verifikasi baru berhasil dikirim ke email kampus Anda.',
        simulation_code: code
      });
    }

    // 4. POST /api/auth/login (Login Pengguna, UC-01)
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const { email_kampus, password } = body;

      // 4a. Kolom kosong
      if (!email_kampus || !password) {
        return sendJson(res, 400, {
          success: false,
          message: 'Email kampus dan password wajib diisi.',
          field_errors: {
            email_kampus: !email_kampus ? 'Email kampus wajib diisi' : null,
            password: !password ? 'Password wajib diisi' : null
          }
        });
      }

      // 5a. Cari akun & bandingkan password
      const user = db.data.pengguna.find(u => u.email_kampus.toLowerCase() === email_kampus.trim().toLowerCase());
      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJson(res, 401, {
          success: false,
          message: 'Email atau password salah'
        });
      }

      // 6a. Cek akun nonaktif
      if (user.status_akun === 'nonaktif') {
        return sendJson(res, 403, {
          success: false,
          message: 'Akun Anda berstatus nonaktif. Silakan hubungi administrator.'
        });
      }

      // 6b. Cek akun belum diverifikasi
      if (user.status_akun === 'belum_diverifikasi') {
        return sendJson(res, 403, {
          success: false,
          message: 'Akun belum diverifikasi. Silakan lakukan verifikasi email terlebih dahulu.',
          need_verification: true,
          email_kampus: user.email_kampus
        });
      }

      // Login berhasil: Buat session token
      const token = createSession(user.id_pengguna);

      // Cek apakah ada pengajuan kurir jika perannya masih mahasiswa
      let courierStatus = null;
      if (user.peran === 'mahasiswa') {
        const kApp = db.data.kurir.find(k => k.id_pengguna === user.id_pengguna);
        if (kApp) {
          courierStatus = kApp.status_verifikasi;
        }
      }

      // Arahkan ke dashboard sesuai peran
      let redirectUrl = '/dashboard-mahasiswa.html';
      if (user.peran === 'kurir') redirectUrl = '/dashboard-kurir.html';
      if (user.peran === 'administrator') redirectUrl = '/dashboard-admin.html';

      return sendJson(res, 200, {
        success: true,
        message: 'Login berhasil.',
        token,
        redirectUrl,
        user: {
          id_pengguna: user.id_pengguna,
          nama: user.nama,
          email_kampus: user.email_kampus,
          no_hp: user.no_hp,
          peran: user.peran,
          status_akun: user.status_akun,
          courier_application_status: courierStatus
        }
      }, {
        'Set-Cookie': `sitab_token=${token}; Path=/; HttpOnly; SameSite=Lax`
      });
    }

    // 5. GET /api/auth/me
    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = getAuthUser(req);
      if (!user) {
        return sendJson(res, 401, { success: false, message: 'Sesi tidak valid atau telah berakhir.' });
      }

      let courierInfo = null;
      const kRecord = db.data.kurir.find(k => k.id_pengguna === user.id_pengguna);
      if (kRecord) {
        const schedules = db.data.jadwal_kurir.filter(j => j.id_kurir === kRecord.id_kurir);
        courierInfo = {
          ...kRecord,
          jadwal: schedules
        };
      }

      return sendJson(res, 200, {
        success: true,
        user: {
          id_pengguna: user.id_pengguna,
          nama: user.nama,
          email_kampus: user.email_kampus,
          no_hp: user.no_hp,
          peran: user.peran,
          status_akun: user.status_akun
        },
        courier: courierInfo
      });
    }

    // 6. POST /api/auth/logout
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const cookies = parseCookies(req);
      if (cookies.sitab_token) sessions.delete(cookies.sitab_token);
      return sendJson(res, 200, { success: true, message: 'Logout berhasil.' }, {
        'Set-Cookie': 'sitab_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      });
    }

    // 7. POST /api/kurir/register (Registrasi Kurir, UC-18)
    if (pathname === '/api/kurir/register' && method === 'POST') {
      const body = await parseBody(req);
      const authUser = getAuthUser(req);

      let targetUser = authUser;
      const {
        nama, email_kampus, no_hp, password, confirm_password,
        jadwal, setuju_kode_etik
      } = body;

      // Validasi kode etik wajib dicentang
      if (!setuju_kode_etik) {
        return sendJson(res, 400, {
          success: false,
          message: 'Anda wajib menyetujui Kode Etik Kurir SiTAB.'
        });
      }

      // Validasi jadwal minimal 1 shift & format valid
      if (!jadwal || !Array.isArray(jadwal) || jadwal.length === 0) {
        return sendJson(res, 400, {
          success: false,
          message: 'Pilih minimal satu shift ketersediaan jadwal.'
        });
      }

      // Cek bentrok jadwal pada hari yang sama
      const daySlots = {};
      for (const shift of jadwal) {
        if (!shift.hari || !shift.jam_mulai || !shift.jam_selesai) {
          return sendJson(res, 400, { success: false, message: 'Format jadwal tidak lengkap.' });
        }
        if (shift.jam_mulai >= shift.jam_selesai) {
          return sendJson(res, 400, { success: false, message: `Jam mulai shift (${shift.jam_mulai}) harus lebih awal dari jam selesai (${shift.jam_selesai}).` });
        }
        if (!daySlots[shift.hari]) daySlots[shift.hari] = [];
        for (const existing of daySlots[shift.hari]) {
          if (shift.jam_mulai < existing.jam_selesai && shift.jam_selesai > existing.jam_mulai) {
            return sendJson(res, 400, {
              success: false,
              message: `Jadwal bentrok pada hari ${shift.hari}: ${shift.jam_mulai}–${shift.jam_selesai} dengan ${existing.jam_mulai}–${existing.jam_selesai}`
            });
          }
        }
        daySlots[shift.hari].push(shift);
      }

      // Jalur 1: Belum login / Belum punya akun
      if (!targetUser) {
        if (!nama || !email_kampus || !no_hp || !password || !confirm_password) {
          return sendJson(res, 400, { success: false, message: 'Semua kolom data akun wajib diisi.' });
        }

        const unklabEmailRegex = /^([0-9]{8}|S[0-9]{7})@student\.unklab\.ac\.id$/i;
        if (!unklabEmailRegex.test(email_kampus)) {
          return sendJson(res, 400, {
            success: false,
            message: 'Email harus berupa email mahasiswa UNKLAB (@student.unklab.ac.id).'
          });
        }

        if (!/^[0-9]{10,15}$/.test(no_hp)) {
          return sendJson(res, 400, { success: false, message: 'Nomor telepon hanya boleh berisi angka, 10–15 digit.' });
        }

        if (password.length < 8) {
          return sendJson(res, 400, { success: false, message: 'Password minimal 8 karakter.' });
        }

        if (password !== confirm_password) {
          return sendJson(res, 400, { success: false, message: 'Konfirmasi password tidak cocok.' });
        }

        // Cek email sudah ada
        const existing = db.data.pengguna.find(u => u.email_kampus.toLowerCase() === email_kampus.toLowerCase());
        if (existing) {
          return sendJson(res, 400, {
            success: false,
            message: 'Email sudah terdaftar. Silakan login terlebih dahulu lalu ajukan diri dari Dashboard Mahasiswa.'
          });
        }

        // Buat user akun mahasiswa baru (belum_diverifikasi)
        const now = new Date().toISOString();
        const newUserId = db.nextId('pengguna');
        targetUser = {
          id_pengguna: newUserId,
          nama: nama.trim(),
          email_kampus: email_kampus.toLowerCase().trim(),
          no_hp: no_hp.trim(),
          password_hash: hashPassword(password),
          peran: 'mahasiswa',
          status_akun: 'belum_diverifikasi',
          waktu_daftar: now
        };
        db.data.pengguna.push(targetUser);

        // Buat verifikasi email
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const exp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        db.data.verifikasi_email.push({
          id_verifikasi: db.nextId('verifikasi_email'),
          id_pengguna: newUserId,
          kode_verifikasi: hashOtp(code),
          waktu_dibuat: now,
          waktu_kedaluwarsa: exp,
          jumlah_percobaan: 0,
          status: 'menunggu'
        });

        console.log(`[SIMULASI EMAIL KAMPUS] Kode verifikasi pendaftaran kurir untuk ${email_kampus}: ${code}`);
      }

      // Cek apakah sudah pernah mengajukan kurir
      const existingKurir = db.data.kurir.find(k => k.id_pengguna === targetUser.id_pengguna);
      if (existingKurir) {
        if (existingKurir.status_verifikasi === 'menunggu_verifikasi') {
          return sendJson(res, 400, { success: false, message: 'Anda sudah memiliki pengajuan kurir yang sedang menunggu verifikasi administrator.' });
        }
        if (existingKurir.status_verifikasi === 'disetujui') {
          return sendJson(res, 400, { success: false, message: 'Akun Anda sudah terdaftar sebagai kurir aktif.' });
        }
        // Jika sebelumnya ditolak, izinkan pengajuan ulang
        existingKurir.status_verifikasi = 'menunggu_verifikasi';
        existingKurir.alasan_penolakan = null;
        existingKurir.waktu_pengajuan = new Date().toISOString();
        existingKurir.setuju_kode_etik = true;

        // Perbarui jadwal
        db.data.jadwal_kurir = db.data.jadwal_kurir.filter(j => j.id_kurir !== existingKurir.id_kurir);
        jadwal.forEach(shift => {
          db.data.jadwal_kurir.push({
            id_jadwal: db.nextId('jadwal_kurir'),
            id_kurir: existingKurir.id_kurir,
            hari: shift.hari,
            jam_mulai: shift.jam_mulai,
            jam_selesai: shift.jam_selesai
          });
        });

        db.save();
        notifyAdmins(`Pengajuan kurir ulang dari ${targetUser.nama} (${targetUser.email_kampus}).`);
        return sendJson(res, 200, {
          success: true,
          message: 'Pengajuan ulang sebagai kurir berhasil dikirim dan sedang menunggu verifikasi administrator.'
        });
      }

      // Buat pengajuan kurir baru
      const newKurirId = db.nextId('kurir');
      const newKurir = {
        id_kurir: newKurirId,
        id_pengguna: targetUser.id_pengguna,
        status_verifikasi: 'menunggu_verifikasi',
        status_ketersediaan: 'tersedia',
        rating_rata: null,
        waktu_pengajuan: new Date().toISOString(),
        setuju_kode_etik: true,
        alasan_penolakan: null
      };
      db.data.kurir.push(newKurir);

      // Simpan jadwal
      jadwal.forEach(shift => {
        db.data.jadwal_kurir.push({
          id_jadwal: db.nextId('jadwal_kurir'),
          id_kurir: newKurirId,
          hari: shift.hari,
          jam_mulai: shift.jam_mulai,
          jam_selesai: shift.jam_selesai
        });
      });

      db.save();
      notifyAdmins(`Pengajuan kurir baru dari ${targetUser.nama} (${targetUser.email_kampus}).`);

      return sendJson(res, 201, {
        success: true,
        message: 'Pendaftaran kurir berhasil diajukan dan sedang menunggu verifikasi administrator.',
        email_kampus: targetUser.email_kampus,
        needs_verification: targetUser.status_akun === 'belum_diverifikasi'
      });
    }

    // 8. GET /api/lokasi (Daftar lokasi kampus)
    if (pathname === '/api/lokasi' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        data: db.data.lokasi
      });
    }

    // 9. POST /api/permintaan/titip (Titip Barang di Drop Point, UC-02)
    if (pathname === '/api/permintaan/titip' && method === 'POST') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const body = await parseBody(req);
      const { deskripsi_barang, id_lokasi_asal, nama_penerima, foto_barang } = body;

      // Validasi data wajib & foto
      if (!deskripsi_barang || !id_lokasi_asal || !nama_penerima) {
        return sendJson(res, 400, { success: false, message: 'Deskripsi barang, lokasi drop point, dan nama penerima wajib diisi.' });
      }

      if (!foto_barang) {
        return sendJson(res, 400, { success: false, message: 'Foto barang wajib diunggah untuk penitipan di drop point.' });
      }

      // Cek barang terlarang (BR-02)
      const descLower = deskripsi_barang.toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        if (descLower.includes(word)) {
          return sendJson(res, 400, {
            success: false,
            message: `Barang mengandung kategori terlarang (${word}). Dilarang menitipkan uang tunai, barang berharga, makanan mudah basi, serta bahan berbahaya.`
          });
        }
      }

      // Cek lokasi drop point & ketersediaan slot loker
      const loc = db.data.lokasi.find(l => l.id_lokasi === parseInt(id_lokasi_asal));
      if (!loc || loc.jenis !== 'drop_point') {
        return sendJson(res, 400, { success: false, message: 'Lokasi yang dipilih bukan titik drop point resmi.' });
      }

      if (loc.slot_tersedia <= 0) {
        return sendJson(res, 400, { success: false, message: `Maaf, seluruh slot loker di ${loc.nama_lokasi} sedang penuh.` });
      }

      // Kurangi slot loker
      loc.slot_tersedia -= 1;

      // Buat permintaan penitipan
      const now = new Date().toISOString();
      const id_permintaan = db.nextId('permintaan');
      const kode_resi = db.nextResi();
      const otpCode = String(Math.floor(1000 + Math.random() * 9000)); // 4 digit OTP

      const permintaan = {
        id_permintaan,
        kode_resi,
        id_pemesan: user.id_pengguna,
        jenis: 'titip',
        deskripsi_barang: deskripsi_barang.trim(),
        nama_penerima: nama_penerima.trim(),
        foto_barang,
        id_lokasi_asal: loc.id_lokasi,
        id_lokasi_tujuan: loc.id_lokasi,
        status: 'Disimpan',
        estimasi_waktu: 0,
        waktu_dibuat: now
      };
      db.data.permintaan.push(permintaan);

      // Catat riwayat status
      db.data.riwayat_status.push({
        id_riwayat: db.nextId('riwayat_status'),
        id_permintaan,
        status: 'Disimpan',
        waktu: now,
        id_pengubah: user.id_pengguna
      });

      // Catat serah terima penitipan
      db.data.serah_terima.push({
        id_serah_terima: db.nextId('serah_terima'),
        id_permintaan,
        jenis: 'penitipan',
        foto_bukti: foto_barang,
        kode_otp: otpCode,
        jumlah_percobaan_otp: 0,
        waktu: now
      });

      // Transaksi (Gratis drop point)
      db.data.transaksi.push({
        id_transaksi: db.nextId('transaksi'),
        id_permintaan,
        biaya_jasa: 0,
        honor_kurir: 0,
        metode_pembayaran: 'Layanan Mandiri Drop Point',
        status_bayar: 'lunas',
        waktu: now
      });

      db.save();

      createNotification(user.id_pengguna, `Penitipan ${kode_resi} berhasil. Barang tersimpan di ${loc.nama_lokasi}. Kode OTP pengambilan: ${otpCode}`, id_permintaan);

      return sendJson(res, 201, {
        success: true,
        message: 'Barang berhasil dititipkan di drop point!',
        kode_resi,
        id_permintaan,
        kode_otp: otpCode,
        lokasi: loc.nama_lokasi,
        slot_sisa: loc.slot_tersedia
      });
    }

    // 10. POST /api/permintaan/antar (Pesan Antar Barang, UC-03, UC-04)
    if (pathname === '/api/permintaan/antar' && method === 'POST') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const body = await parseBody(req);
      const { deskripsi_barang, id_lokasi_asal, id_lokasi_tujuan, nama_penerima, foto_barang, metode_pembayaran } = body;

      if (!deskripsi_barang || !id_lokasi_asal || !id_lokasi_tujuan) {
        return sendJson(res, 400, { success: false, message: 'Detail barang, lokasi penjemputan, dan lokasi tujuan wajib diisi.' });
      }

      // Validasi lokasi asal !== tujuan
      if (parseInt(id_lokasi_asal) === parseInt(id_lokasi_tujuan)) {
        return sendJson(res, 400, {
          success: false,
          message: 'Lokasi penjemputan tidak boleh sama dengan lokasi tujuan pengantaran.'
        });
      }

      // Validasi barang terlarang
      const descLower = deskripsi_barang.toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        if (descLower.includes(word)) {
          return sendJson(res, 400, {
            success: false,
            message: `Barang mengandung kategori terlarang (${word}). Dilarang mengirim uang tunai, barang berharga, makanan mudah basi, serta bahan berbahaya.`
          });
        }
      }

      const now = new Date().toISOString();
      const id_permintaan = db.nextId('permintaan');
      const kode_resi = db.nextResi();
      const otpCode = String(Math.floor(1000 + Math.random() * 9000)); // 4 digit OTP serah terima

      const permintaan = {
        id_permintaan,
        kode_resi,
        id_pemesan: user.id_pengguna,
        jenis: 'antar',
        deskripsi_barang: deskripsi_barang.trim(),
        nama_penerima: (nama_penerima || 'Penerima').trim(),
        foto_barang: foto_barang || '/uploads/default_box.png',
        id_lokasi_asal: parseInt(id_lokasi_asal),
        id_lokasi_tujuan: parseInt(id_lokasi_tujuan),
        status: 'Menunggu',
        estimasi_waktu: 15,
        waktu_dibuat: now
      };
      db.data.permintaan.push(permintaan);

      // Log status
      db.data.riwayat_status.push({
        id_riwayat: db.nextId('riwayat_status'),
        id_permintaan,
        status: 'Menunggu',
        waktu: now,
        id_pengubah: user.id_pengguna
      });

      // Transaksi biaya jasa (Rp5.000) dan honor kurir (Rp4.000)
      db.data.transaksi.push({
        id_transaksi: db.nextId('transaksi'),
        id_permintaan,
        biaya_jasa: 5000,
        honor_kurir: 4000,
        metode_pembayaran: metode_pembayaran || 'Tunai saat serah-terima',
        status_bayar: 'belum',
        waktu: now
      });

      // Simpan record serah terima untuk OTP penyerahan
      db.data.serah_terima.push({
        id_serah_terima: db.nextId('serah_terima'),
        id_permintaan,
        jenis: 'penjemputan',
        foto_bukti: null,
        kode_otp: otpCode,
        jumlah_percobaan_otp: 0,
        waktu: now
      });

      // Penugasan Kurir Otomatis (UC-04)
      // Cari kurir dengan status_verifikasi = 'disetujui' dan status_ketersediaan = 'tersedia'
      const availableCourier = db.data.kurir.find(k =>
        k.status_verifikasi === 'disetujui' && k.status_ketersediaan === 'tersedia'
      );

      let assignedCourier = null;
      if (availableCourier) {
        db.data.penugasan.push({
          id_penugasan: db.nextId('penugasan'),
          id_permintaan,
          id_kurir: availableCourier.id_kurir,
          metode: 'otomatis',
          waktu_ditugaskan: now
        });

        const kurirUser = db.data.pengguna.find(u => u.id_pengguna === availableCourier.id_pengguna);
        assignedCourier = kurirUser ? kurirUser.nama : 'Kurir Kampus';

        createNotification(availableCourier.id_pengguna, `Tugas pengantaran baru: ${kode_resi} (${permintaan.deskripsi_barang})`, id_permintaan);
        createNotification(user.id_pengguna, `Pesanan ${kode_resi} berhasil dibuat dan otomatis ditugaskan kepada kurir ${assignedCourier}.`, id_permintaan);
      } else {
        // Jika belum ada kurir tersedia, beritahu admin untuk penugasan manual
        notifyAdmins(`Pesanan antar baru ${kode_resi} memerlukan penugasan kurir manual.`, id_permintaan);
        createNotification(user.id_pengguna, `Pesanan ${kode_resi} berhasil dibuat dan sedang menunggu penugasan kurir.`, id_permintaan);
      }

      db.save();

      return sendJson(res, 201, {
        success: true,
        message: 'Pesanan antar barang berhasil dibuat!',
        kode_resi,
        id_permintaan,
        kode_otp: otpCode,
        assigned_courier: assignedCourier,
        estimasi_waktu: '10–15 menit',
        biaya: 5000
      });
    }

    // 11. GET /api/permintaan (Riwayat Transaksi Mahasiswa / Filter, UC-08)
    if (pathname === '/api/permintaan' && method === 'GET') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const jenisFilter = parsedUrl.query.jenis; // 'titip' | 'antar' | undefined

      let list = db.data.permintaan.filter(p => p.id_pemesan === user.id_pengguna);
      if (jenisFilter) {
        list = list.filter(p => p.jenis === jenisFilter);
      }

      // Enrich with locations, transaction, courier, review
      const results = list.map(p => {
        const asal = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_asal);
        const tujuan = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_tujuan);
        const trx = db.data.transaksi.find(t => t.id_permintaan === p.id_permintaan);
        const penugasan = db.data.penugasan.find(pn => pn.id_permintaan === p.id_permintaan);
        let kurirInfo = null;
        if (penugasan) {
          const kRecord = db.data.kurir.find(k => k.id_kurir === penugasan.id_kurir);
          if (kRecord) {
            const kUser = db.data.pengguna.find(u => u.id_pengguna === kRecord.id_pengguna);
            kurirInfo = {
              id_kurir: kRecord.id_kurir,
              nama: kUser ? kUser.nama : 'Kurir Mahasiswa',
              no_hp: kUser ? kUser.no_hp : '',
              rating_rata: kRecord.rating_rata
            };
          }
        }
        const ulasan = db.data.ulasan.find(u => u.id_permintaan === p.id_permintaan);

        return {
          ...p,
          lokasi_asal: asal ? asal.nama_lokasi : '-',
          lokasi_tujuan: tujuan ? tujuan.nama_lokasi : '-',
          transaksi: trx,
          kurir: kurirInfo,
          sudah_diulas: !!ulasan
        };
      }).sort((a, b) => new Date(b.waktu_dibuat) - new Date(a.waktu_dibuat));

      return sendJson(res, 200, { success: true, data: results });
    }

    // 12. GET /api/permintaan/:id (Lacak Status Barang, UC-05)
    const matchPermintaanDetail = pathname.match(/^\/api\/permintaan\/([0-9]+)$/);
    if (matchPermintaanDetail && method === 'GET') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const id = parseInt(matchPermintaanDetail[1]);
      const p = db.data.permintaan.find(item => item.id_permintaan === id);
      if (!p) return sendJson(res, 404, { success: false, message: 'Pesanan tidak ditemukan.' });

      // RBAC check: pemesan, ditugaskan ke kurir ini, atau admin
      const penugasan = db.data.penugasan.find(pn => pn.id_permintaan === p.id_permintaan);
      const isKurirAssigned = penugasan && db.data.kurir.some(k => k.id_kurir === penugasan.id_kurir && k.id_pengguna === user.id_pengguna);

      if (p.id_pemesan !== user.id_pengguna && !isKurirAssigned && user.peran !== 'administrator') {
        return sendJson(res, 403, { success: false, message: 'Akses ditolak.' });
      }

      const asal = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_asal);
      const tujuan = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_tujuan);
      const logs = db.data.riwayat_status
        .filter(r => r.id_permintaan === p.id_permintaan)
        .sort((a, b) => new Date(a.waktu) - new Date(b.waktu));
      const serahTerima = db.data.serah_terima.filter(s => s.id_permintaan === p.id_permintaan);
      const trx = db.data.transaksi.find(t => t.id_permintaan === p.id_permintaan);
      const ulasan = db.data.ulasan.find(u => u.id_permintaan === p.id_permintaan);

      let kurirInfo = null;
      if (penugasan) {
        const kRecord = db.data.kurir.find(k => k.id_kurir === penugasan.id_kurir);
        if (kRecord) {
          const kUser = db.data.pengguna.find(u => u.id_pengguna === kRecord.id_pengguna);
          kurirInfo = {
            id_kurir: kRecord.id_kurir,
            nama: kUser ? kUser.nama : 'Kurir Mahasiswa',
            no_hp: kUser ? kUser.no_hp : '',
            rating_rata: kRecord.rating_rata
          };
        }
      }

      // Ambil kode OTP aktif untuk pemesan
      const latestOtp = serahTerima.length > 0 ? serahTerima[serahTerima.length - 1].kode_otp : null;

      return sendJson(res, 200, {
        success: true,
        data: {
          ...p,
          lokasi_asal: asal ? asal.nama_lokasi : '-',
          lokasi_tujuan: tujuan ? tujuan.nama_lokasi : '-',
          kurir: kurirInfo,
          riwayat_status: logs,
          serah_terima: serahTerima,
          transaksi: trx,
          kode_otp: latestOtp,
          ulasan: ulasan || null
        }
      });
    }

    // 13. POST /api/permintaan/:id/status (Kurir Perbarui Status, UC-10)
    const matchStatusUpdate = pathname.match(/^\/api\/permintaan\/([0-9]+)\/status$/);
    if (matchStatusUpdate && method === 'POST') {
      const user = getAuthUser(req);
      if (!user || (user.peran !== 'kurir' && user.peran !== 'administrator')) {
        return sendJson(res, 403, { success: false, message: 'Hanya kurir atau administrator yang dapat memperbarui status pengantaran.' });
      }

      const id = parseInt(matchStatusUpdate[1]);
      const p = db.data.permintaan.find(item => item.id_permintaan === id);
      if (!p) return sendJson(res, 404, { success: false, message: 'Pesanan tidak ditemukan.' });

      const body = await parseBody(req);
      const { status } = body;

      const validFlow = ['Menunggu', 'Dijemput', 'Dalam Perjalanan', 'Terkirim'];
      if (!validFlow.includes(status)) {
        return sendJson(res, 400, { success: false, message: `Status '${status}' tidak valid.` });
      }

      p.status = status;
      const now = new Date().toISOString();

      db.data.riwayat_status.push({
        id_riwayat: db.nextId('riwayat_status'),
        id_permintaan: p.id_permintaan,
        status,
        waktu: now,
        id_pengubah: user.id_pengguna
      });

      if (status === 'Terkirim') {
        const trx = db.data.transaksi.find(t => t.id_permintaan === p.id_permintaan);
        if (trx) trx.status_bayar = 'lunas';
      }

      db.save();

      createNotification(p.id_pemesan, `Pesanan ${p.kode_resi} status diperbarui: ${status}.`, p.id_permintaan);

      return sendJson(res, 200, {
        success: true,
        message: `Status berhasil diubah menjadi ${status}.`,
        status: p.status
      });
    }

    // 14. POST /api/permintaan/:id/serah-terima (Verifikasi Serah-Terima Kurir, UC-07)
    const matchSerahTerima = pathname.match(/^\/api\/permintaan\/([0-9]+)\/serah-terima$/);
    if (matchSerahTerima && method === 'POST') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const id = parseInt(matchSerahTerima[1]);
      const p = db.data.permintaan.find(item => item.id_permintaan === id);
      if (!p) return sendJson(res, 404, { success: false, message: 'Pesanan tidak ditemukan.' });

      const body = await parseBody(req);
      const { kode_otp, foto_bukti, tahap } = body; // tahap: 'penjemputan' | 'pengambilan'

      if (!kode_otp) {
        return sendJson(res, 400, { success: false, message: 'Kode OTP serah-terima wajib diisi.' });
      }

      // Ambil record serah terima terkait (record terbaru)
      const stList = db.data.serah_terima.filter(s => s.id_permintaan === p.id_permintaan);
      const st = stList.length > 0 ? stList[stList.length - 1] : null;
      if (!st) {
        return sendJson(res, 400, { success: false, message: 'Data serah-terima tidak ditemukan.' });
      }

      // Cek batas percobaan OTP (max 5x)
      if (st.jumlah_percobaan_otp >= 5) {
        notifyAdmins(`PERINGATAN: Serah-terima ${p.kode_resi} ditahan karena salah input OTP melebihi 5 kali.`, p.id_permintaan);
        return sendJson(res, 403, {
          success: false,
          message: 'Percobaan OTP telah melebihi batas (5 kali). Serah-terima ditahan demi keamanan dan administrator telah diberi tahu.'
        });
      }

      // Cek OTP (perbandingan string bersih)
      if (String(st.kode_otp).trim() !== String(kode_otp).trim()) {
        st.jumlah_percobaan_otp += 1;
        db.save();
        const sisa = 5 - st.jumlah_percobaan_otp;
        return sendJson(res, 400, {
          success: false,
          message: `Kode OTP serah-terima salah. Sisa percobaan: ${sisa}`
        });
      }

      // OTP Benar! Perbarui foto bukti & status
      const now = new Date().toISOString();
      st.foto_bukti = foto_bukti || st.foto_bukti || '/uploads/sample_delivered.jpg';
      st.waktu = now;

      // Update alur status pesanan
      if (tahap === 'penjemputan' || p.status === 'Menunggu') {
        p.status = 'Dijemput';
      } else {
        p.status = 'Terkirim';
        const trx = db.data.transaksi.find(t => t.id_permintaan === p.id_permintaan);
        if (trx) trx.status_bayar = 'lunas';
      }

      db.data.riwayat_status.push({
        id_riwayat: db.nextId('riwayat_status'),
        id_permintaan: p.id_permintaan,
        status: p.status,
        waktu: now,
        id_pengubah: user.id_pengguna
      });

      db.save();

      createNotification(p.id_pemesan, `Verifikasi serah-terima berhasil! Pesanan ${p.kode_resi} kini berstatus ${p.status}.`, p.id_permintaan);

      return sendJson(res, 200, {
        success: true,
        message: 'Verifikasi serah-terima berhasil.',
        status: p.status
      });
    }

    // 15. POST /api/permintaan/:id/pickup-titip (Pengambilan di Drop Point)
    const matchPickupDropPoint = pathname.match(/^\/api\/permintaan\/([0-9]+)\/pickup-titip$/);
    if (matchPickupDropPoint && method === 'POST') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const id = parseInt(matchPickupDropPoint[1]);
      const p = db.data.permintaan.find(item => item.id_permintaan === id);
      if (!p || p.jenis !== 'titip') return sendJson(res, 404, { success: false, message: 'Pesanan titip tidak ditemukan.' });

      const body = await parseBody(req);
      const { kode_otp, foto_bukti } = body;

      const stList = db.data.serah_terima.filter(s => s.id_permintaan === p.id_permintaan);
      const st = stList.length > 0 ? stList[stList.length - 1] : null;
      if (!st || String(st.kode_otp).trim() !== String(kode_otp).trim()) {
        return sendJson(res, 400, { success: false, message: 'Kode OTP pengambilan loker salah.' });
      }

      const now = new Date().toISOString();
      p.status = 'Terkirim';

      // Kembalikan slot loker (+1)
      const loc = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_asal);
      if (loc && loc.slot_tersedia < loc.kapasitas_loker) {
        loc.slot_tersedia += 1;
      }

      db.data.riwayat_status.push({
        id_riwayat: db.nextId('riwayat_status'),
        id_permintaan: p.id_permintaan,
        status: 'Terkirim',
        waktu: now,
        id_pengubah: user.id_pengguna
      });

      db.data.serah_terima.push({
        id_serah_terima: db.nextId('serah_terima'),
        id_permintaan: p.id_permintaan,
        jenis: 'pengambilan',
        foto_bukti: foto_bukti || '/uploads/sample_delivered.jpg',
        kode_otp,
        jumlah_percobaan_otp: 0,
        waktu: now
      });

      db.save();

      createNotification(p.id_pemesan, `Barang titipan ${p.kode_resi} di ${loc ? loc.nama_lokasi : 'drop point'} telah berhasil diambil. Slot loker telah dikembalikan.`, p.id_permintaan);

      return sendJson(res, 200, {
        success: true,
        message: 'Pengambilan barang di drop point berhasil diselesaikan!',
        status: 'Terkirim',
        slot_tersedia: loc ? loc.slot_tersedia : null
      });
    }

    // 16. POST /api/permintaan/:id/ulasan (Beri Rating & Ulasan, UC-13)
    const matchUlasan = pathname.match(/^\/api\/permintaan\/([0-9]+)\/ulasan$/);
    if (matchUlasan && method === 'POST') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const id = parseInt(matchUlasan[1]);
      const p = db.data.permintaan.find(item => item.id_permintaan === id);
      if (!p) return sendJson(res, 404, { success: false, message: 'Pesanan tidak ditemukan.' });

      // Hanya boleh diulas jika Terkirim (BR-07)
      if (p.status !== 'Terkirim') {
        return sendJson(res, 400, { success: false, message: 'Ulasan hanya dapat diberikan jika barang sudah Terkirim.' });
      }

      // Cek apakah sudah pernah memberi ulasan
      const existing = db.data.ulasan.find(u => u.id_permintaan === p.id_permintaan);
      if (existing) {
        return sendJson(res, 400, { success: false, message: 'Anda sudah pernah memberikan ulasan untuk pesanan ini.' });
      }

      const body = await parseBody(req);
      const { rating, komentar } = body;

      const numRating = parseInt(rating);
      if (!numRating || numRating < 1 || numRating > 5) {
        return sendJson(res, 400, { success: false, message: 'Rating harus berupa angka 1 sampai 5.' });
      }

      const penugasan = db.data.penugasan.find(pn => pn.id_permintaan === p.id_permintaan);
      const kurirId = penugasan ? penugasan.id_kurir : null;

      const ulasan = {
        id_ulasan: db.nextId('ulasan'),
        id_permintaan: p.id_permintaan,
        id_kurir: kurirId,
        id_pemberi: user.id_pengguna,
        rating: numRating,
        komentar: (komentar || '').trim()
      };
      db.data.ulasan.push(ulasan);

      // Hitung ulang rating rata-rata kurir jika ada kurir
      if (kurirId) {
        const kRecord = db.data.kurir.find(k => k.id_kurir === kurirId);
        if (kRecord) {
          const allReviews = db.data.ulasan.filter(u => u.id_kurir === kurirId);
          const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
          kRecord.rating_rata = parseFloat((totalRating / allReviews.length).toFixed(2));

          const kUser = db.data.pengguna.find(u => u.id_pengguna === kRecord.id_pengguna);
          if (kUser) {
            createNotification(kUser.id_pengguna, `Anda menerima rating bintang ${numRating} untuk pesanan ${p.kode_resi}.`, p.id_permintaan);
          }
        }
      }

      db.save();

      return sendJson(res, 201, {
        success: true,
        message: 'Rating dan ulasan berhasil dikirim. Terima kasih!',
        ulasan
      });
    }

    // 17. POST /api/permintaan/:id/laporan (Lapor Kehilangan / Klaim, UC-11)
    const matchLaporan = pathname.match(/^\/api\/permintaan\/([0-9]+)\/laporan$/);
    if (matchLaporan && method === 'POST') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const id = parseInt(matchLaporan[1]);
      const p = db.data.permintaan.find(item => item.id_permintaan === id);
      if (!p) return sendJson(res, 404, { success: false, message: 'Pesanan tidak ditemukan.' });

      if (p.id_pemesan !== user.id_pengguna && user.peran !== 'administrator') {
        return sendJson(res, 403, { success: false, message: 'Anda hanya dapat melaporkan barang pesanan milik Anda sendiri.' });
      }

      const body = await parseBody(req);
      const { deskripsi, foto_bukti } = body;

      if (!deskripsi) {
        return sendJson(res, 400, { success: false, message: 'Kronologi kejadian wajib dicantumkan.' });
      }

      const now = new Date().toISOString();
      const laporan = {
        id_laporan: db.nextId('laporan_kehilangan'),
        id_permintaan: p.id_permintaan,
        id_pelapor: user.id_pengguna,
        deskripsi: deskripsi.trim(),
        foto_bukti: foto_bukti || null,
        status: 'diterima',
        tindak_lanjut: null,
        id_admin: null,
        waktu: now
      };
      db.data.laporan_kehilangan.push(laporan);

      notifyAdmins(`Laporan kehilangan baru diajukan oleh ${user.nama} untuk pesanan ${p.kode_resi}.`, p.id_permintaan);
      createNotification(user.id_pengguna, `Laporan kehilangan untuk pesanan ${p.kode_resi} telah diterima oleh administrator untuk ditindaklanjuti.`, p.id_permintaan);

      db.save();

      return sendJson(res, 201, {
        success: true,
        message: 'Laporan kehilangan berhasil dikirim dan akan segera ditinjau oleh administrator.',
        laporan
      });
    }

    // 18. GET /api/notifikasi (UC-06)
    if (pathname === '/api/notifikasi' && method === 'GET') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const notifs = db.data.notifikasi
        .filter(n => n.id_pengguna === user.id_pengguna)
        .sort((a, b) => new Date(b.waktu) - new Date(a.waktu));

      const unreadCount = notifs.filter(n => !n.sudah_dibaca).length;

      return sendJson(res, 200, {
        success: true,
        unread_count: unreadCount,
        data: notifs
      });
    }

    // 19. POST /api/notifikasi/:id/baca
    const matchNotifBaca = pathname.match(/^\/api\/notifikasi\/([0-9]+)\/baca$/);
    if (matchNotifBaca && method === 'POST') {
      const user = getAuthUser(req);
      if (!user) return sendJson(res, 401, { success: false, message: 'Harap login terlebih dahulu.' });

      const id = parseInt(matchNotifBaca[1]);
      const n = db.data.notifikasi.find(item => item.id_notifikasi === id && item.id_pengguna === user.id_pengguna);
      if (n) {
        n.sudah_dibaca = true;
        db.save();
      }
      return sendJson(res, 200, { success: true });
    }

    // 20. Kurir APIs: /api/kurir/tasks & availability & schedule (UC-08, UC-09)
    if (pathname === '/api/kurir/tasks' && method === 'GET') {
      const user = getAuthUser(req);
      if (!user || user.peran !== 'kurir') {
        return sendJson(res, 403, { success: false, message: 'Hanya kurir yang dapat mengakses tugas kurir.' });
      }

      const kurir = db.data.kurir.find(k => k.id_pengguna === user.id_pengguna);
      if (!kurir) return sendJson(res, 404, { success: false, message: 'Data kurir tidak ditemukan.' });

      // Ambil seluruh tugas kurir ini
      const assignments = db.data.penugasan.filter(pn => pn.id_kurir === kurir.id_kurir);
      const tasks = assignments.map(pn => {
        const p = db.data.permintaan.find(item => item.id_permintaan === pn.id_permintaan);
        if (!p) return null;
        const asal = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_asal);
        const tujuan = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_tujuan);
        const pemesan = db.data.pengguna.find(u => u.id_pengguna === p.id_pemesan);
        const trx = db.data.transaksi.find(t => t.id_permintaan === p.id_permintaan);
        const stList = db.data.serah_terima.filter(s => s.id_permintaan === p.id_permintaan);
        const st = stList.length > 0 ? stList[stList.length - 1] : null;

        return {
          ...p,
          lokasi_asal: asal ? asal.nama_lokasi : '-',
          lokasi_tujuan: tujuan ? tujuan.nama_lokasi : '-',
          nama_pemesan: pemesan ? pemesan.nama : '-',
          no_hp_pemesan: pemesan ? pemesan.no_hp : '-',
          nama_penerima: p.nama_penerima || 'Penerima',
          honor_kurir: trx ? trx.honor_kurir : 4000,
          metode_penugasan: pn.metode,
          waktu_ditugaskan: pn.waktu_ditugaskan,
          foto_bukti: st ? st.foto_bukti : null,
          kode_otp: st ? String(st.kode_otp).trim() : null
        };
      }).filter(Boolean).sort((a, b) => new Date(b.waktu_dibuat) - new Date(a.waktu_dibuat));

      // Hitung honor minggu ini
      const completedTasks = tasks.filter(t => t.status === 'Terkirim');
      const totalHonor = completedTasks.reduce((sum, t) => sum + (t.honor_kurir || 4000), 0);

      // Jadwal kurir
      const schedules = db.data.jadwal_kurir.filter(j => j.id_kurir === kurir.id_kurir);

      // Daftar tugas antar yang menunggu penugasan (bisa langsung diklaim kurir tanpa nunggu admin)
      const assignedIds = new Set(db.data.penugasan.map(pn => pn.id_permintaan));
      const unassignedOrders = db.data.permintaan
        .filter(p => p.jenis === 'antar' && p.status === 'Menunggu' && !assignedIds.has(p.id_permintaan))
        .map(p => {
          const asal = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_asal);
          const tujuan = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_tujuan);
          const pemesan = db.data.pengguna.find(u => u.id_pengguna === p.id_pemesan);
          return {
            ...p,
            lokasi_asal: asal ? asal.nama_lokasi : '-',
            lokasi_tujuan: tujuan ? tujuan.nama_lokasi : '-',
            nama_pemesan: pemesan ? pemesan.nama : '-',
            nama_penerima: p.nama_penerima || 'Penerima'
          };
        });

      // Daftar barang titipan mandiri di loker pos kampus yang sedang aktif
      const activeDeposits = db.data.permintaan
        .filter(p => p.jenis === 'titip' && p.status === 'Disimpan')
        .map(p => {
          const loc = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_asal);
          const pemesan = db.data.pengguna.find(u => u.id_pengguna === p.id_pemesan);
          const stList = db.data.serah_terima.filter(s => s.id_permintaan === p.id_permintaan);
          const st = stList.length > 0 ? stList[stList.length - 1] : null;
          return {
            ...p,
            pos_lokasi: loc ? loc.nama_lokasi : '-',
            nama_penitip: pemesan ? pemesan.nama : '-',
            nama_penerima: p.nama_penerima || (pemesan ? pemesan.nama : 'Penerima'),
            kode_otp: st ? String(st.kode_otp).trim() : null
          };
        });

      return sendJson(res, 200, {
        success: true,
        kurir: {
          id_kurir: kurir.id_kurir,
          status_ketersediaan: kurir.status_ketersediaan,
          rating_rata: kurir.rating_rata,
          total_honor: totalHonor,
          tugas_selesai: completedTasks.length
        },
        jadwal: schedules,
        tasks,
        unassigned_orders: unassignedOrders,
        active_deposits: activeDeposits
      });
    }

    // POST /api/kurir/verify-titip-mandiri (Kurir verifikasi pengambilan titip mandiri langsung via OTP)
    if (pathname === '/api/kurir/verify-titip-mandiri' && method === 'POST') {
      const user = getAuthUser(req);
      if (!user || user.peran !== 'kurir') {
        return sendJson(res, 403, { success: false, message: 'Hanya kurir yang dapat memverifikasi titip mandiri.' });
      }

      const body = await parseBody(req);
      const { kode_resi, kode_otp, foto_bukti } = body;

      if (!kode_resi || !kode_otp) {
        return sendJson(res, 400, { success: false, message: 'Nomor resi dan kode OTP wajib diisi.' });
      }

      const p = db.data.permintaan.find(item => item.kode_resi.toUpperCase() === kode_resi.trim().toUpperCase() && item.jenis === 'titip');
      if (!p) {
        return sendJson(res, 404, { success: false, message: `Barang titipan dengan resi ${kode_resi} tidak ditemukan.` });
      }

      if (p.status === 'Terkirim') {
        return sendJson(res, 400, { success: false, message: `Barang titipan ${kode_resi} sudah selesai diambil sebelumnya.` });
      }

      const stList = db.data.serah_terima.filter(s => s.id_permintaan === p.id_permintaan);
      const st = stList.length > 0 ? stList[stList.length - 1] : null;
      if (!st || String(st.kode_otp).trim() !== String(kode_otp).trim()) {
        if (st) st.jumlah_percobaan_otp = (st.jumlah_percobaan_otp || 0) + 1;
        db.save();
        return sendJson(res, 400, { success: false, message: 'Kode OTP pengambilan salah. Minta kode OTP yang valid dari penitip/penerima.' });
      }

      const now = new Date().toISOString();
      p.status = 'Terkirim';

      // Kembalikan slot loker di pos (+1)
      const loc = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_asal);
      if (loc && loc.slot_tersedia < loc.kapasitas_loker) {
        loc.slot_tersedia += 1;
      }

      db.data.riwayat_status.push({
        id_riwayat: db.nextId('riwayat_status'),
        id_permintaan: p.id_permintaan,
        status: 'Terkirim',
        waktu: now,
        id_pengubah: user.id_pengguna
      });

      st.foto_bukti = foto_bukti || st.foto_bukti || '/uploads/sample_delivered.jpg';
      st.waktu = now;

      db.save();

      createNotification(p.id_pemesan, `Barang titipan ${p.kode_resi} di ${loc ? loc.nama_lokasi : 'Pos Drop Point'} telah selesai diambil dan diverifikasi kurir ${user.nama}. Slot loker kembali tersedia.`, p.id_permintaan);

      return sendJson(res, 200, {
        success: true,
        message: `Verifikasi serah-terima titip mandiri ${p.kode_resi} berhasil diselesaikan oleh kurir!`,
        kode_resi: p.kode_resi,
        status: 'Terkirim',
        pos: loc ? loc.nama_lokasi : 'Drop Point'
      });
    }

    // POST /api/kurir/task/:id/claim (Kurir mengambil tugas antar secara mandiri tanpa tunggu admin)
    const matchClaimTask = pathname.match(/^\/api\/kurir\/task\/([0-9]+)\/claim$/);
    if (matchClaimTask && method === 'POST') {
      const user = getAuthUser(req);
      if (!user || user.peran !== 'kurir') {
        return sendJson(res, 403, { success: false, message: 'Hanya kurir yang dapat mengambil tugas.' });
      }
      const kurir = db.data.kurir.find(k => k.id_pengguna === user.id_pengguna);
      if (!kurir || kurir.status_verifikasi !== 'disetujui') {
        return sendJson(res, 403, { success: false, message: 'Kurir belum aktif atau belum diverifikasi.' });
      }

      const id = parseInt(matchClaimTask[1]);
      const p = db.data.permintaan.find(item => item.id_permintaan === id && item.jenis === 'antar');
      if (!p) return sendJson(res, 404, { success: false, message: 'Pesanan tidak ditemukan.' });

      let penugasan = db.data.penugasan.find(pn => pn.id_permintaan === p.id_permintaan);
      const now = new Date().toISOString();
      if (penugasan) {
        penugasan.id_kurir = kurir.id_kurir;
        penugasan.metode = 'otomatis';
        penugasan.waktu_ditugaskan = now;
      } else {
        db.data.penugasan.push({
          id_penugasan: db.nextId('penugasan'),
          id_permintaan: p.id_permintaan,
          id_kurir: kurir.id_kurir,
          metode: 'otomatis',
          waktu_ditugaskan: now
        });
      }

      db.save();
      createNotification(p.id_pemesan, `Pesanan ${p.kode_resi} telah diambil oleh kurir ${user.nama} dan siap diantar.`, p.id_permintaan);

      return sendJson(res, 200, {
        success: true,
        message: `Tugas ${p.kode_resi} berhasil Anda ambil!`,
        data: p
      });
    }

    if (pathname === '/api/kurir/availability' && method === 'POST') {
      const user = getAuthUser(req);
      if (!user || user.peran !== 'kurir') {
        return sendJson(res, 403, { success: false, message: 'Hanya kurir yang dapat mengatur ketersediaan.' });
      }
      const kurir = db.data.kurir.find(k => k.id_pengguna === user.id_pengguna);
      if (!kurir) return sendJson(res, 404, { success: false, message: 'Data kurir tidak ditemukan.' });

      const body = await parseBody(req);
      const { status_ketersediaan } = body;
      if (!['tersedia', 'bertugas', 'tidak_tersedia'].includes(status_ketersediaan)) {
        return sendJson(res, 400, { success: false, message: 'Status ketersediaan tidak valid.' });
      }

      kurir.status_ketersediaan = status_ketersediaan;
      db.save();

      return sendJson(res, 200, {
        success: true,
        message: `Ketersediaan diubah menjadi: ${status_ketersediaan}`,
        status_ketersediaan
      });
    }

    if (pathname === '/api/kurir/schedule' && method === 'POST') {
      const user = getAuthUser(req);
      if (!user || user.peran !== 'kurir') {
        return sendJson(res, 403, { success: false, message: 'Hanya kurir yang dapat mengelola jadwal.' });
      }
      const kurir = db.data.kurir.find(k => k.id_pengguna === user.id_pengguna);
      if (!kurir) return sendJson(res, 404, { success: false, message: 'Data kurir tidak ditemukan.' });

      const body = await parseBody(req);
      const { jadwal } = body;

      if (!jadwal || !Array.isArray(jadwal) || jadwal.length === 0) {
        return sendJson(res, 400, { success: false, message: 'Jadwal tidak boleh kosong.' });
      }

      // Validasi bentrok
      const daySlots = {};
      for (const shift of jadwal) {
        if (!shift.hari || !shift.jam_mulai || !shift.jam_selesai) {
          return sendJson(res, 400, { success: false, message: 'Format jadwal tidak lengkap.' });
        }
        if (shift.jam_mulai >= shift.jam_selesai) {
          return sendJson(res, 400, { success: false, message: `Jam mulai (${shift.jam_mulai}) harus lebih awal dari jam selesai (${shift.jam_selesai}).` });
        }
        if (!daySlots[shift.hari]) daySlots[shift.hari] = [];
        for (const existing of daySlots[shift.hari]) {
          if (shift.jam_mulai < existing.jam_selesai && shift.jam_selesai > existing.jam_mulai) {
            return sendJson(res, 400, {
              success: false,
              message: `Jadwal bentrok pada hari ${shift.hari}: ${shift.jam_mulai}–${shift.jam_selesai} dengan ${existing.jam_mulai}–${existing.jam_selesai}`
            });
          }
        }
        daySlots[shift.hari].push(shift);
      }

      // Hapus jadwal lama & simpan jadwal baru
      db.data.jadwal_kurir = db.data.jadwal_kurir.filter(j => j.id_kurir !== kurir.id_kurir);
      jadwal.forEach(shift => {
        db.data.jadwal_kurir.push({
          id_jadwal: db.nextId('jadwal_kurir'),
          id_kurir: kurir.id_kurir,
          hari: shift.hari,
          jam_mulai: shift.jam_mulai,
          jam_selesai: shift.jam_selesai
        });
      });
      db.save();

      return sendJson(res, 200, {
        success: true,
        message: 'Jadwal shift kurir berhasil diperbarui!',
        jadwal: db.data.jadwal_kurir.filter(j => j.id_kurir === kurir.id_kurir)
      });
    }

    // 21. ADMINISTRATOR ENDPOINTS (UC-12, UC-14, UC-15, UC-04)
    if (pathname.startsWith('/api/admin/')) {
      const user = getAuthUser(req);
      if (!user || user.peran !== 'administrator') {
        return sendJson(res, 403, { success: false, message: 'Akses ditolak. Endpoint ini hanya untuk Administrator.' });
      }

      // A. GET /api/admin/dashboard (UC-14)
      if (pathname === '/api/admin/dashboard' && method === 'GET') {
        const totalTransaksi = db.data.permintaan.length;
        const kurirOnDuty = db.data.kurir.filter(k => k.status_verifikasi === 'disetujui' && k.status_ketersediaan === 'tersedia').length;

        // Utilisasi Loker
        const dropPoints = db.data.lokasi.filter(l => l.jenis === 'drop_point');
        const totalKapasitas = dropPoints.reduce((sum, l) => sum + (l.kapasitas_loker || 0), 0);
        const totalSlotTersedia = dropPoints.reduce((sum, l) => sum + (l.slot_tersedia || 0), 0);
        const slotTerpakai = totalKapasitas - totalSlotTersedia;
        const utilisasiLokerPersen = totalKapasitas > 0 ? Math.round((slotTerpakai / totalKapasitas) * 100) : 0;

        // Laporan Tertunda
        const laporanTertunda = db.data.laporan_kehilangan.filter(l => l.status === 'diterima' || l.status === 'diproses').length;

        // Semua pesanan beserta rute dan status
        const orders = db.data.permintaan.map(p => {
          const asal = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_asal);
          const tujuan = db.data.lokasi.find(l => l.id_lokasi === p.id_lokasi_tujuan);
          const pemohon = db.data.pengguna.find(u => u.id_pengguna === p.id_pemesan);
          const penugasan = db.data.penugasan.find(pn => pn.id_permintaan === p.id_permintaan);
          let kurirNama = null;
          if (penugasan) {
            const kRecord = db.data.kurir.find(k => k.id_kurir === penugasan.id_kurir);
            if (kRecord) {
              const kUser = db.data.pengguna.find(u => u.id_pengguna === kRecord.id_pengguna);
              kurirNama = kUser ? kUser.nama : null;
            }
          }

          return {
            ...p,
            pemohon_nama: pemohon ? pemohon.nama : '-',
            rute: p.jenis === 'titip' ? (asal ? asal.nama_lokasi : 'Drop Point') : `${asal ? asal.nama_lokasi : '-'} → ${tujuan ? tujuan.nama_lokasi : '-'}`,
            kurir_nama: kurirNama
          };
        }).sort((a, b) => new Date(b.waktu_dibuat) - new Date(a.waktu_dibuat));

        return sendJson(res, 200, {
          success: true,
          stats: {
            total_transaksi: totalTransaksi,
            kurir_on_duty: kurirOnDuty,
            utilisasi_loker: `${utilisasiLokerPersen}%`,
            utilisasi_loker_angka: utilisasiLokerPersen,
            slot_terpakai: slotTerpakai,
            total_kapasitas: totalKapasitas,
            laporan_tertunda: laporanTertunda
          },
          orders
        });
      }

      // B. GET /api/admin/couriers (UC-15)
      if (pathname === '/api/admin/couriers' && method === 'GET') {
        const couriers = db.data.kurir.map(k => {
          const u = db.data.pengguna.find(user => user.id_pengguna === k.id_pengguna);
          const schedules = db.data.jadwal_kurir.filter(j => j.id_kurir === k.id_kurir);
          const completedCount = db.data.penugasan.filter(pn => {
            if (pn.id_kurir !== k.id_kurir) return false;
            const reqItem = db.data.permintaan.find(p => p.id_permintaan === pn.id_permintaan);
            return reqItem && reqItem.status === 'Terkirim';
          }).length;

          return {
            ...k,
            pengguna: u ? {
              nama: u.nama,
              email_kampus: u.email_kampus,
              no_hp: u.no_hp,
              status_akun: u.status_akun
            } : null,
            jadwal: schedules,
            tugas_selesai: completedCount
          };
        }).sort((a, b) => new Date(b.waktu_pengajuan) - new Date(a.waktu_pengajuan));

        return sendJson(res, 200, { success: true, data: couriers });
      }

      // C. POST /api/admin/courier/:id/verify (UC-15)
      const matchCourierVerify = pathname.match(/^\/api\/admin\/courier\/([0-9]+)\/verify$/);
      if (matchCourierVerify && method === 'POST') {
        const kurirId = parseInt(matchCourierVerify[1]);
        const kurir = db.data.kurir.find(k => k.id_kurir === kurirId);
        if (!kurir) return sendJson(res, 404, { success: false, message: 'Data kurir tidak ditemukan.' });

        const body = await parseBody(req);
        const { tindakan, alasan } = body; // tindakan: 'setujui' | 'tolak'

        const u = db.data.pengguna.find(user => user.id_pengguna === kurir.id_pengguna);

        if (tindakan === 'setujui') {
          kurir.status_verifikasi = 'disetujui';
          kurir.alasan_penolakan = null;
          if (u) {
            u.peran = 'kurir';
            createNotification(u.id_pengguna, 'Selamat! Pengajuan Anda sebagai Kurir Mahasiswa SiTAB telah disetujui oleh Administrator. Anda sekarang dapat menerima tugas pengantaran.');
          }
          db.save();
          return sendJson(res, 200, { success: true, message: 'Kurir berhasil diverifikasi dan disetujui.' });
        } else if (tindakan === 'tolak') {
          if (!alasan) {
            return sendJson(res, 400, { success: false, message: 'Alasan penolakan wajib dicantumkan.' });
          }
          kurir.status_verifikasi = 'ditolak';
          kurir.alasan_penolakan = alasan.trim();
          if (u) {
            u.peran = 'mahasiswa'; // Tetap sebagai mahasiswa
            createNotification(u.id_pengguna, `Mohon maaf, pengajuan kurir Anda ditolak dengan alasan: ${alasan.trim()}. Anda dapat mengajukan kembali.`);
          }
          db.save();
          return sendJson(res, 200, { success: true, message: 'Pengajuan kurir telah ditolak.', alasan });
        } else {
          return sendJson(res, 400, { success: false, message: 'Tindakan tidak valid (pilih setujui atau tolak).' });
        }
      }

      // C2. POST /api/admin/courier/:id/toggle-status (Admin aktif / nonaktifkan status kerja kurir)
      const matchToggleCourier = pathname.match(/^\/api\/admin\/courier\/([0-9]+)\/toggle-status$/);
      if (matchToggleCourier && method === 'POST') {
        const kurirId = parseInt(matchToggleCourier[1]);
        const kurir = db.data.kurir.find(k => k.id_kurir === kurirId);
        if (!kurir) return sendJson(res, 404, { success: false, message: 'Data kurir tidak ditemukan.' });

        const u = db.data.pengguna.find(user => user.id_pengguna === kurir.id_pengguna);
        const newStatus = kurir.status_ketersediaan === 'tersedia' ? 'tidak_tersedia' : 'tersedia';
        kurir.status_ketersediaan = newStatus;

        if (u) {
          createNotification(u.id_pengguna, `Status keaktifan kurir Anda telah diubah oleh administrator menjadi: ${newStatus === 'tersedia' ? 'AKTIF (Tersedia bekerja)' : 'NONAKTIF'}.`);
        }

        db.save();

        return sendJson(res, 200, {
          success: true,
          message: `Status kurir ${u ? u.nama : ''} berhasil diubah menjadi: ${newStatus === 'tersedia' ? 'Aktif (Tersedia)' : 'Nonaktif'}`,
          status_ketersediaan: newStatus
        });
      }

      // D. POST /api/admin/assign-courier (Penugasan Manual, UC-04)
      if (pathname === '/api/admin/assign-courier' && method === 'POST') {
        const body = await parseBody(req);
        const { id_permintaan, id_kurir } = body;

        const p = db.data.permintaan.find(item => item.id_permintaan === parseInt(id_permintaan));
        if (!p) return sendJson(res, 404, { success: false, message: 'Pesanan tidak ditemukan.' });

        const kRecord = db.data.kurir.find(k => k.id_kurir === parseInt(id_kurir));
        if (!kRecord || kRecord.status_verifikasi !== 'disetujui') {
          return sendJson(res, 400, { success: false, message: 'Kurir tidak valid atau belum terverifikasi.' });
        }

        // Cek penugasan yang sudah ada
        let penugasan = db.data.penugasan.find(pn => pn.id_permintaan === p.id_permintaan);
        const now = new Date().toISOString();
        if (penugasan) {
          penugasan.id_kurir = kRecord.id_kurir;
          penugasan.metode = 'manual';
          penugasan.waktu_ditugaskan = now;
        } else {
          db.data.penugasan.push({
            id_penugasan: db.nextId('penugasan'),
            id_permintaan: p.id_permintaan,
            id_kurir: kRecord.id_kurir,
            metode: 'manual',
            waktu_ditugaskan: now
          });
        }

        const kUser = db.data.pengguna.find(u => u.id_pengguna === kRecord.id_pengguna);
        createNotification(kRecord.id_pengguna, `Administrator menugaskan pesanan ${p.kode_resi} kepada Anda.`, p.id_permintaan);
        createNotification(p.id_pemesan, `Pesanan ${p.kode_resi} ditugaskan kepada kurir ${kUser ? kUser.nama : 'Kurir Kampus'}.`, p.id_permintaan);

        db.save();

        return sendJson(res, 200, {
          success: true,
          message: `Pesanan ${p.kode_resi} berhasil ditugaskan kepada ${kUser ? kUser.nama : 'kurir'}.`
        });
      }

      // E. GET /api/admin/reports & POST update report (UC-12)
      if (pathname === '/api/admin/reports' && method === 'GET') {
        const reports = db.data.laporan_kehilangan.map(l => {
          const p = db.data.permintaan.find(item => item.id_permintaan === l.id_permintaan);
          const pelapor = db.data.pengguna.find(u => u.id_pengguna === l.id_pelapor);
          const logs = p ? db.data.riwayat_status.filter(r => r.id_permintaan === p.id_permintaan) : [];
          const serahTerima = p ? db.data.serah_terima.filter(s => s.id_permintaan === p.id_permintaan) : [];
          const penugasan = p ? db.data.penugasan.find(pn => pn.id_permintaan === p.id_permintaan) : null;
          let kurirNama = null;
          if (penugasan) {
            const kRecord = db.data.kurir.find(k => k.id_kurir === penugasan.id_kurir);
            if (kRecord) {
              const kUser = db.data.pengguna.find(u => u.id_pengguna === kRecord.id_pengguna);
              kurirNama = kUser ? kUser.nama : null;
            }
          }

          return {
            ...l,
            kode_resi: p ? p.kode_resi : '-',
            deskripsi_barang: p ? p.deskripsi_barang : '-',
            foto_barang_awal: p ? p.foto_barang : null,
            pelapor_nama: pelapor ? pelapor.nama : '-',
            pelapor_email: pelapor ? pelapor.email_kampus : '-',
            kurir_nama: kurirNama,
            riwayat_status: logs,
            bukti_serah_terima: serahTerima
          };
        }).sort((a, b) => new Date(b.waktu) - new Date(a.waktu));

        return sendJson(res, 200, { success: true, data: reports });
      }

      const matchReportUpdate = pathname.match(/^\/api\/admin\/report\/([0-9]+)\/update$/);
      if (matchReportUpdate && method === 'POST') {
        const repId = parseInt(matchReportUpdate[1]);
        const rep = db.data.laporan_kehilangan.find(l => l.id_laporan === repId);
        if (!rep) return sendJson(res, 404, { success: false, message: 'Laporan tidak ditemukan.' });

        const body = await parseBody(req);
        const { status, tindak_lanjut } = body;

        if (!['diproses', 'selesai'].includes(status)) {
          return sendJson(res, 400, { success: false, message: "Status laporan hanya boleh 'diproses' atau 'selesai'." });
        }

        rep.status = status;
        if (tindak_lanjut) rep.tindak_lanjut = tindak_lanjut.trim();
        rep.id_admin = user.id_pengguna;

        createNotification(rep.id_pelapor, `Pembaruan Laporan Kehilangan: Status laporan diubah menjadi '${status}'. Catatan admin: ${rep.tindak_lanjut || '-'}`, rep.id_permintaan);

        db.save();

        return sendJson(res, 200, {
          success: true,
          message: 'Status dan tindak lanjut laporan berhasil diperbarui.',
          data: rep
        });
      }

      // F. GET /api/admin/users
      if (pathname === '/api/admin/users' && method === 'GET') {
        const users = db.data.pengguna.map(u => ({
          id_pengguna: u.id_pengguna,
          nama: u.nama,
          email_kampus: u.email_kampus,
          no_hp: u.no_hp,
          peran: u.peran,
          status_akun: u.status_akun,
          waktu_daftar: u.waktu_daftar
        })).sort((a, b) => b.id_pengguna - a.id_pengguna);

        return sendJson(res, 200, { success: true, data: users });
      }

      // G. POST /api/admin/user/:id/toggle-status
      const matchToggleUser = pathname.match(/^\/api\/admin\/user\/([0-9]+)\/toggle-status$/);
      if (matchToggleUser && method === 'POST') {
        const uId = parseInt(matchToggleUser[1]);
        const target = db.data.pengguna.find(u => u.id_pengguna === uId);
        if (!target) return sendJson(res, 404, { success: false, message: 'Pengguna tidak ditemukan.' });

        if (target.id_pengguna === user.id_pengguna) {
          return sendJson(res, 400, { success: false, message: 'Tidak dapat menonaktifkan akun sendiri.' });
        }

        target.status_akun = target.status_akun === 'aktif' ? 'nonaktif' : 'aktif';
        db.save();

        return sendJson(res, 200, {
          success: true,
          message: `Status akun ${target.nama} berhasil diubah menjadi: ${target.status_akun}`,
          status_akun: target.status_akun
        });
      }
    }

    // 22. POST /api/upload (Upload gambar Base64)
    if (pathname === '/api/upload' && method === 'POST') {
      const body = await parseBody(req);
      const { image_base64, filename } = body;

      if (!image_base64) {
        return sendJson(res, 400, { success: false, message: 'Berkas gambar wajib disertakan.' });
      }

      const matches = image_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer = null;
      let ext = '.jpg';

      if (matches && matches.length === 3) {
        const mime = matches[1];
        if (mime === 'image/png') ext = '.png';
        if (mime === 'image/jpeg') ext = '.jpg';
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(image_base64, 'base64');
      }

      const fname = `upload_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
      const fpath = path.join(UPLOADS_DIR, fname);
      fs.writeFileSync(fpath, buffer);

      return sendJson(res, 200, {
        success: true,
        file_url: `/uploads/${fname}`
      });
    }

    // -------------------------------------------------------------
    // STATIC FILE SERVING
    // -------------------------------------------------------------
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // If request has no extension and matches a known html view
    if (!path.extname(filePath)) {
      if (fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      }
    }

    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html if requested route looks like an app page
        if (!pathname.startsWith('/api/') && !pathname.startsWith('/uploads/')) {
          const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
          if (fs.existsSync(fallbackPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return fs.createReadStream(fallbackPath).pipe(res);
          }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });

  } catch (error) {
    console.error('Server error:', error);
    sendJson(res, 500, { success: false, message: 'Terjadi kesalahan pada server: ' + error.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` SiTAB (Sistem Titip Antar Barang Kampus UNKLAB)   `);
    console.log(` Server berjalan di http://localhost:${PORT}        `);
    console.log(`====================================================`);
  });
}

module.exports = { server, sessions };
