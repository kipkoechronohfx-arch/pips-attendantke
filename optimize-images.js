const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const dir = __dirname;
const images = ['avatar.png', 'dubai_bg.png', 'favicon.png', 'justmarkets.png', 'xm.png', 'preview.png', 'image.png'];

async function optimizeImages() {
  for (const file of images) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${file} - not found`);
      continue;
    }
    
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    const tempPath = path.join(dir, base + '.webp');
    try {
      await sharp(filePath)
        .webp({ quality: 80 })
        .toFile(tempPath);
      
      const origStats = fs.statSync(filePath);
      const newStats = fs.statSync(tempPath);
      
      console.log(`${file}: ${(origStats.size / 1024).toFixed(1)}KB -> ${base}.webp: ${(newStats.size / 1024).toFixed(1)}KB`);
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }
}

optimizeImages();
