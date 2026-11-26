const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

// Map of friendly routes to corresponding screen IDs
const routes = {
  'login.html': 'L-01',
  'dashboard-mahasiswa.html': 'L-02',
  'titip-barang.html': 'L-03',
  'pesan-antar.html': 'L-04',
  'lacak-status.html': 'L-05',
  'notifikasi.html': 'L-06',
  'riwayat.html': 'L-07',
  'dashboard-kurir.html': 'L-08',
  'serah-terima.html': 'L-09',
  'lapor-kehilangan.html': 'L-10',
  'beri-rating.html': 'L-11',
  'dashboard-admin.html': 'L-12',
  'register.html': 'L-13',
  'verifikasi-email.html': 'L-14',
  'register-kurir.html': 'L-15'
};

const indexContent = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

for (const [filename, screenId] of Object.entries(routes)) {
  // Replace the default active screen with the target screen
  let modified = indexContent
    .replace('id="L-01" class="app-screen active"', 'id="L-01" class="app-screen"')
    .replace(`id="${screenId}" class="app-screen"`, `id="${screenId}" class="app-screen active"`);

  fs.writeFileSync(path.join(publicDir, filename), modified, 'utf8');
}

console.log('Created standalone route HTML files for all 15 screens.');
