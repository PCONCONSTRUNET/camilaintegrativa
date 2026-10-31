const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function processOg() {
  const input = 'C:/Users/Lucas/Desktop/logo opengraph.png';
  const outPng = path.join(__dirname, '..', 'public', 'og-image.png');
  const outJpg = path.join(__dirname, '..', 'public', 'og-image.jpg');
  const appOg = path.join(__dirname, '..', 'src', 'app', 'opengraph-image.png');

  if (!fs.existsSync(input)) {
    throw new Error('Arquivo de entrada não encontrado: ' + input);
  }

  // 1200x630 PNG
  await sharp(input)
    .resize(1200, 630, { fit: 'cover' })
    .png({ quality: 90, compressionLevel: 8 })
    .toFile(outPng);

  // 1200x630 JPG (super lightweight for WhatsApp preview cards)
  await sharp(input)
    .resize(1200, 630, { fit: 'cover' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outJpg);

  // Next.js convention opengraph-image.png
  await sharp(input)
    .resize(1200, 630, { fit: 'cover' })
    .png({ quality: 90, compressionLevel: 8 })
    .toFile(appOg);

  const statPng = fs.statSync(outPng);
  const statJpg = fs.statSync(outJpg);
  console.log('Generated og-image.png:', statPng.size, 'bytes');
  console.log('Generated og-image.jpg:', statJpg.size, 'bytes');
}

processOg().catch((err) => {
  console.error(err);
  process.exit(1);
});
