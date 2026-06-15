const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const dir = __dirname;
const images = ['avatar.png', 'dubai_bg.png', 'favicon.png', 'justmarkets.png', 'xm.png', 'preview.png'];

async function optimizeImages() {
  for (const file of images) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${file} - not found`);
      continue;
    }
    
    // We will overwrite the PNG files with optimized ones, and also create WebP versions.
    // For drop-in replacement without editing all HTML files immediately, let's compress the PNGs heavily first.
    // Sharp can heavily compress PNGs.
    const tempPath = path.join(dir, 'temp_' + file);
    try {
      await sharp(filePath)
        .png({ quality: 70, compressionLevel: 9 })
        .toFile(tempPath);
      
      const origStats = fs.statSync(filePath);
      const newStats = fs.statSync(tempPath);
      
      console.log(`${file}: ${(origStats.size / 1024).toFixed(1)}KB -> ${(newStats.size / 1024).toFixed(1)}KB`);
      
      // Replace original
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }
}

optimizeImages();
