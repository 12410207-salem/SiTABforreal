// Ensure uploads directory exists
const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 1x1 transparent PNG / sample placeholder
const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const sampleBuffer = Buffer.from(samplePngBase64, 'base64');

['sample_book.jpg', 'sample_algoritma.jpg', 'sample_charger.jpg', 'sample_pickup.jpg', 'sample_delivered.jpg', 'default_box.png'].forEach(f => {
  const p = path.join(uploadDir, f);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, sampleBuffer);
  }
});
console.log('Upload directory and placeholders initialized.');
