const { EventEmitter } = require('events');
const { server } = require('./server');
const { db, hashPassword } = require('./db');

function dispatch(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = options.method || 'GET';
    req.url = options.path || '/';
    req.headers = {};
    if (options.headers) {
      for (const k of Object.keys(options.headers)) {
        req.headers[k.toLowerCase()] = options.headers[k];
      }
    }

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    let responseBody = '';

    res.writeHead = function(statusCode, headers = {}) {
      res.statusCode = statusCode;
      Object.assign(res.headers, headers);
      return res;
    };

    res.setHeader = function(key, val) {
      res.headers[key.toLowerCase()] = val;
    };

    res.getHeader = function(key) {
      return res.headers[key.toLowerCase()];
    };

    res.write = function(chunk) {
      if (chunk) responseBody += chunk;
      return true;
    };

    res.end = function(chunk) {
      if (chunk) responseBody += chunk;
      let json = null;
      try {
        json = JSON.parse(responseBody);
      } catch {
        json = responseBody;
      }
      resolve({ status: res.statusCode, headers: res.headers, body: json });
    };

    // Trigger the request handler on the server
    server.emit('request', req, res);

    // Push request data chunks
    if (data) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      req.emit('data', Buffer.from(payload));
    }
    req.emit('end');
  });
}

async function runTests() {
  console.log('========================================================================');
  console.log(' MEMULAI PENGUJIAN OTOMATIS SiTAB (TC-01 s.d. TC-41)');
  console.log('========================================================================\n');

  // Reset database
  db.reset();

  let passedCount = 0;
  let failedCount = 0;

  function assert(tcId, condition, description, details = '') {
    if (condition) {
      console.log(`[PASS] ${tcId.padEnd(6)} : ${description}`);
      passedCount++;
      return true;
    } else {
      console.error(`[FAIL] ${tcId.padEnd(6)} : ${description}`);
      if (details) console.error(`       Detail: ${JSON.stringify(details)}`);
      failedCount++;
      return false;
    }
  }

  // Helper login
  async function login(email, password) {
    return await dispatch({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email_kampus: email, password });
  }

  try {
    // TC-01: Login mahasiswa dengan email kampus dan password yang benar
    const resTC01 = await login('12410601@student.unklab.ac.id', 'password123');
    assert('TC-01',
      resTC01.status === 200 && resTC01.body.user.nama === 'Michelle Lumentut' && resTC01.body.redirectUrl === '/dashboard-mahasiswa.html',
      'Login mahasiswa dengan email kampus dan password yang benar mengarahkan ke Dashboard Mahasiswa',
      resTC01.body
    );
    const mhsToken = resTC01.body.token;

    // TC-02: Login dengan password salah
    const resTC02 = await login('12410601@student.unklab.ac.id', 'passwordsalah123');
    assert('TC-02',
      resTC02.status === 401 && resTC02.body.message.includes('Email atau password salah'),
      'Login dengan password salah menampilkan pesan kesalahan yang aman',
      resTC02.body
    );

    // TC-03: Ajukan penitipan dengan data lengkap
    const resTC03 = await dispatch({
      path: '/api/permintaan/titip',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mhsToken}`
      }
    }, {
      deskripsi_barang: 'Buku Pemrograman Web Lanjut',
      id_lokasi_asal: 1, // GK1
      nama_penerima: 'Andrew Sahala',
      foto_barang: '/uploads/sample_book.jpg'
    });
    assert('TC-03',
      resTC03.status === 201 && resTC03.body.success && resTC03.body.kode_resi.startsWith('STB-'),
      'Ajukan penitipan dengan data lengkap berhasil menyimpan permintaan',
      resTC03.body
    );

    // TC-04: Ajukan penitipan tanpa foto barang
    const resTC04 = await dispatch({
      path: '/api/permintaan/titip',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mhsToken}`
      }
    }, {
      deskripsi_barang: 'Buku Tanpa Foto',
      id_lokasi_asal: 1,
      nama_penerima: 'Andrew Sahala',
      foto_barang: ''
    });
    assert('TC-04',
      resTC04.status === 400 && resTC04.body.message.includes('Foto barang wajib diunggah'),
      'Ajukan penitipan tanpa foto barang ditolak sistem',
      resTC04.body
    );

    // TC-05: Pesan antar dengan data valid
    const resTC05 = await dispatch({
      path: '/api/permintaan/antar',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mhsToken}`
      }
    }, {
      deskripsi_barang: 'Modul Praktikum Jaringan Komputer',
      id_lokasi_asal: 1, // GK1
      id_lokasi_tujuan: 3, // Asrama Crystal
      nama_penerima: 'Andrew Sahala',
      foto_barang: '/uploads/sample_book.jpg'
    });
    assert('TC-05',
      resTC05.status === 201 && resTC05.body.biaya === 5000 && resTC05.body.kode_resi.startsWith('STB-'),
      'Pesan antar dengan data valid menampilkan estimasi waktu dan biaya serta tersimpan',
      resTC05.body
    );
    const newAntarId = resTC05.body.id_permintaan;
    const newAntarOtp = resTC05.body.kode_otp;

    // TC-06: Pesan antar dengan lokasi jemput sama dengan tujuan
    const resTC06 = await dispatch({
      path: '/api/permintaan/antar',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mhsToken}`
      }
    }, {
      deskripsi_barang: 'Flashdisk Sandisk 64GB',
      id_lokasi_asal: 2,
      id_lokasi_tujuan: 2,
      nama_penerima: 'Andrew Sahala'
    });
    assert('TC-06',
      resTC06.status === 400 && resTC06.body.message.includes('tidak boleh sama'),
      'Pesan antar dengan lokasi jemput sama dengan tujuan ditolak',
      resTC06.body
    );

    // TC-07: Penugasan otomatis ke kurir tersedia
    assert('TC-07',
      resTC05.body.assigned_courier && resTC05.body.assigned_courier.includes('Sanjaya'),
      'Penugasan otomatis berhasil menugaskan kurir aktif yang tersedia',
      resTC05.body
    );

    // Login kurir aktif
    const resKurirLogin = await login('S2410602@student.unklab.ac.id', 'password123');
    const kurirToken = resKurirLogin.body.token;

    // TC-08: Pembaruan status oleh kurir terlihat oleh mahasiswa
    const resTC08 = await dispatch({
      path: `/api/permintaan/${newAntarId}/status`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kurirToken}`
      }
    }, { status: 'Dijemput' });

    const resCheckMhs = await dispatch({
      path: `/api/permintaan/${newAntarId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${mhsToken}` }
    });
    assert('TC-08',
      resTC08.status === 200 && resCheckMhs.body.data.status === 'Dijemput',
      'Pembaruan status oleh kurir ke "Dijemput" langsung terlihat pada pelacakan mahasiswa',
      resCheckMhs.body
    );

    // TC-09: Notifikasi saat status berubah
    const resTC09 = await dispatch({
      path: '/api/notifikasi',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${mhsToken}` }
    });
    const hasStatusNotif = resTC09.body.data.some(n => n.id_permintaan === newAntarId);
    assert('TC-09',
      resTC09.status === 200 && hasStatusNotif,
      'Sistem otomatis membuat notifikasi saat terjadi perubahan status pesanan',
      resTC09.body
    );

    // TC-10: Verifikasi serah-terima dengan kode benar
    const resTC10 = await dispatch({
      path: `/api/permintaan/${newAntarId}/serah-terima`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kurirToken}`
      }
    }, {
      kode_otp: newAntarOtp,
      foto_bukti: '/uploads/sample_delivered.jpg',
      tahap: 'pengambilan'
    });
    assert('TC-10',
      resTC10.status === 200 && resTC10.body.status === 'Terkirim',
      'Verifikasi serah-terima dengan kode OTP benar berhasil mengubah status menjadi Terkirim',
      resTC10.body
    );

    // TC-11: Verifikasi serah-terima dengan kode salah
    const resTC11 = await dispatch({
      path: `/api/permintaan/1/serah-terima`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kurirToken}`
      }
    }, {
      kode_otp: '0000',
      foto_bukti: '/uploads/sample_delivered.jpg',
      tahap: 'pengambilan'
    });
    assert('TC-11',
      resTC11.status === 400 && resTC11.body.message.includes('Kode OTP serah-terima salah'),
      'Verifikasi serah-terima dengan kode OTP salah ditolak dengan pesan kesalahan',
      resTC11.body
    );

    // TC-12: Melihat riwayat transaksi
    const resTC12 = await dispatch({
      path: '/api/permintaan',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${mhsToken}` }
    });
    assert('TC-12',
      resTC12.status === 200 && Array.isArray(resTC12.body.data) && resTC12.body.data.length >= 3,
      'Melihat riwayat transaksi menampilkan daftar pesanan milik pengguna',
      { count: resTC12.body.data ? resTC12.body.data.length : 0 }
    );

    // TC-13: Mengubah jadwal kurir
    const resTC13 = await dispatch({
      path: '/api/kurir/schedule',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kurirToken}`
      }
    }, {
      jadwal: [
        { hari: 'Sen', jam_mulai: '08:00', jam_selesai: '12:00' },
        { hari: 'Kam', jam_mulai: '13:00', jam_selesai: '17:00' }
      ]
    });
    assert('TC-13',
      resTC13.status === 200 && resTC13.body.jadwal.length === 2,
      'Kurir berhasil memperbarui jadwal shift kerja',
      resTC13.body
    );

    // TC-14: Perhitungan biaya jasa dan honor tugas selesai
    const reqCompleted = db.data.permintaan.find(p => p.id_permintaan === newAntarId);
    const trxCompleted = db.data.transaksi.find(t => t.id_permintaan === newAntarId);
    assert('TC-14',
      reqCompleted.status === 'Terkirim' && trxCompleted.biaya_jasa === 5000 && trxCompleted.honor_kurir === 4000 && trxCompleted.status_bayar === 'lunas',
      'Perhitungan biaya jasa (Rp5.000) dan honor kurir (Rp4.000) tercatat lunas pada tugas yang selesai',
      trxCompleted
    );

    // TC-15: Lapor kehilangan barang
    const resTC15 = await dispatch({
      path: `/api/permintaan/${newAntarId}/laporan`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mhsToken}`
      }
    }, {
      deskripsi: 'Barang tertinggal di lobi dan belum ditemukan',
      foto_bukti: '/uploads/sample_book.jpg'
    });
    assert('TC-15',
      resTC15.status === 201 && resTC15.body.laporan.status === 'diterima',
      'Lapor kehilangan barang berhasil tersimpan dengan status "diterima"',
      resTC15.body
    );
    const laporanId = resTC15.body.laporan.id_laporan;

    // TC-16: Beri rating setelah barang Terkirim
    const resTC16 = await dispatch({
      path: `/api/permintaan/${newAntarId}/ulasan`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mhsToken}`
      }
    }, {
      rating: 5,
      komentar: 'Pengantaran sangat ramah dan tepat waktu!'
    });
    assert('TC-16',
      resTC16.status === 201 && resTC16.body.ulasan.rating === 5,
      'Beri rating 5 bintang setelah status Terkirim berhasil disimpan dan memperbarui rating kurir',
      resTC16.body
    );

    // Login Administrator
    const resAdminLogin = await login('admin@student.unklab.ac.id', 'password123');
    const adminToken = resAdminLogin.body.token;

    // TC-17: Dashboard administrator menampilkan ringkasan
    const resTC17 = await dispatch({
      path: '/api/admin/dashboard',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert('TC-17',
      resTC17.status === 200 && resTC17.body.stats.total_transaksi > 0 && resTC17.body.stats.utilisasi_loker !== undefined,
      'Dashboard administrator menampilkan ringkasan total transaksi, kurir on-duty, utilisasi loker, dan laporan tertunda',
      resTC17.body.stats
    );

    // TC-18: Administrator menindaklanjuti laporan kehilangan
    const resTC18 = await dispatch({
      path: `/api/admin/report/${laporanId}/update`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      status: 'selesai',
      tindak_lanjut: 'Barang telah ditemukan di pos satpam dan diserahkan kembali kepada pemilik.'
    });
    assert('TC-18',
      resTC18.status === 200 && resTC18.body.data.status === 'selesai' && resTC18.body.data.tindak_lanjut.includes('pos satpam'),
      'Administrator berhasil menindaklanjuti laporan kehilangan dan memperbarui status menjadi "selesai"',
      resTC18.body
    );

    // TC-19: Administrator memverifikasi pengajuan kurir
    const dummyUserKurir = {
      id_pengguna: db.nextId('pengguna'),
      nama: 'Miracle Makarewa',
      email_kampus: '12410118@student.unklab.ac.id',
      no_hp: '081234567899',
      password_hash: hashPassword('password123'),
      peran: 'mahasiswa',
      status_akun: 'aktif',
      waktu_daftar: new Date().toISOString()
    };
    db.data.pengguna.push(dummyUserKurir);
    const dummyKurirRecord = {
      id_kurir: db.nextId('kurir'),
      id_pengguna: dummyUserKurir.id_pengguna,
      status_verifikasi: 'menunggu_verifikasi',
      status_ketersediaan: 'tersedia',
      rating_rata: null,
      waktu_pengajuan: new Date().toISOString(),
      setuju_kode_etik: true,
      alasan_penolakan: null
    };
    db.data.kurir.push(dummyKurirRecord);
    db.save();

    const resTC19 = await dispatch({
      path: `/api/admin/courier/${dummyKurirRecord.id_kurir}/verify`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { tindakan: 'setujui' });

    const updatedUser = db.data.pengguna.find(u => u.id_pengguna === dummyUserKurir.id_pengguna);
    assert('TC-19',
      resTC19.status === 200 && dummyKurirRecord.status_verifikasi === 'disetujui' && updatedUser.peran === 'kurir',
      'Administrator menyetujui pengajuan kurir, status verifikasi menjadi "disetujui" dan peran akun menjadi "kurir"',
      { kurir: dummyKurirRecord.status_verifikasi, userPeran: updatedUser.peran }
    );

    // TC-20: Login mahasiswa kurir diarahkan ke dashboard kurir
    const resTC20 = await login('S2410602@student.unklab.ac.id', 'password123');
    assert('TC-20',
      resTC20.status === 200 && resTC20.body.user.peran === 'kurir' && resTC20.body.redirectUrl === '/dashboard-kurir.html',
      'Login kurir diarahkan ke Dashboard Kurir',
      resTC20.body
    );

    // TC-21: Login administrator diarahkan ke dashboard administrator
    const resTC21 = await login('admin@student.unklab.ac.id', 'password123');
    assert('TC-21',
      resTC21.status === 200 && resTC21.body.user.peran === 'administrator' && resTC21.body.redirectUrl === '/dashboard-admin.html',
      'Login administrator diarahkan ke Dashboard Administrator',
      resTC21.body
    );

    // TC-22: Login dengan email kampus tidak terdaftar
    const resTC22 = await login('99999999@student.unklab.ac.id', 'password123');
    assert('TC-22',
      resTC22.status === 401 && resTC22.body.message.includes('Email atau password salah'),
      'Login dengan email kampus tidak terdaftar ditolak dengan pesan kesalahan',
      resTC22.body
    );

    // TC-23: Login dengan akun nonaktif
    const uNonaktif = {
      id_pengguna: db.nextId('pengguna'),
      nama: 'Akun Nonaktif Test',
      email_kampus: '12410999@student.unklab.ac.id',
      no_hp: '081234567800',
      password_hash: hashPassword('password123'),
      peran: 'mahasiswa',
      status_akun: 'nonaktif',
      waktu_daftar: new Date().toISOString()
    };
    db.data.pengguna.push(uNonaktif);
    db.save();

    const resTC23 = await login('12410999@student.unklab.ac.id', 'password123');
    assert('TC-23',
      resTC23.status === 403 && resTC23.body.message.includes('nonaktif'),
      'Login dengan akun nonaktif ditolak dan menampilkan pesan hubungi administrator',
      resTC23.body
    );

    // TC-24: Login dengan kolom kosong
    const resTC24 = await login('', '');
    assert('TC-24',
      resTC24.status === 400 && resTC24.body.message.includes('wajib diisi'),
      'Login dengan kolom kosong ditolak',
      resTC24.body
    );

    // TC-25: Login dengan akun yang belum diverifikasi
    const uBelumVerif = {
      id_pengguna: db.nextId('pengguna'),
      nama: 'Akun Belum Verif Test',
      email_kampus: '12410888@student.unklab.ac.id',
      no_hp: '081234567888',
      password_hash: hashPassword('password123'),
      peran: 'mahasiswa',
      status_akun: 'belum_diverifikasi',
      waktu_daftar: new Date().toISOString()
    };
    db.data.pengguna.push(uBelumVerif);
    db.save();

    const resTC25 = await login('12410888@student.unklab.ac.id', 'password123');
    assert('TC-25',
      resTC25.status === 403 && resTC25.body.need_verification === true,
      'Login dengan akun belum diverifikasi ditolak dengan arahan ke Verifikasi Email',
      resTC25.body
    );

    // TC-26: Registrasi dengan data lengkap dan valid
    const resTC26 = await dispatch({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: 'Vincent Lumabiang',
      email_kampus: '12410555@student.unklab.ac.id',
      no_hp: '081234567555',
      password: 'password123',
      confirm_password: 'password123'
    });
    assert('TC-26',
      resTC26.status === 201 && resTC26.body.success && resTC26.body.simulation_code,
      'Registrasi dengan data lengkap dan valid berhasil, status belum_diverifikasi dan kode dikirim',
      resTC26.body
    );
    const vincentCode = resTC26.body.simulation_code;

    // TC-27: Registrasi dengan kolom kosong
    const resTC27 = await dispatch({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: '',
      email_kampus: '12410556@student.unklab.ac.id',
      no_hp: '081234567556',
      password: 'password123',
      confirm_password: 'password123'
    });
    assert('TC-27',
      resTC27.status === 400 && resTC27.body.field_errors.nama !== null,
      'Registrasi dengan kolom nama kosong ditolak',
      resTC27.body
    );

    // TC-28: Registrasi dengan email di luar domain UNKLAB
    const resTC28 = await dispatch({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: 'Luar Kampus',
      email_kampus: 'luarkampus@gmail.com',
      no_hp: '081234567999',
      password: 'password123',
      confirm_password: 'password123'
    });
    assert('TC-28',
      resTC28.status === 400 && resTC28.body.message.includes('student.unklab.ac.id'),
      'Registrasi dengan email di luar domain UNKLAB ditolak',
      resTC28.body
    );

    // TC-29: Registrasi dengan email kampus yang sudah terdaftar
    const resTC29 = await dispatch({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: 'Michelle Duplikat',
      email_kampus: '12410601@student.unklab.ac.id',
      no_hp: '081234567111',
      password: 'password123',
      confirm_password: 'password123'
    });
    assert('TC-29',
      resTC29.status === 400 && resTC29.body.already_registered === true,
      'Registrasi dengan email kampus yang sudah terdaftar ditolak',
      resTC29.body
    );

    // TC-30: Registrasi dengan konfirmasi password tidak sama
    const resTC30 = await dispatch({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: 'Beda Password',
      email_kampus: '12410557@student.unklab.ac.id',
      no_hp: '081234567557',
      password: 'password123',
      confirm_password: 'passwordBEDA'
    });
    assert('TC-30',
      resTC30.status === 400 && resTC30.body.message.includes('tidak sama'),
      'Registrasi dengan konfirmasi password tidak sama ditolak',
      resTC30.body
    );

    // TC-31: Registrasi dengan format data tidak valid
    const resTC31 = await dispatch({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: 'Format Salah',
      email_kampus: '123@student.unklab.ac.id',
      no_hp: 'abc12345',
      password: 'short',
      confirm_password: 'short'
    });
    assert('TC-31',
      resTC31.status === 400,
      'Registrasi dengan format nomor registrasi, nomor telepon, atau password tidak valid ditolak',
      resTC31.body
    );

    // TC-32: Verifikasi email dengan kode benar lalu login
    const resTC32a = await dispatch({
      path: '/api/auth/verify-email',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email_kampus: '12410555@student.unklab.ac.id',
      kode: vincentCode
    });
    const resTC32b = await login('12410555@student.unklab.ac.id', 'password123');
    assert('TC-32',
      resTC32a.status === 200 && resTC32b.status === 200 && resTC32b.body.user.status_akun === 'aktif',
      'Verifikasi email dengan kode benar mengaktifkan akun dan memungkinkan login',
      { verify: resTC32a.body, login: resTC32b.body }
    );

    // TC-33: Verifikasi email dengan kode salah atau kedaluwarsa
    await dispatch({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: 'Willy Mantiri',
      email_kampus: '12410777@student.unklab.ac.id',
      no_hp: '081234567777',
      password: 'password123',
      confirm_password: 'password123'
    });

    const resTC33 = await dispatch({
      path: '/api/auth/verify-email',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email_kampus: '12410777@student.unklab.ac.id',
      kode: '000000'
    });
    assert('TC-33',
      resTC33.status === 400 && resTC33.body.message.includes('Kode verifikasi salah'),
      'Verifikasi email dengan kode salah ditolak dan menampilkan sisa percobaan',
      resTC33.body
    );

    // TC-34: Kirim ulang kode verifikasi
    const resTC34 = await dispatch({
      path: '/api/auth/resend-code',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email_kampus: '12410777@student.unklab.ac.id'
    });
    assert('TC-34',
      resTC34.status === 200 && resTC34.body.simulation_code !== undefined,
      'Kirim ulang kode verifikasi menghasilkan kode baru yang valid',
      resTC34.body
    );

    // TC-35: Registrasi kurir dengan data lengkap dan valid
    const resTC35 = await dispatch({
      path: '/api/kurir/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: 'Jildeany Maindoka',
      email_kampus: '12410444@student.unklab.ac.id',
      no_hp: '081234567444',
      password: 'password123',
      confirm_password: 'password123',
      jadwal: [
        { hari: 'Kam', jam_mulai: '13:00', jam_selesai: '17:00' },
        { hari: 'Min', jam_mulai: '13:00', jam_selesai: '16:00' }
      ],
      setuju_kode_etik: true
    });
    assert('TC-35',
      resTC35.status === 201 && resTC35.body.success,
      'Registrasi kurir dengan data lengkap dan jadwal valid berhasil diajukan dengan status menunggu verifikasi',
      resTC35.body
    );

    // TC-36: Registrasi kurir tanpa persetujuan kode etik atau jadwal tidak valid
    const resTC36 = await dispatch({
      path: '/api/kurir/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: 'Kurir Tanpa Etik',
      email_kampus: '12410445@student.unklab.ac.id',
      no_hp: '081234567445',
      password: 'password123',
      confirm_password: 'password123',
      jadwal: [{ hari: 'Kam', jam_mulai: '13:00', jam_selesai: '17:00' }],
      setuju_kode_etik: false
    });
    assert('TC-36',
      resTC36.status === 400 && resTC36.body.message.includes('Kode Etik'),
      'Registrasi kurir tanpa persetujuan kode etik ditolak',
      resTC36.body
    );

    // TC-37: Registrasi kurir dengan email yang sudah terdaftar
    const resTC37 = await dispatch({
      path: '/api/kurir/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      nama: 'Michelle Kurir Coba',
      email_kampus: '12410601@student.unklab.ac.id',
      no_hp: '081234567891',
      password: 'password123',
      confirm_password: 'password123',
      jadwal: [{ hari: 'Kam', jam_mulai: '13:00', jam_selesai: '17:00' }],
      setuju_kode_etik: true
    });
    assert('TC-37',
      resTC37.status === 400 && resTC37.body.message.includes('sudah terdaftar'),
      'Registrasi kurir dengan email yang sudah terdaftar ditolak dan disarankan login terlebih dahulu',
      resTC37.body
    );

    // TC-38: Mahasiswa yang sudah punya akun mengajukan diri sebagai kurir
    const resTC38 = await dispatch({
      path: '/api/kurir/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mhsToken}`
      }
    }, {
      jadwal: [
        { hari: 'Sen', jam_mulai: '13:00', jam_selesai: '17:00' },
        { hari: 'Rab', jam_mulai: '09:00', jam_selesai: '12:00' }
      ],
      setuju_kode_etik: true
    });
    assert('TC-38',
      (resTC38.status === 200 || resTC38.status === 201) && resTC38.body.success,
      'Mahasiswa yang sudah login berhasil mengajukan diri sebagai kurir dari dashboard mahasiswa',
      resTC38.body
    );

    // TC-39: Login calon kurir yang pengajuannya belum disetujui
    const resTC39 = await login('12410601@student.unklab.ac.id', 'password123');
    assert('TC-39',
      resTC39.status === 200 && resTC39.body.user.peran === 'mahasiswa' && resTC39.body.user.courier_application_status === 'menunggu_verifikasi',
      'Calon kurir yang belum disetujui masuk sebagai mahasiswa dengan status pengajuan menunggu verifikasi',
      resTC39.body
    );

    // TC-40: Administrator menyetujui pengajuan hasil registrasi kurir
    const michelleKurirRecord = db.data.kurir.find(k => k.id_pengguna === 2);
    const resTC40 = await dispatch({
      path: `/api/admin/courier/${michelleKurirRecord.id_kurir}/verify`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { tindakan: 'setujui' });

    const michelleUserAfter = db.data.pengguna.find(u => u.id_pengguna === 2);
    const resTC40Login = await login('12410601@student.unklab.ac.id', 'password123');
    assert('TC-40',
      resTC40.status === 200 && michelleUserAfter.peran === 'kurir' && resTC40Login.body.redirectUrl === '/dashboard-kurir.html',
      'Administrator menyetujui pengajuan kurir, peran berubah menjadi kurir dan diarahkan ke Dashboard Kurir',
      { verify: resTC40.body, login: resTC40Login.body }
    );

    // TC-41: Administrator menolak pengajuan kurir dengan alasan
    const dummyTolakUser = {
      id_pengguna: db.nextId('pengguna'),
      nama: 'Solarbesain Matheso',
      email_kampus: '12410333@student.unklab.ac.id',
      no_hp: '081234567333',
      password_hash: hashPassword('password123'),
      peran: 'mahasiswa',
      status_akun: 'aktif',
      waktu_daftar: new Date().toISOString()
    };
    db.data.pengguna.push(dummyTolakUser);
    const dummyTolakKurir = {
      id_kurir: db.nextId('kurir'),
      id_pengguna: dummyTolakUser.id_pengguna,
      status_verifikasi: 'menunggu_verifikasi',
      status_ketersediaan: 'tersedia',
      rating_rata: null,
      waktu_pengajuan: new Date().toISOString(),
      setuju_kode_etik: true,
      alasan_penolakan: null
    };
    db.data.kurir.push(dummyTolakKurir);
    db.save();

    const resTC41 = await dispatch({
      path: `/api/admin/courier/${dummyTolakKurir.id_kurir}/verify`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      tindakan: 'tolak',
      alasan: 'Jadwal shift bentrok dengan jam praktikum semester berjalan.'
    });

    const userTolakAfter = db.data.pengguna.find(u => u.id_pengguna === dummyTolakUser.id_pengguna);
    assert('TC-41',
      resTC41.status === 200 && dummyTolakKurir.status_verifikasi === 'ditolak' && dummyTolakKurir.alasan_penolakan.includes('praktikum') && userTolakAfter.peran === 'mahasiswa',
      'Administrator menolak pengajuan kurir dengan alasan, status menjadi "ditolak" dan akun tetap sebagai mahasiswa',
      { kurir: dummyTolakKurir, user: userTolakAfter }
    );

  } catch (err) {
    console.error('Pengujian mengalami kesalahan:', err);
    failedCount++;
  }

  console.log('\n========================================================================');
  console.log(` HASIL AKHIR: ${passedCount} / 41 KASUS UJI LULUS (${failedCount} GAGAL)`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
