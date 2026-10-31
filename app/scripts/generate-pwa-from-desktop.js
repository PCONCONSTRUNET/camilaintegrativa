const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function generate() {
  const input = 'C:/Users/Lucas/Desktop/logo pwa ca.png';
  const publicDir = path.join(__dirname, '..', 'public');

  if (!fs.existsSync(input)) {
    throw new Error('Arquivo não encontrado: ' + input);
  }

  console.log('Origem do logo PWA:', input);

  // 1. icon-192.png (192x192)
  await sharp(input)
    .resize(192, 192, { fit: 'cover' })
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('✓ icon-192.png gerado');

  // 2. icon-512.png (512x512)
  await sharp(input)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('✓ icon-512.png gerado');

  // 3. apple-touch-icon.png (180x180)
  await sharp(input)
    .resize(180, 180, { fit: 'cover' })
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ apple-touch-icon.png gerado');

  // 4. icon-maskable-512.png (512x512 com 20% safe-zone para Android)
  const innerSize = Math.round(512 * 0.82); // 420px
  const innerBuffer = await sharp(input)
    .resize(innerSize, innerSize, { fit: 'contain' })
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
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'icon-maskable-512.png'));
  console.log('✓ icon-maskable-512.png gerado');

  // 5. icone-c.png (atualizado para manter consistência no OneSignal e sidebar)
  await sharp(input)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 95 })
    .toFile(path.join(publicDir, 'icone-c.png'));
  console.log('✓ icone-c.png atualizado');

  console.log('Todos os ícones do PWA foram atualizados com sucesso com o novo logo!');
}

generate().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});

