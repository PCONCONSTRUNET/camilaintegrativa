const sharp = require('sharp');
const path = require('path');

async function run() {
  const publicDir = path.join(__dirname, '..', 'public');
  const input = path.join(publicDir, 'icone-c.png');

  console.log('Reading input:', input);

  // 1. icon-192.png
  await sharp(input)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Generated icon-192.png');

  // 2. icon-512.png
  await sharp(input)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  // 3. apple-touch-icon.png
  await sharp(input)
    .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 4. icon-maskable-512.png
  const innerSize = Math.round(512 * 0.8);
  const innerBuffer = await sharp(input)
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: innerBuffer, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-512.png'));
  console.log('Generated icon-maskable-512.png');

  console.log('All icons generated successfully!');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
