const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

function createIcoFromPngs(pngBuffersWithSizes) {
  // pngBuffersWithSizes: [{ size: 32, buffer: Buffer }, ...]
  const numImages = pngBuffersWithSizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(numImages, 4); // Count

  let offset = 6 + numImages * 16;
  const dirEntries = [];

  for (const item of pngBuffersWithSizes) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 0); // Width
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // Image size in bytes
    entry.writeUInt32LE(offset, 12); // Offset to image data

    dirEntries.push(entry);
    offset += item.buffer.length;
  }

  const parts = [header, ...dirEntries, ...pngBuffersWithSizes.map((i) => i.buffer)];
  return Buffer.concat(parts);
}

async function run() {
  const input = 'C:/Users/Lucas/Desktop/logo pwa ca.png';
  const appFavicon = path.join(__dirname, '..', 'src', 'app', 'favicon.ico');
  const publicFavicon = path.join(__dirname, '..', 'public', 'favicon.ico');
  const appIcon32 = path.join(__dirname, '..', 'src', 'app', 'icon.png');
  const publicIcon32 = path.join(__dirname, '..', 'public', 'favicon-32x32.png');
  const publicIcon16 = path.join(__dirname, '..', 'public', 'favicon-16x16.png');

  console.log('Generating favicons from:', input);

  // Generate PNG sizes with guaranteed 4-channel RGBA (required by Turbopack / Rust image-rs)
  const [buf16, buf32, buf48] = await Promise.all([
    sharp(input).resize(16, 16, { fit: 'cover' }).ensureAlpha().png().toBuffer(),
    sharp(input).resize(32, 32, { fit: 'cover' }).ensureAlpha().png().toBuffer(),
    sharp(input).resize(48, 48, { fit: 'cover' }).ensureAlpha().png().toBuffer(),
  ]);

  // Save standalone PNG icons
  fs.writeFileSync(publicIcon16, buf16);
  fs.writeFileSync(publicIcon32, buf32);
  fs.writeFileSync(appIcon32, buf32); // Next.js App Router native icon convention
  console.log('✓ PNG favicons generated (16x16, 32x32)');

  // Pack into standard multi-resolution ICO file (16x16, 32x32, 48x48)
  const icoBuffer = createIcoFromPngs([
    { size: 16, buffer: buf16 },
    { size: 32, buffer: buf32 },
    { size: 48, buffer: buf48 },
  ]);

  fs.writeFileSync(appFavicon, icoBuffer);
  fs.writeFileSync(publicFavicon, icoBuffer);
  console.log('✓ Multi-resolution favicon.ico generated for App Router & Public:', icoBuffer.length, 'bytes');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

