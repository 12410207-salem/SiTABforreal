/**
 * SiTAB (Sistem Titip Antar Barang Kampus UNKLAB)
 * Modern Responsive Web Application Controller (L-01 to L-15)
 */

const App = {
  currentUser: null,
  activeScreen: 'L-01',
  locations: [],
  selectedStarRating: 5,
  lastOrderResi: null,
  activeOrderId: null,
  courierRegistrationData: null,

  async init() {
    this.setupEventListeners();
    await this.fetchLocations();
    await this.checkAuthSession();
    this.handleRouteParams();
  },

  handleRouteParams() {
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById(hash)) {
      this.showScreen(hash);
    }
  },

  // API Wrapper
  async api(endpoint, method = 'GET', data = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    const token = localStorage.getItem('sitab_token');
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const res = await fetch(endpoint, options);
      const json = await res.json();
      return { ok: res.ok, status: res.status, data: json };
    } catch (err) {
      console.error('API Error:', err);
      return { ok: false, status: 0, data: { message: 'Gagal terhubung ke server.' } };
    }
  },

  showToast(message, duration = 3000) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'toast-msg';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  },

  // Screen Navigator
  showScreen(screenId) {
    document.querySelectorAll('.app-screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      this.activeScreen = screenId;
      window.location.hash = screenId;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.onScreenActivated(screenId);
    }
    this.updateNavbarVisibility();
  },

  navigateToHome() {
    if (!this.currentUser) {
      this.showScreen('L-01');
    } else if (this.currentUser.peran === 'administrator') {
      this.showScreen('L-12');
    } else if (this.currentUser.peran === 'kurir') {
      this.showScreen('L-08');
    } else {
      this.showScreen('L-02');
    }
  },

  async onScreenActivated(screenId) {
    if (screenId === 'L-02') {
      this.loadMahasiswaDashboard();
    } else if (screenId === 'L-03') {
      this.populateDropPoints();
    } else if (screenId === 'L-04') {
      this.populateAntarLocations();
    } else if (screenId === 'L-05') {
      this.loadTrackingDetail();
    } else if (screenId === 'L-06') {
      this.loadNotifications();
    } else if (screenId === 'L-07') {
      this.loadTransactionHistory();
    } else if (screenId === 'L-08') {
      this.loadCourierDashboard();
    } else if (screenId === 'L-12') {
      this.loadAdminDashboard();
    } else if (screenId === 'L-15') {
      this.prepareCourierRegistration();
    }
  },

  async checkAuthSession() {
    const res = await this.api('/api/auth/me');
    if (res.ok && res.data.success) {
      this.currentUser = res.data.user;
      this.updateNavbarVisibility();
      if (['L-01', 'L-13', 'L-14'].includes(this.activeScreen)) {
        this.navigateToHome();
      }
    } else {
      this.currentUser = null;
      localStorage.removeItem('sitab_token');
      this.updateNavbarVisibility();
      if (!['L-13', 'L-14', 'L-15'].includes(this.activeScreen)) {
        this.showScreen('L-01');
      }
    }
  },

  updateNavbarVisibility() {
    const menuEl = document.getElementById('nav-links-menu');
    const userPill = document.getElementById('nav-user-pill');
    const notifBtn = document.getElementById('btn-navbar-notif');
    const logoutBtn = document.getElementById('btn-navbar-logout');
    const loginBtn = document.getElementById('btn-navbar-login');

    if (!this.currentUser) {
      menuEl.innerHTML = `
        <button class="nav-link-btn ${this.activeScreen === 'L-01' ? 'active' : ''}" onclick="App.showScreen('L-01')">Masuk</button>
        <button class="nav-link-btn ${this.activeScreen === 'L-13' ? 'active' : ''}" onclick="App.showScreen('L-13')">Daftar Mahasiswa</button>
        <button class="nav-link-btn ${this.activeScreen === 'L-15' ? 'active' : ''}" onclick="App.showScreen('L-15')">Daftar Jadi Kurir</button>
      `;
      userPill.style.display = 'none';
      notifBtn.style.display = 'none';
      logoutBtn.style.display = 'none';
      loginBtn.style.display = 'inline-flex';
      return;
    }

    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
    notifBtn.style.display = 'inline-flex';
    userPill.style.display = 'flex';

    document.getElementById('nav-user-name').textContent = this.currentUser.nama.split(',')[0];
    document.getElementById('nav-user-avatar').textContent = this.currentUser.nama.charAt(0);
    document.getElementById('nav-user-role').textContent = this.currentUser.peran.toUpperCase();

    // Render contextual web menu links by role
    if (this.currentUser.peran === 'administrator') {
      menuEl.innerHTML = `
        <button class="nav-link-btn ${this.activeScreen === 'L-12' ? 'active' : ''}" onclick="App.showScreen('L-12'); App.switchAdminTab('monitor');">📊 Monitoring</button>
        <button class="nav-link-btn" onclick="App.showScreen('L-12'); App.switchAdminTab('kurir');">🛵 Kelola & Aktivasi Kurir</button>
        <button class="nav-link-btn" onclick="App.showScreen('L-12'); App.switchAdminTab('laporan');">⚠️ Audit Laporan</button>
      `;
    } else if (this.currentUser.peran === 'kurir') {
      menuEl.innerHTML = `
        <button class="nav-link-btn ${this.activeScreen === 'L-08' ? 'active' : ''}" onclick="App.showScreen('L-08'); App.switchKurirTab('active');">🏠 Ruang Kurir</button>
        <button class="nav-link-btn" onclick="App.showScreen('L-08'); App.switchKurirTab('claim');">⚡ Tugas Masuk</button>
        <button class="nav-link-btn" onclick="App.showScreen('L-08'); App.switchKurirTab('titip');">📋 Verifikasi Titip Mandiri</button>
        <button class="nav-link-btn" onclick="App.showScreen('L-08'); App.switchKurirTab('jadwal');">📅 Jadwal Shift</button>
      `;
    } else {
      menuEl.innerHTML = `
        <button class="nav-link-btn ${this.activeScreen === 'L-02' ? 'active' : ''}" onclick="App.showScreen('L-02')">🏠 Beranda</button>
        <button class="nav-link-btn ${this.activeScreen === 'L-03' ? 'active' : ''}" onclick="App.showScreen('L-03')">📦 Titip Mandiri (7 Pos)</button>
        <button class="nav-link-btn ${this.activeScreen === 'L-04' ? 'active' : ''}" onclick="App.showScreen('L-04')">✈️ Pesan Antar</button>
        <button class="nav-link-btn ${this.activeScreen === 'L-05' ? 'active' : ''}" onclick="App.showScreen('L-05')">📍 Lacak Barang</button>
        <button class="nav-link-btn ${this.activeScreen === 'L-07' ? 'active' : ''}" onclick="App.showScreen('L-07')">⏱️ Riwayat Transaksi</button>
      `;
    }
  },

  async fetchLocations() {
    const res = await this.api('/api/lokasi');
    if (res.ok && res.data.success) {
      this.locations = res.data.data;
    }
  },

  // -------------------------------------------------------------
  // QUICK DEMO SWITCHERS
  // -------------------------------------------------------------
  async quickLoginAs(roleKey) {
    let email = '12410601@student.unklab.ac.id';
    if (roleKey === 'mahasiswa1') email = '12410601@student.unklab.ac.id'; // Michelle
    if (roleKey === 'mahasiswa2') email = '12410207@student.unklab.ac.id'; // Andrew
    if (roleKey === 'kurir') email = 'S2410602@student.unklab.ac.id'; // Sanjaya
    if (roleKey === 'admin') email = 'admin@student.unklab.ac.id'; // Salem

    const res = await this.api('/api/auth/login', 'POST', {
      email_kampus: email,
      password: 'password123'
    });

    if (res.ok && res.data.success) {
      localStorage.setItem('sitab_token', res.data.token);
      this.currentUser = res.data.user;
      this.showToast(`Beralih ke akun demo: ${this.currentUser.nama} (${this.currentUser.peran.toUpperCase()})`);
      this.navigateToHome();
    } else {
      this.showToast('Gagal login demo: ' + res.data.message);
    }
  },

  setDemoRole(role) {
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    passInput.value = 'password123';

    if (role === 'mahasiswa') {
      emailInput.value = '12410601@student.unklab.ac.id';
    } else if (role === 'kurir') {
      emailInput.value = 'S2410602@student.unklab.ac.id';
    } else if (role === 'admin') {
      emailInput.value = 'admin@student.unklab.ac.id';
    }
  },

  // -------------------------------------------------------------
  // L-01: LOGIN HANDLER
  // -------------------------------------------------------------
  async handleLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';

    if (!email || !pass) {
      errorEl.textContent = 'Email kampus dan password wajib diisi.';
      errorEl.style.display = 'block';
      return;
    }

    const res = await this.api('/api/auth/login', 'POST', {
      email_kampus: email,
      password: pass
    });

    if (res.ok && res.data.success) {
      localStorage.setItem('sitab_token', res.data.token);
      this.currentUser = res.data.user;
      this.showToast('Selamat datang, ' + this.currentUser.nama);
      this.navigateToHome();
    } else {
      errorEl.textContent = res.data.message || 'Email atau password salah';
      errorEl.style.display = 'block';
      if (res.data.need_verification) {
        document.getElementById('verify-email-target').value = res.data.email_kampus;
        setTimeout(() => this.showScreen('L-14'), 1500);
      }
    }
  },

  async handleLogout() {
    await this.api('/api/auth/logout', 'POST');
    localStorage.removeItem('sitab_token');
    this.currentUser = null;
    this.showToast('Anda telah berhasil keluar.');
    this.showScreen('L-01');
  },

  // -------------------------------------------------------------
  // L-02: DASHBOARD MAHASISWA & 7 POS DROP POINTS
  // -------------------------------------------------------------
  async loadMahasiswaDashboard() {
    if (!this.currentUser) return;
    document.getElementById('mhs-user-name').textContent = `Halo, ${this.currentUser.nama} 👋`;

    // Render all 7 Drop Point Pos with locker slot visualizers
    await this.fetchLocations();
    const posContainer = document.getElementById('mhs-pos-grid');
    posContainer.innerHTML = '';

    const dropPoints = this.locations.filter(l => l.jenis === 'drop_point');
    dropPoints.forEach(pos => {
      const card = document.createElement('div');
      card.className = 'pos-card';

      // Build locker grid cells
      let cellsHtml = '';
      for (let i = 0; i < pos.kapasitas_loker; i++) {
        const isOccupied = i >= pos.slot_tersedia;
        cellsHtml += `<div class="locker-cell ${isOccupied ? 'occupied' : ''}" title="${isOccupied ? 'Loker Terisi' : 'Loker Tersedia'}"></div>`;
      }

      card.innerHTML = `
        <div>
          <div class="pos-header">
            <span class="pos-name">${pos.nama_lokasi}</span>
            <span class="pos-available-badge">${pos.slot_tersedia}/${pos.kapasitas_loker} Slot</span>
          </div>
          <div style="font-size:12px; color:var(--text-muted); margin: 6px 0 10px;">${pos.keterangan || '-'}</div>
          <div class="pos-locker-grid">${cellsHtml}</div>
        </div>
        <button class="btn-secondary" style="width:100%; font-size:12px; padding:8px;" onclick="App.openTitipForPos(${pos.id_lokasi})">
          📦 Titip di Pos Ini →
        </button>
      `;
      posContainer.appendChild(card);
    });

    // Check Active Order for Hero Banner
    const resOrders = await this.api('/api/permintaan');
    const heroCard = document.getElementById('mhs-active-order-hero');
    const recentActivityList = document.getElementById('mhs-recent-activity');

    if (resOrders.ok && resOrders.data.success && resOrders.data.data.length > 0) {
      const orders = resOrders.data.data;
      const activeOrder = orders.find(o => o.status !== 'Terkirim');
      if (activeOrder) {
        heroCard.style.display = 'flex';
        document.getElementById('hero-resi').textContent = `PENGIRIMAN AKTIF · ${activeOrder.kode_resi}`;
        document.getElementById('hero-title').textContent = activeOrder.status === 'Disimpan' ? 'Barangmu Tersimpan di Loker Pos' : 'Barangmu Sedang Diantar Kurir';
        document.getElementById('hero-route').textContent = `${activeOrder.lokasi_asal} → ${activeOrder.lokasi_tujuan}`;
        document.getElementById('hero-eta').textContent = activeOrder.status === 'Disimpan' ? 'Siap Diambil' : 'Tiba ± 15 Menit';
        document.getElementById('btn-hero-lacak').onclick = () => {
          this.activeOrderId = activeOrder.id_permintaan;
          this.showScreen('L-05');
        };
      } else {
        heroCard.style.display = 'none';
      }

      // Recent Activity Table
      let tableHtml = `
        <div style="overflow-x: auto;">
          <table class="custom-table">
            <thead>
              <tr>
                <th>RESI</th>
                <th>JENIS</th>
                <th>DESKRIPSI BARANG</th>
                <th>RUTE / POS</th>
                <th>BIAYA</th>
                <th>STATUS</th>
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
      `;
      orders.slice(0, 5).forEach(item => {
        tableHtml += `
          <tr>
            <td style="font-weight:700; color:var(--primary-navy);">${item.kode_resi}</td>
            <td><span class="badge ${item.jenis === 'titip' ? 'badge-info' : 'badge-warning'}">${item.jenis === 'titip' ? 'Titip Mandiri' : 'Pesan Antar'}</span></td>
            <td>${item.deskripsi_barang.substring(0, 36)}...</td>
            <td>${item.lokasi_asal} → ${item.lokasi_tujuan}</td>
            <td>${item.transaksi ? 'Rp' + item.transaksi.biaya_jasa.toLocaleString('id-ID') : 'Gratis'}</td>
            <td><span class="badge ${item.status === 'Terkirim' ? 'badge-success' : 'badge-info'}">${item.status}</span></td>
            <td>
              <button class="btn-secondary" style="padding:4px 10px; font-size:11px;" onclick="App.activeOrderId=${item.id_permintaan}; App.showScreen('L-05');">
                Lacak / Detail →
              </button>
            </td>
          </tr>
        `;
      });
      tableHtml += `</tbody></table></div>`;
      recentActivityList.innerHTML = tableHtml;
    } else {
      heroCard.style.display = 'none';
      recentActivityList.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:24px;">Belum ada aktivitas pesanan titip atau antar.</div>';
    }
  },

  openTitipForPos(posId) {
    this.showScreen('L-03');
    setTimeout(() => {
      const sel = document.getElementById('titip-drop-point');
      if (sel) {
        sel.value = posId;
        this.onTitipPosSelected();
      }
    }, 100);
  },

  // -------------------------------------------------------------
  // L-03: TITIP BARANG MANDIRI CONTROLLER
  // -------------------------------------------------------------
  populateDropPoints() {
    const sel = document.getElementById('titip-drop-point');
    sel.innerHTML = '<option value="">-- Pilih Salah Satu dari 7 Pos Drop Point --</option>';
    const dps = this.locations.filter(l => l.jenis === 'drop_point');
    dps.forEach(dp => {
      const opt = document.createElement('option');
      opt.value = dp.id_lokasi;
      opt.textContent = `${dp.nama_lokasi} (${dp.slot_tersedia} slot tersedia)`;
      sel.appendChild(opt);
    });

    if (dps.length > 0) {
      sel.value = dps[0].id_lokasi;
      this.onTitipPosSelected();
    }
  },

  onTitipPosSelected() {
    const sel = document.getElementById('titip-drop-point');
    const posId = parseInt(sel.value);
    const pos = this.locations.find(l => l.id_lokasi === posId);
    if (pos) {
      document.getElementById('titip-selected-pos-name').textContent = pos.nama_lokasi;
      document.getElementById('titip-selected-pos-desc').textContent = pos.keterangan || '-';
      document.getElementById('titip-selected-pos-slots').textContent = `${pos.slot_tersedia} dari ${pos.kapasitas_loker} slot loker kosong`;
    }
  },

  async handleTitipBarang(e) {
    e.preventDefault();
    const desc = document.getElementById('titip-deskripsi').value.trim();
    const locId = document.getElementById('titip-drop-point').value;
    const penerima = document.getElementById('titip-penerima').value.trim();
    const foto = document.getElementById('titip-foto-hidden').value;

    const errBox = document.getElementById('titip-error');
    errBox.style.display = 'none';

    if (!desc || !locId || !penerima) {
      errBox.textContent = 'Semua kolom detail barang wajib diisi.';
      errBox.style.display = 'block';
      return;
    }

    if (!foto) {
      errBox.textContent = 'Foto barang wajib diunggah untuk verifikasi loker pos.';
      errBox.style.display = 'block';
      return;
    }

    const res = await this.api('/api/permintaan/titip', 'POST', {
      deskripsi_barang: desc,
      id_lokasi_asal: locId,
      nama_penerima: penerima,
      foto_barang: foto
    });

    if (res.ok && res.data.success) {
      this.showToast('Barang berhasil dititipkan di loker! Kode OTP Pengambilan Anda: ' + res.data.kode_otp, 6000);
      this.activeOrderId = res.data.id_permintaan;
      await this.fetchLocations();
      this.showScreen('L-05');
    } else {
      errBox.textContent = res.data.message || 'Gagal menitipkan barang.';
      errBox.style.display = 'block';
    }
  },

  // -------------------------------------------------------------
  // L-04: PESAN ANTAR CONTROLLER
  // -------------------------------------------------------------
  populateAntarLocations() {
    const asalSel = document.getElementById('antar-asal');
    const tujuanSel = document.getElementById('antar-tujuan');
    asalSel.innerHTML = '<option value="">-- Pilih Lokasi Jemput --</option>';
    tujuanSel.innerHTML = '<option value="">-- Pilih Lokasi Tujuan --</option>';

    this.locations.forEach(loc => {
      const opt1 = document.createElement('option');
      opt1.value = loc.id_lokasi;
      opt1.textContent = loc.nama_lokasi;
      asalSel.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = loc.id_lokasi;
      opt2.textContent = loc.nama_lokasi;
      tujuanSel.appendChild(opt2);
    });

    asalSel.value = 2; // Pos 2 Perpustakaan
    tujuanSel.value = 3; // Asrama Crystal
  },

  async handlePesanAntar(e) {
    e.preventDefault();
    const asal = document.getElementById('antar-asal').value;
    const tujuan = document.getElementById('antar-tujuan').value;
    const desc = document.getElementById('antar-deskripsi').value.trim();
    const penerima = document.getElementById('antar-penerima').value.trim() || 'Penerima';
    const foto = document.getElementById('antar-foto-hidden').value || '/uploads/sample_book.jpg';

    const errBox = document.getElementById('antar-error');
    errBox.style.display = 'none';

    if (!asal || !tujuan || !desc) {
      errBox.textContent = 'Lokasi jemput, tujuan, dan detail barang wajib diisi.';
      errBox.style.display = 'block';
      return;
    }

    if (asal === tujuan) {
      errBox.textContent = 'Lokasi penjemputan tidak boleh sama dengan lokasi tujuan pengantaran.';
      errBox.style.display = 'block';
      return;
    }

    const res = await this.api('/api/permintaan/antar', 'POST', {
      id_lokasi_asal: asal,
      id_lokasi_tujuan: tujuan,
      deskripsi_barang: desc,
      nama_penerima: penerima,
      foto_barang: foto
    });

    if (res.ok && res.data.success) {
      this.showToast('Pesanan antar berhasil dibuat! Kurir langsung menerima tugas ini.');
      this.activeOrderId = res.data.id_permintaan;
      this.showScreen('L-05');
    } else {
      errBox.textContent = res.data.message || 'Gagal memesan pengantaran.';
      errBox.style.display = 'block';
    }
  },

  // -------------------------------------------------------------
  // L-05: LACAK STATUS BARANG
  // -------------------------------------------------------------
  async loadTrackingDetail() {
    if (!this.activeOrderId) {
      const resList = await this.api('/api/permintaan');
      if (resList.ok && resList.data.success && resList.data.data.length > 0) {
        this.activeOrderId = resList.data.data[0].id_permintaan;
      }
    }

    if (!this.activeOrderId) {
      this.showToast('Tidak ada barang aktif untuk dilacak.');
      this.navigateToHome();
      return;
    }

    const res = await this.api(`/api/permintaan/${this.activeOrderId}`);
    if (!res.ok || !res.data.success) {
      this.showToast(res.data.message || 'Gagal memuat status pengiriman.');
      return;
    }

    const order = res.data.data;
    document.getElementById('track-resi').textContent = order.kode_resi;
    document.getElementById('track-desc').textContent = order.deskripsi_barang;
    document.getElementById('track-status-pill').textContent = order.status.toUpperCase();
    document.getElementById('track-route').textContent = `${order.lokasi_asal} → ${order.lokasi_tujuan}`;

    // Timeline steps
    const steps = ['Menunggu', 'Dijemput', 'Dalam Perjalanan', 'Terkirim'];
    const currentIdx = steps.indexOf(order.status);

    steps.forEach((s, idx) => {
      const stepEl = document.getElementById(`track-step-${idx + 1}`);
      if (stepEl) {
        stepEl.classList.remove('completed', 'active');
        if (idx < currentIdx) {
          stepEl.classList.add('completed');
        } else if (idx === currentIdx) {
          stepEl.classList.add('active');
        }
      }
    });

    // Courier card
    const courierCard = document.getElementById('track-courier-card');
    if (order.kurir) {
      courierCard.style.display = 'block';
      document.getElementById('track-courier-name').textContent = order.kurir.nama;
      document.getElementById('track-courier-rating').textContent = `★ ${order.kurir.rating_rata || '4.90'} · Mitra Kurir Mahasiswa UNKLAB`;
    } else {
      courierCard.style.display = 'none';
    }

    // OTP Display
    const otpContainer = document.getElementById('track-otp-wrap');
    if (order.kode_otp) {
      otpContainer.style.display = 'block';
      const digits = String(order.kode_otp).split('');
      for (let i = 0; i < 4; i++) {
        const digitEl = document.getElementById(`track-otp-${i + 1}`);
        if (digitEl) digitEl.value = digits[i] || '-';
      }
    } else {
      otpContainer.style.display = 'none';
    }

    // Review button
    const btnRating = document.getElementById('btn-track-rating');
    if (order.status === 'Terkirim') {
      btnRating.style.display = 'inline-flex';
      if (order.ulasan) {
        btnRating.textContent = '✓ Sudah Diulas';
        btnRating.disabled = true;
      } else {
        btnRating.textContent = '★ Beri Rating Kurir';
        btnRating.disabled = false;
        btnRating.onclick = () => this.showScreen('L-11');
      }
    } else {
      btnRating.style.display = 'none';
    }
  },

  // -------------------------------------------------------------
  // L-06: NOTIFIKASI
  // -------------------------------------------------------------
  async loadNotifications() {
    const res = await this.api('/api/notifikasi');
    const container = document.getElementById('notif-list-container');
    container.innerHTML = '';

    if (res.ok && res.data.success && res.data.data.length > 0) {
      const notifCountBadge = document.getElementById('nav-notif-count');
      if (res.data.unread_count > 0) {
        notifCountBadge.textContent = res.data.unread_count;
        notifCountBadge.style.display = 'inline-block';
      } else {
        notifCountBadge.style.display = 'none';
      }

      res.data.data.forEach(n => {
        const item = document.createElement('div');
        item.style.padding = '14px 16px';
        item.style.borderBottom = '1px solid var(--border-color)';
        item.style.backgroundColor = n.sudah_dibaca ? '#ffffff' : '#f0fdf4';
        item.style.cursor = 'pointer';
        item.style.display = 'flex';
        item.style.gap = '14px';
        item.style.alignItems = 'center';

        item.innerHTML = `
          <div style="font-size:24px;">🔔</div>
          <div style="flex:1;">
            <div style="font-size:14px; font-weight:700; color:var(--primary-navy);">${n.pesan}</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
              ${new Date(n.waktu).toLocaleString('id-ID')}
            </div>
          </div>
        `;
        item.onclick = async () => {
          await this.api(`/api/notifikasi/${n.id_notifikasi}/baca`, 'POST');
          if (n.id_permintaan) {
            this.activeOrderId = n.id_permintaan;
            this.showScreen('L-05');
          }
        };
        container.appendChild(item);
      });
    } else {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:32px;">Belum ada notifikasi baru.</div>';
    }
  },

  // -------------------------------------------------------------
  // L-07: RIWAYAT TRANSAKSI
  // -------------------------------------------------------------
  async loadTransactionHistory(filterType = null) {
    const url = filterType ? `/api/permintaan?jenis=${filterType}` : '/api/permintaan';
    const res = await this.api(url);
    const container = document.getElementById('riwayat-list-container');
    container.innerHTML = '';

    if (res.ok && res.data.success && res.data.data.length > 0) {
      let html = `
        <div style="overflow-x: auto;">
          <table class="custom-table">
            <thead>
              <tr>
                <th>RESI</th>
                <th>JENIS</th>
                <th>DETAIL BARANG</th>
                <th>RUTE / POS</th>
                <th>BIAYA / STATUS BAYAR</th>
                <th>STATUS PESANAN</th>
                <th>TANGGAL</th>
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
      `;
      res.data.data.forEach(item => {
        html += `
          <tr>
            <td style="font-weight:700; color:var(--primary-navy);">${item.kode_resi}</td>
            <td><span class="badge ${item.jenis === 'titip' ? 'badge-info' : 'badge-warning'}">${item.jenis === 'titip' ? 'Titip Mandiri' : 'Pesan Antar'}</span></td>
            <td>${item.deskripsi_barang}</td>
            <td>${item.lokasi_asal} → ${item.lokasi_tujuan}</td>
            <td>${item.transaksi ? 'Rp' + item.transaksi.biaya_jasa.toLocaleString('id-ID') + ' (' + item.transaksi.status_bayar + ')' : 'Gratis'}</td>
            <td><span class="badge ${item.status === 'Terkirim' ? 'badge-success' : 'badge-info'}">${item.status}</span></td>
            <td style="font-size:12px; color:var(--text-muted);">${new Date(item.waktu_dibuat).toLocaleDateString('id-ID')}</td>
            <td>
              <button class="btn-secondary" style="padding:4px 10px; font-size:11px;" onclick="App.activeOrderId=${item.id_permintaan}; App.showScreen('L-05');">
                Detail →
              </button>
            </td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
      container.innerHTML = html;
    } else {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:32px;">Belum ada data transaksi.</div>';
    }
  },

  // -------------------------------------------------------------
  // L-08: DASHBOARD KURIR (RUANG KURIR)
  // -------------------------------------------------------------
  async loadCourierDashboard() {
    const res = await this.api('/api/kurir/tasks');
    if (!res.ok || !res.data.success) {
      this.showToast('Gagal memuat data kurir.');
      return;
    }

    const { kurir, tasks, unassigned_orders, active_deposits, jadwal } = res.data;
    document.getElementById('kurir-name-greeting').textContent = `Siap antar, ${this.currentUser.nama}? 🛵`;
    document.getElementById('kurir-total-honor').textContent = `Rp${kurir.total_honor.toLocaleString('id-ID')}`;
    document.getElementById('kurir-completed-count').textContent = `${kurir.tugas_selesai} pengantaran sukses selesai`;

    // Shift Toggle
    const shiftToggle = document.getElementById('kurir-shift-toggle');
    const shiftText = document.getElementById('kurir-shift-status-text');
    shiftToggle.checked = kurir.status_ketersediaan === 'tersedia';
    shiftText.textContent = kurir.status_ketersediaan === 'tersedia' ? 'Tersedia (Aktif Bekerja)' : 'Tidak Tersedia (Off)';

    shiftToggle.onchange = async () => {
      const newStat = shiftToggle.checked ? 'tersedia' : 'tidak_tersedia';
      await this.api('/api/kurir/availability', 'POST', { status_ketersediaan: newStat });
      shiftText.textContent = newStat === 'tersedia' ? 'Tersedia (Aktif Bekerja)' : 'Tidak Tersedia (Off)';
      this.showToast(`Status kurir Anda: ${newStat}`);
    };

    // Simpan cache tasks & deposits untuk referensi modal & verifikasi
    this.courierTasks = tasks || [];
    this.courierDeposits = active_deposits || [];

    // Render TAB 1: Assigned active tasks (Pesan Antar)
    const activeTasksContainer = document.getElementById('kurir-tasks-container');
    activeTasksContainer.innerHTML = '';
    const myActive = tasks.filter(t => t.status !== 'Terkirim');
    if (myActive.length > 0) {
      myActive.forEach(task => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '14px';
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px; font-weight:800; color:var(--primary-navy);">${task.kode_resi}</span>
              <span class="badge badge-info">Pesan Antar</span>
            </div>
            <span class="badge badge-warning">${task.status}</span>
          </div>
          <div style="font-size:15px; font-weight:700; color:var(--text-main);">${task.deskripsi_barang}</div>
          <div style="background:var(--background-alt); padding:10px 14px; border-radius:var(--radius-sm); margin:10px 0; font-size:13px; line-height:1.6;">
            <div>📍 <strong>Rute:</strong> ${task.lokasi_asal} → ${task.lokasi_tujuan}</div>
            <div>👤 <strong>Pengirim (Pemesan):</strong> ${task.nama_pemesan} ${task.no_hp_pemesan ? `(${task.no_hp_pemesan})` : ''}</div>
            <div>🎯 <strong>Penerima:</strong> ${task.nama_penerima || 'Penerima'}</div>
            <div style="color:var(--primary-teal-dark); font-weight:700;">💰 Honor Kurir: Rp${(task.honor_kurir || 4000).toLocaleString('id-ID')}</div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            ${task.status === 'Menunggu' ? `
              <button class="btn-primary" onclick="App.updateCourierOrderStatus(${task.id_permintaan}, 'Dijemput')">
                📦 Barang Sudah Dijemput
              </button>
            ` : task.status === 'Dijemput' ? `
              <button class="btn-primary" onclick="App.updateCourierOrderStatus(${task.id_permintaan}, 'Dalam Perjalanan')">
                🛵 Mulai Perjalanan ke Tujuan
              </button>
            ` : `
              <button class="btn-success btn-primary" onclick="App.openSerahTerimaScreen(${task.id_permintaan})">
                ✓ Masukkan OTP Penerima & Selesaikan Serah-Terima (L-09)
              </button>
            `}
            ${task.kode_otp ? `<span class="badge badge-info" style="font-family:monospace; font-size:12px;">OTP Demo: ${task.kode_otp}</span>` : ''}
          </div>
        `;
        activeTasksContainer.appendChild(card);
      });
    } else {
      activeTasksContainer.innerHTML = '<div class="card" style="text-align:center; color:var(--text-muted); padding:32px;">Tidak ada tugas pengantaran aktif saat ini. Anda dapat memeriksa tab "Tugas Baru Masuk" untuk mengambil tugas baru!</div>';
    }

    // Render TAB 2: Unassigned orders for courier to claim freely
    const unassignedContainer = document.getElementById('kurir-unassigned-container');
    unassignedContainer.innerHTML = '';
    if (unassigned_orders && unassigned_orders.length > 0) {
      unassigned_orders.forEach(uOrder => {
        const item = document.createElement('div');
        item.className = 'card';
        item.style.marginBottom = '10px';
        item.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-weight:800; color:var(--primary-navy);">${uOrder.kode_resi} · ${uOrder.deskripsi_barang}</span>
            <span class="badge badge-info">Siap Diambil</span>
          </div>
          <div style="background:var(--background-alt); padding:8px 12px; border-radius:var(--radius-sm); font-size:13px; line-height:1.5; margin-bottom:10px;">
            <div>📍 <strong>Rute:</strong> ${uOrder.lokasi_asal} → ${uOrder.lokasi_tujuan}</div>
            <div>👤 <strong>Pengirim:</strong> ${uOrder.nama_pemesan} &nbsp;|&nbsp; 🎯 <strong>Penerima:</strong> ${uOrder.nama_penerima || 'Penerima'}</div>
          </div>
          <button class="btn-primary" style="padding:8px 16px; font-size:12px;" onclick="App.claimCourierTask(${uOrder.id_permintaan})">
            ⚡ Ambil Tugas Pengantaran Ini (Langsung Kerja)
          </button>
        `;
        unassignedContainer.appendChild(item);
      });
    } else {
      unassignedContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:24px;">Tidak ada tugas baru yang menunggu saat ini.</div>';
    }

    // Render TAB 3: Active deposits at 7 Pos (Titip Mandiri)
    const depositsContainer = document.getElementById('kurir-deposits-table-container');
    depositsContainer.innerHTML = '';
    if (active_deposits && active_deposits.length > 0) {
      let depHtml = `
        <table class="custom-table">
          <thead>
            <tr>
              <th>RESI</th>
              <th>POS LOKER</th>
              <th>DESKRIPSI</th>
              <th>PENGIRIM & PENERIMA</th>
              <th>STATUS</th>
              <th>AKSI</th>
            </tr>
          </thead>
          <tbody>
      `;
      active_deposits.forEach(d => {
        const safeResi = String(d.kode_resi || '');
        const safeOtp = String(d.kode_otp || '');
        const safePenitip = String(d.nama_penitip || '-').replace(/'/g, "\\'");
        const safePenerima = String(d.nama_penerima || safePenitip).replace(/'/g, "\\'");
        const safePos = String(d.pos_lokasi || '-').replace(/'/g, "\\'");
        const safeDesc = String(d.deskripsi_barang || '-').replace(/'/g, "\\'");

        depHtml += `
          <tr>
            <td style="font-weight:700; color:var(--primary-navy);">${d.kode_resi}</td>
            <td><strong>${d.pos_lokasi}</strong></td>
            <td>${d.deskripsi_barang}</td>
            <td style="font-size:12px; line-height:1.4;">
              👤 Penitip: <strong>${d.nama_penitip}</strong><br>
              🎯 Penerima: <strong>${d.nama_penerima || d.nama_penitip}</strong>
            </td>
            <td><span class="badge badge-success">Tersimpan di Loker</span></td>
            <td>
              <button class="btn-primary" style="padding:6px 12px; font-size:11px;" onclick="App.openTitipMandiriVerification('${safeResi}', '${safeOtp}', '${safePenitip}', '${safePenerima}', '${safePos}', '${safeDesc}')">
                🔑 Ambil Titipan →
              </button>
            </td>
          </tr>
        `;
      });
      depHtml += `</tbody></table>`;
      depositsContainer.innerHTML = depHtml;
    } else {
      depositsContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:24px;">Seluruh loker pos saat ini kosong.</div>';
    }

    // Render TAB 4: Courier Schedule
    const schedContainer = document.getElementById('kurir-schedule-container');
    schedContainer.innerHTML = '';
    jadwal.forEach(j => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.padding = '8px 0';
      row.style.borderBottom = '1px solid var(--border-color)';
      row.innerHTML = `
        <span style="font-weight:700; color:var(--primary-navy);">${j.hari}</span>
        <span style="color:var(--text-muted);">${j.jam_mulai} – ${j.jam_selesai} WITA</span>
        <span class="badge badge-success">Aktif</span>
      `;
      schedContainer.appendChild(row);
    });
  },

  switchKurirTab(tabKey) {
    ['active', 'claim', 'titip', 'jadwal'].forEach(k => {
      const pane = document.getElementById(`kurir-pane-${k}`);
      const btn = document.getElementById(`tab-btn-kurir-${k}`);
      if (pane) pane.style.display = k === tabKey ? 'block' : 'none';
      if (btn) btn.classList.toggle('active', k === tabKey);
    });
  },

  async claimCourierTask(id_permintaan) {
    const res = await this.api(`/api/kurir/task/${id_permintaan}/claim`, 'POST');
    if (res.ok && res.data.success) {
      this.showToast('Tugas berhasil diambil! Silakan jemput barang.');
      this.loadCourierDashboard();
      this.switchKurirTab('active');
    } else {
      this.showToast(res.data.message || 'Gagal mengambil tugas.');
    }
  },

  openTitipMandiriVerification(resi, otp, penitip, penerima, pos, desc) {
    this.switchKurirTab('titip');
    const resiInput = document.getElementById('kurir-titip-resi');
    const otpInput = document.getElementById('kurir-titip-otp');
    if (resiInput) resiInput.value = resi;
    if (otpInput) {
      otpInput.value = '';
      otpInput.focus();
    }

    const hintContainer = document.getElementById('kurir-titip-hint');
    if (hintContainer) {
      hintContainer.innerHTML = `
        <div style="background:var(--primary-teal-light); border:1px solid #a7f3d0; padding:12px 14px; border-radius:var(--radius-md); margin-bottom:14px; font-size:13px; line-height:1.5;">
          <div style="font-weight:800; color:var(--primary-navy); margin-bottom:4px;">📦 Verifikasi Pengambilan: ${resi} · ${desc}</div>
          <div>📍 <strong>Pos Loker:</strong> ${pos}</div>
          <div>👤 <strong>Penitip (Pengirim):</strong> ${penitip} &nbsp;|&nbsp; 🎯 <strong>Penerima (Pengambil):</strong> ${penerima}</div>
          ${otp ? `<div style="margin-top:6px; color:var(--primary-teal-dark); font-weight:700;">💡 Info Demo (Kode OTP dari Mahasiswa): <span style="font-family:monospace; font-size:16px; letter-spacing:2px; color:var(--primary-navy);">${otp}</span></div>` : ''}
        </div>
      `;
    }

    if (resiInput) resiInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  async handleKurirVerifyTitipMandiri(e) {
    e.preventDefault();
    const resi = document.getElementById('kurir-titip-resi').value.trim();
    const otp = document.getElementById('kurir-titip-otp').value.trim();

    if (!resi || !otp) {
      this.showToast('Nomor resi dan kode OTP wajib diisi.');
      return;
    }

    const res = await this.api('/api/kurir/verify-titip-mandiri', 'POST', {
      kode_resi: resi,
      kode_otp: otp
    });

    if (res.ok && res.data.success) {
      this.showToast(`✓ ${res.data.message}`, 5000);
      document.getElementById('kurir-titip-resi').value = '';
      document.getElementById('kurir-titip-otp').value = '';
      const hint = document.getElementById('kurir-titip-hint');
      if (hint) hint.innerHTML = '';
      await this.loadCourierDashboard();
    } else {
      this.showToast(res.data.message || 'Verifikasi OTP gagal.');
    }
  },

  async updateCourierOrderStatus(orderId, status) {
    const res = await this.api(`/api/permintaan/${orderId}/status`, 'POST', { status });
    if (res.ok && res.data.success) {
      this.showToast(`Status pengantaran diubah ke: ${status}`);
      this.loadCourierDashboard();
    } else {
      this.showToast(res.data.message || 'Gagal memperbarui status.');
    }
  },

  openSerahTerimaScreen(orderId) {
    this.activeOrderId = orderId;
    const task = (this.courierTasks || []).find(t => t.id_permintaan === orderId);

    const infoEl = document.getElementById('st-order-info');
    if (infoEl) {
      if (task) {
        infoEl.innerHTML = `
          <div style="background:var(--background-alt); border:1px solid var(--border-color); padding:14px; border-radius:var(--radius-md); line-height:1.5;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:18px; font-weight:800; color:var(--primary-navy);">${task.kode_resi}</span>
              <span class="badge badge-warning">${task.status}</span>
            </div>
            <div style="font-weight:700; color:var(--text-main); margin-bottom:6px;">${task.deskripsi_barang}</div>
            <div style="font-size:13px; color:var(--text-muted); line-height:1.6;">
              <div>📍 <strong>Rute:</strong> ${task.lokasi_asal} → ${task.lokasi_tujuan}</div>
              <div>👤 <strong>Pengirim (Pemesan):</strong> ${task.nama_pemesan || '-'} ${task.no_hp_pemesan ? '(' + task.no_hp_pemesan + ')' : ''}</div>
              <div>🎯 <strong>Penerima:</strong> ${task.nama_penerima || '-'}</div>
            </div>
            ${task.kode_otp ? `
              <div style="margin-top:10px; padding:10px 14px; background:var(--primary-teal-light); border-radius:var(--radius-sm); font-size:13px; color:var(--primary-teal-dark); font-weight:700;">
                💡 Info Demo (Kode OTP dari Penerima): <span style="font-size:18px; font-family:monospace; letter-spacing:3px; color:var(--primary-navy);">${task.kode_otp}</span>
              </div>
            ` : ''}
          </div>
        `;
      } else {
        infoEl.innerHTML = `<div class="card" style="margin-bottom:12px;">Pesanan #${orderId}</div>`;
      }
    }

    // Reset OTP input fields
    ['otp-st-1', 'otp-st-2', 'otp-st-3', 'otp-st-4', 'otp-st-single'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const errEl = document.getElementById('st-error');
    if (errEl) errEl.style.display = 'none';

    this.showScreen('L-09');
    const firstDigit = document.getElementById('otp-st-1');
    if (firstDigit) firstDigit.focus();
  },

  // -------------------------------------------------------------
  // L-09: VERIFIKASI SERAH-TERIMA (LANGSUNG KURIR KE MAHASISWA)
  // -------------------------------------------------------------
  async handleConfirmSerahTerima(e) {
    e.preventDefault();
    const singleEl = document.getElementById('otp-st-single');
    const d1 = document.getElementById('otp-st-1') ? document.getElementById('otp-st-1').value : '';
    const d2 = document.getElementById('otp-st-2') ? document.getElementById('otp-st-2').value : '';
    const d3 = document.getElementById('otp-st-3') ? document.getElementById('otp-st-3').value : '';
    const d4 = document.getElementById('otp-st-4') ? document.getElementById('otp-st-4').value : '';

    let otp = '';
    if (singleEl && singleEl.value.trim().length === 4) {
      otp = singleEl.value.trim();
    } else {
      otp = `${d1}${d2}${d3}${d4}`.trim();
    }

    const foto = document.getElementById('st-foto-hidden').value || '/uploads/sample_delivered.jpg';
    const errEl = document.getElementById('st-error');
    errEl.style.display = 'none';

    if (otp.length !== 4) {
      errEl.textContent = 'Kode OTP penerima wajib 4 digit.';
      errEl.style.display = 'block';
      return;
    }

    if (!this.activeOrderId) {
      // Fallback: look for the first non-completed courier task
      const fallbackTask = (this.courierTasks || []).find(t => t.status !== 'Terkirim');
      if (fallbackTask) {
        this.activeOrderId = fallbackTask.id_permintaan;
      } else {
        errEl.textContent = 'ID pesanan aktif tidak ditemukan. Silakan pilih tugas kembali di Dashboard Kurir.';
        errEl.style.display = 'block';
        return;
      }
    }

    const res = await this.api(`/api/permintaan/${this.activeOrderId}/serah-terima`, 'POST', {
      kode_otp: otp,
      foto_bukti: foto,
      tahap: 'pengambilan'
    });

    if (res.ok && res.data.success) {
      this.showToast('✓ Serah-terima berhasil! Pesanan selesai dan honor kurir otomatis dicatat.', 5000);
      await this.loadCourierDashboard();
      this.showScreen('L-08');
    } else {
      errEl.textContent = res.data.message || 'Kode OTP salah atau serah-terima gagal.';
      errEl.style.display = 'block';
    }
  },

  // -------------------------------------------------------------
  // L-10: LAPOR KEHILANGAN
  // -------------------------------------------------------------
  async handleLaporKehilangan(e) {
    e.preventDefault();
    const desc = document.getElementById('lapor-deskripsi').value.trim();
    const foto = document.getElementById('lapor-foto-hidden').value;
    const errEl = document.getElementById('lapor-error');
    errEl.style.display = 'none';

    if (!desc) {
      errEl.textContent = 'Kronologi kejadian wajib dicantumkan.';
      errEl.style.display = 'block';
      return;
    }

    const res = await this.api(`/api/permintaan/${this.activeOrderId}/laporan`, 'POST', {
      deskripsi: desc,
      foto_bukti: foto
    });

    if (res.ok && res.data.success) {
      this.showToast('Laporan kehilangan berhasil dikirim dan akan diaudit administrator.');
      this.showScreen('L-05');
    } else {
      errEl.textContent = res.data.message || 'Gagal mengirim laporan.';
      errEl.style.display = 'block';
    }
  },

  // -------------------------------------------------------------
  // L-11: BERI RATING & ULASAN
  // -------------------------------------------------------------
  setRatingStars(starCount) {
    this.selectedStarRating = starCount;
    document.querySelectorAll('.star-rating-wrap .star').forEach((star, idx) => {
      star.classList.toggle('active', idx < starCount);
    });

    const labels = { 1: 'Sangat Buruk', 2: 'Kurang', 3: 'Cukup', 4: 'Bagus', 5: 'Bagus sekali' };
    document.getElementById('rating-label').textContent = labels[starCount] || '';
  },

  async handleKirimUlasan(e) {
    e.preventDefault();
    const komentar = document.getElementById('ulasan-komentar').value.trim();

    const res = await this.api(`/api/permintaan/${this.activeOrderId}/ulasan`, 'POST', {
      rating: this.selectedStarRating,
      komentar
    });

    if (res.ok && res.data.success) {
      this.showToast('Rating dan ulasan berhasil dikirim! Terima kasih atas penilaianmu.');
      this.showScreen('L-05');
    } else {
      this.showToast(res.data.message || 'Gagal mengirim ulasan.');
    }
  },

  // -------------------------------------------------------------
  // L-12: DASHBOARD ADMINISTRATOR
  // -------------------------------------------------------------
  async loadAdminDashboard() {
    const res = await this.api('/api/admin/dashboard');
    if (!res.ok || !res.data.success) {
      this.showToast('Gagal memuat panel administrator.');
      return;
    }

    const { stats, orders } = res.data;
    document.getElementById('admin-stat-transaksi').textContent = stats.total_transaksi;
    document.getElementById('admin-stat-kurir').textContent = stats.kurir_on_duty;
    document.getElementById('admin-stat-loker').textContent = stats.utilisasi_loker;
    document.getElementById('admin-stat-laporan').textContent = stats.laporan_tertunda;

    // Render monitoring table
    const tableBody = document.getElementById('admin-orders-table-body');
    tableBody.innerHTML = '';
    orders.forEach(o => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:var(--primary-navy);">${o.kode_resi}</td>
        <td><span class="badge ${o.jenis === 'titip' ? 'badge-info' : 'badge-warning'}">${o.jenis === 'titip' ? 'Titip Mandiri' : 'Pesan Antar'}</span></td>
        <td>${o.pemohon_nama}</td>
        <td>${o.rute}</td>
        <td><span class="badge ${o.status === 'Terkirim' ? 'badge-success' : 'badge-info'}">${o.status}</span></td>
        <td><strong>${o.kurir_nama || (o.jenis === 'titip' ? 'Mandiri / Kurir Pos' : 'Otomatis Ditugaskan')}</strong></td>
      `;
      tableBody.appendChild(tr);
    });

    this.loadAdminCouriers();
    this.loadAdminReports();
  },

  switchAdminTab(tabKey) {
    ['monitor', 'kurir', 'laporan'].forEach(k => {
      const pane = document.getElementById(`admin-pane-${k}`);
      const btn = document.getElementById(`tab-btn-admin-${k}`);
      if (pane) pane.style.display = k === tabKey ? 'block' : 'none';
      if (btn) btn.classList.toggle('active', k === tabKey);
    });
  },

  async loadAdminCouriers() {
    const res = await this.api('/api/admin/couriers');
    const container = document.getElementById('admin-couriers-container');
    container.innerHTML = '';

    if (res.ok && res.data.success && res.data.data.length > 0) {
      res.data.data.forEach(k => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.marginBottom = '12px';
        const isPending = k.status_verifikasi === 'menunggu_verifikasi';
        const isTersedia = k.status_ketersediaan === 'tersedia';

        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-size:16px; font-weight:800; color:var(--primary-navy);">
                ${k.pengguna ? k.pengguna.nama : 'Kurir ' + k.id_kurir}
              </div>
              <div style="font-size:12px; color:var(--text-muted);">
                ${k.pengguna ? k.pengguna.email_kampus : ''} · HP: ${k.pengguna ? k.pengguna.no_hp : ''}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge ${k.status_verifikasi === 'disetujui' ? 'badge-success' : isPending ? 'badge-warning' : 'badge-danger'}">
                ${k.status_verifikasi.toUpperCase()}
              </span>
              <span class="badge ${isTersedia ? 'badge-success' : 'badge-warning'}">
                ${isTersedia ? 'ON-DUTY (AKTIF)' : 'OFF (NONAKTIF)'}
              </span>
            </div>
          </div>

          <div style="font-size:12px; color:#475569; margin:8px 0;">
            Jadwal Shift: ${k.jadwal.map(j => `${j.hari} (${j.jam_mulai}–${j.jam_selesai})`).join(', ') || 'Semua Hari'}<br>
            Total Tugas Selesai: <strong>${k.tugas_selesai} kali</strong> | Rating Rata-rata: <strong>★ ${k.rating_rata || '4.90'}</strong>
          </div>

          ${k.alasan_penolakan ? `<div style="font-size:12px; color:var(--danger-text); margin-bottom:6px;">Alasan Ditolak: ${k.alasan_penolakan}</div>` : ''}

          <div style="display:flex; gap:8px; margin-top:10px; border-top:1px solid #f1f5f9; padding-top:10px;">
            ${isPending ? `
              <button class="btn-primary" style="padding:6px 14px; font-size:12px;" onclick="App.verifyCourier(${k.id_kurir}, 'setujui')">
                ✓ Setujui Mahasiswa Ini Jadi Kurir
              </button>
              <button class="btn-secondary" style="padding:6px 14px; font-size:12px; color:var(--danger-text);" onclick="App.verifyCourierPromptReject(${k.id_kurir})">
                ✕ Tolak Pengajuan
              </button>
            ` : `
              <button class="btn-secondary" style="padding:6px 14px; font-size:12px; font-weight:700;" onclick="App.adminToggleCourierStatus(${k.id_kurir})">
                ${isTersedia ? '⏸️ Nonaktifkan Kurir' : '▶️ Aktifkan Kurir Bekerja'}
              </button>
            `}
          </div>
        `;
        container.appendChild(div);
      });
    }
  },

  async adminToggleCourierStatus(id_kurir) {
    const res = await this.api(`/api/admin/courier/${id_kurir}/toggle-status`, 'POST');
    if (res.ok && res.data.success) {
      this.showToast(res.data.message);
      this.loadAdminCouriers();
      this.loadAdminDashboard();
    } else {
      this.showToast(res.data.message || 'Gagal mengubah status kurir.');
    }
  },

  async verifyCourier(id_kurir, tindakan, alasan = null) {
    const res = await this.api(`/api/admin/courier/${id_kurir}/verify`, 'POST', { tindakan, alasan });
    if (res.ok && res.data.success) {
      this.showToast(tindakan === 'setujui' ? 'Mahasiswa resmi disetujui sebagai Kurir!' : 'Pengajuan ditolak.');
      this.loadAdminCouriers();
    } else {
      this.showToast(res.data.message || 'Gagal memverifikasi kurir.');
    }
  },

  verifyCourierPromptReject(id_kurir) {
    const reason = prompt('Masukkan alasan penolakan pengajuan kurir:');
    if (reason) {
      this.verifyCourier(id_kurir, 'tolak', reason);
    }
  },

  async loadAdminReports() {
    const res = await this.api('/api/admin/reports');
    const container = document.getElementById('admin-reports-container');
    container.innerHTML = '';

    if (res.ok && res.data.success && res.data.data.length > 0) {
      res.data.data.forEach(r => {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.marginBottom = '14px';
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:16px; font-weight:800; color:var(--primary-navy);">${r.kode_resi} · ${r.deskripsi_barang}</span>
            <span class="badge ${r.status === 'selesai' ? 'badge-success' : 'badge-danger'}">${r.status.toUpperCase()}</span>
          </div>
          <div style="font-size:13px; color:#475569; margin:4px 0;">Pelapor: <strong>${r.pelapor_nama}</strong> (${r.pelapor_email})</div>
          <div style="font-size:14px; font-weight:600; color:var(--text-main); margin:6px 0; background:#f8fafc; padding:10px; border-radius:6px;">
            Kronologi: "${r.deskripsi}"
          </div>
          ${r.tindak_lanjut ? `<div style="font-size:13px; color:var(--primary-teal-dark); background:var(--primary-teal-light); padding:8px 12px; border-radius:6px; margin:8px 0;">Tindak Lanjut Admin: ${r.tindak_lanjut}</div>` : ''}
          <div style="margin-top:10px;">
            <button class="btn-primary" style="padding:6px 14px; font-size:12px;" onclick="App.adminUpdateReportPrompt(${r.id_laporan})">
              Tindak Lanjuti / Selesaikan Laporan Ini →
            </button>
          </div>
        `;
        container.appendChild(div);
      });
    } else {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:32px;">Tidak ada laporan kehilangan yang tertunda.</div>';
    }
  },

  async adminUpdateReportPrompt(id_laporan) {
    const tindak = prompt('Masukkan catatan tindak lanjut audit barang:');
    if (tindak) {
      const res = await this.api(`/api/admin/report/${id_laporan}/update`, 'POST', {
        status: 'selesai',
        tindak_lanjut: tindak
      });
      if (res.ok && res.data.success) {
        this.showToast('Laporan berhasil diselesaikan.');
        this.loadAdminReports();
        this.loadAdminDashboard();
      }
    }
  },

  // -------------------------------------------------------------
  // L-13: REGISTRASI MAHASISWA
  // -------------------------------------------------------------
  async handleRegisterMahasiswa(e) {
    e.preventDefault();
    const nama = document.getElementById('reg-nama').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const hp = document.getElementById('reg-hp').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const confirm = document.getElementById('reg-confirm').value;

    const errBox = document.getElementById('reg-error');
    errBox.style.display = 'none';

    const res = await this.api('/api/auth/register', 'POST', {
      nama,
      email_kampus: email,
      no_hp: hp,
      password: pass,
      confirm_password: confirm
    });

    if (res.ok && res.data.success) {
      document.getElementById('verify-email-target').value = email;
      document.getElementById('verify-demo-banner').style.display = 'flex';
      document.getElementById('verify-demo-code').textContent = res.data.simulation_code;
      this.showToast('Registrasi berhasil! Masukkan kode OTP 6 digit.');
      this.showScreen('L-14');
    } else {
      errBox.textContent = res.data.message || 'Registrasi gagal.';
      errBox.style.display = 'block';
    }
  },

  // -------------------------------------------------------------
  // L-14: VERIFIKASI EMAIL
  // -------------------------------------------------------------
  async handleVerifyEmail(e) {
    e.preventDefault();
    const email = document.getElementById('verify-email-target').value;
    let code = '';
    for (let i = 1; i <= 6; i++) {
      code += document.getElementById(`v-digit-${i}`).value;
    }

    const errBox = document.getElementById('verify-error');
    errBox.style.display = 'none';

    if (code.length !== 6) {
      errBox.textContent = 'Kode verifikasi harus 6 digit.';
      errBox.style.display = 'block';
      return;
    }

    const res = await this.api('/api/auth/verify-email', 'POST', {
      email_kampus: email,
      kode: code
    });

    if (res.ok && res.data.success) {
      this.showToast('Verifikasi berhasil! Akun Anda kini aktif.');
      document.getElementById('login-email').value = email;
      this.showScreen('L-01');
    } else {
      errBox.textContent = res.data.message || 'Kode verifikasi salah.';
      errBox.style.display = 'block';
    }
  },

  async handleResendVerificationCode() {
    const email = document.getElementById('verify-email-target').value;
    if (!email) {
      this.showToast('Email kampus tidak ditemukan.');
      return;
    }

    const res = await this.api('/api/auth/resend-code', 'POST', { email_kampus: email });
    if (res.ok && res.data.success) {
      document.getElementById('verify-demo-banner').style.display = 'flex';
      document.getElementById('verify-demo-code').textContent = res.data.simulation_code;
      this.showToast('Kode verifikasi baru berhasil dikirim.');
    } else {
      this.showToast(res.data.message || 'Gagal mengirim ulang kode.');
    }
  },

  // -------------------------------------------------------------
  // L-15: REGISTRASI MAHASISWA KURIR
  // -------------------------------------------------------------
  prepareCourierRegistration() {
    const accountFields = document.getElementById('reg-kurir-account-fields');
    if (this.currentUser) {
      accountFields.style.display = 'none';
      document.getElementById('reg-kurir-logged-notice').style.display = 'block';
      document.getElementById('reg-kurir-user-summary').textContent = `${this.currentUser.nama} (${this.currentUser.email_kampus})`;
    } else {
      accountFields.style.display = 'block';
      document.getElementById('reg-kurir-logged-notice').style.display = 'none';
    }
  },

  async handleRegisterKurir(e) {
    e.preventDefault();
    const errBox = document.getElementById('reg-kurir-error');
    errBox.style.display = 'none';

    const setujuEtik = document.getElementById('kurir-etik-check').checked;
    if (!setujuEtik) {
      errBox.textContent = 'Anda wajib menyetujui Kode Etik Kurir SiTAB.';
      errBox.style.display = 'block';
      return;
    }

    const activeDays = [];
    document.querySelectorAll('.day-chip.active').forEach(chip => {
      activeDays.push(chip.getAttribute('data-day'));
    });

    if (activeDays.length === 0) {
      errBox.textContent = 'Pilih minimal satu hari shift ketersediaan.';
      errBox.style.display = 'block';
      return;
    }

    const jamMulai = document.getElementById('kurir-jam-mulai').value || '13:00';
    const jamSelesai = document.getElementById('kurir-jam-selesai').value || '17:00';

    const jadwal = activeDays.map(d => ({
      hari: d,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai
    }));

    const payload = {
      jadwal,
      setuju_kode_etik: setujuEtik
    };

    if (!this.currentUser) {
      payload.nama = document.getElementById('reg-kurir-nama').value.trim();
      payload.email_kampus = document.getElementById('reg-kurir-email').value.trim();
      payload.no_hp = document.getElementById('reg-kurir-hp').value.trim();
      payload.password = document.getElementById('reg-kurir-pass').value;
      payload.confirm_password = document.getElementById('reg-kurir-confirm').value;
    }

    const res = await this.api('/api/kurir/register', 'POST', payload);
    if (res.ok && res.data.success) {
      this.showToast('Pengajuan kurir berhasil dikirim! Menunggu konfirmasi administrator.');
      if (res.data.needs_verification) {
        document.getElementById('verify-email-target').value = res.data.email_kampus;
        this.showScreen('L-14');
      } else {
        this.navigateToHome();
      }
    } else {
      errBox.textContent = res.data.message || 'Pendaftaran kurir gagal.';
      errBox.style.display = 'block';
    }
  },

  // Setup Global Event Listeners & File Handlers
  setupEventListeners() {
    // Robust OTP digit handling (Auto advance, backspace, and paste support)
    const otpBoxes = Array.from(document.querySelectorAll('.otp-digit'));
    otpBoxes.forEach((input) => {
      // Input event for robust character entry
      input.addEventListener('input', () => {
        const val = input.value.replace(/[^0-9]/g, '');
        if (val.length > 1) {
          // Multi-char input (pasted into individual box)
          const digits = val.slice(0, 4);
          const parent = input.closest('.otp-container');
          if (parent) {
            const siblings = Array.from(parent.querySelectorAll('.otp-digit'));
            digits.split('').forEach((d, i) => {
              if (siblings[i]) siblings[i].value = d;
            });
            const nextIdx = Math.min(digits.length, siblings.length - 1);
            if (siblings[nextIdx]) siblings[nextIdx].focus();
          }
          return;
        }
        input.value = val;
        if (val.length === 1) {
          const next = input.nextElementSibling;
          if (next && next.classList.contains('otp-digit')) next.focus();
        }

        // Sync with single OTP input if in L-09
        const single = document.getElementById('otp-st-single');
        if (single && input.id && input.id.startsWith('otp-st-')) {
          const d1 = document.getElementById('otp-st-1') ? document.getElementById('otp-st-1').value : '';
          const d2 = document.getElementById('otp-st-2') ? document.getElementById('otp-st-2').value : '';
          const d3 = document.getElementById('otp-st-3') ? document.getElementById('otp-st-3').value : '';
          const d4 = document.getElementById('otp-st-4') ? document.getElementById('otp-st-4').value : '';
          single.value = `${d1}${d2}${d3}${d4}`.trim();
        }
      });

      // Keydown event for backspace
      input.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !input.value) {
          const prev = input.previousElementSibling;
          if (prev && prev.classList.contains('otp-digit')) {
            prev.focus();
            prev.value = '';
          }
        }
      });

      // Paste event
      input.addEventListener('paste', e => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
        const parent = input.closest('.otp-container');
        if (parent) {
          const siblings = Array.from(parent.querySelectorAll('.otp-digit'));
          digits.split('').forEach((d, i) => {
            if (siblings[i]) siblings[i].value = d;
          });
          const single = document.getElementById('otp-st-single');
          if (single) single.value = digits;
          const nextIdx = Math.min(digits.length, siblings.length - 1);
          if (siblings[nextIdx]) siblings[nextIdx].focus();
        }
      });
    });

    // Sync from single OTP input to individual boxes in L-09
    const singleOtp = document.getElementById('otp-st-single');
    if (singleOtp) {
      singleOtp.addEventListener('input', () => {
        const digits = singleOtp.value.replace(/[^0-9]/g, '').slice(0, 4);
        singleOtp.value = digits;
        ['otp-st-1', 'otp-st-2', 'otp-st-3', 'otp-st-4'].forEach((id, idx) => {
          const box = document.getElementById(id);
          if (box) box.value = digits[idx] || '';
        });
      });
    }

    document.querySelectorAll('.day-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        if (chip.classList.contains('active')) {
          chip.style.background = 'var(--primary-navy)';
          chip.style.color = '#fff';
        } else {
          chip.style.background = '';
          chip.style.color = '';
        }
      });
    });

    this.setupFileUploader('titip-file-input', 'titip-foto-hidden', 'titip-preview-img');
    this.setupFileUploader('antar-file-input', 'antar-foto-hidden', 'antar-preview-img');
    this.setupFileUploader('st-file-input', 'st-foto-hidden', 'st-preview-img');
    this.setupFileUploader('lapor-file-input', 'lapor-foto-hidden', 'lapor-preview-img');
  },

  setupFileUploader(inputId, hiddenId, previewId) {
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);
    const preview = document.getElementById(previewId);
    if (!input) return;

    input.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async event => {
          const base64 = event.target.result;
          if (preview) {
            preview.src = base64;
            preview.style.display = 'block';
          }
          const uploadRes = await App.api('/api/upload', 'POST', { image_base64: base64 });
          if (uploadRes.ok && uploadRes.data.success) {
            if (hidden) hidden.value = uploadRes.data.file_url;
          } else {
            if (hidden) hidden.value = base64;
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
