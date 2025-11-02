import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, '..', 'public', 'icons');

const ICONS = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
];

const COLORS = {
  background: hexToRgb('#0f172a'),
  primary: hexToRgb('#38bdf8'),
  highlight: hexToRgb('#f472b6'),
  white: hexToRgb('#ffffff')
};

const crcTable = buildCrcTable();

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
    255
  ];
}

function lerpChannel(start, end, t) {
  return Math.round(start + (end - start) * t);
}

function mixColors(colorA, colorB, t) {
  return [
    lerpChannel(colorA[0], colorB[0], t),
    lerpChannel(colorA[1], colorB[1], t),
    lerpChannel(colorA[2], colorB[2], t),
    lerpChannel(colorA[3], colorB[3], t)
  ];
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  crcBuffer.writeUInt32BE(crc, 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function createIHDR(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer.writeUInt8(8, 8); // bit depth
  buffer.writeUInt8(6, 9); // color type RGBA
  buffer.writeUInt8(0, 10); // compression
  buffer.writeUInt8(0, 11); // filter
  buffer.writeUInt8(0, 12); // interlace
  return buffer;
}

function createPixelData(size, maskable) {
  const bytesPerPixel = 4;
  const stride = size * bytesPerPixel + 1; // filter byte per row
  const buffer = Buffer.alloc(stride * size);
  const center = (size - 1) / 2;
  const radius = size * 0.48;
  const softEdge = size * 0.04;
  const orbRadius = size * 0.28;

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * stride;
    buffer[rowStart] = 0; // filter type 0

    const verticalT = y / Math.max(1, size - 1);
    for (let x = 0; x < size; x += 1) {
      const offset = rowStart + 1 + x * bytesPerPixel;
      const horizontalT = x / Math.max(1, size - 1);

      // Background vertical gradient
      let baseColor = mixColors(
        COLORS.background,
        COLORS.primary,
        Math.pow(verticalT, 0.75) * 0.75 + 0.15
      );

      // Add diagonal highlight bias
      const diagonalT = (x + y) / (2 * Math.max(1, size - 1));
      if (diagonalT < 0.6) {
        const glowStrength = Math.pow(0.6 - diagonalT, 2);
        baseColor = mixColors(baseColor, COLORS.highlight, glowStrength * 0.35);
      }

      // Central orb glow
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < orbRadius) {
        const innerT = 1 - distance / orbRadius;
        baseColor = mixColors(baseColor, COLORS.white, innerT * 0.4);
      }

      let alpha = 255;
      if (maskable) {
        if (distance > radius) {
          alpha = 0;
        } else if (distance > radius - softEdge) {
          const edgeT = (distance - (radius - softEdge)) / softEdge;
          alpha = Math.round(255 * (1 - edgeT));
        }
      }

      buffer[offset] = baseColor[0];
      buffer[offset + 1] = baseColor[1];
      buffer[offset + 2] = baseColor[2];
      buffer[offset + 3] = alpha;
    }
  }

  return buffer;
}

async function generateIcon({ name, size, maskable }) {
  const raw = createPixelData(size, maskable);
  const compressed = deflateSync(raw, { level: 9 });

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = createChunk('IHDR', createIHDR(size, size));
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  const pngBuffer = Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
  const outputPath = join(OUTPUT_DIR, name);
  await writeFile(outputPath, pngBuffer);
  console.log(`generated ${name}`);
}

await mkdir(OUTPUT_DIR, { recursive: true });

for (const icon of ICONS) {
  await generateIcon(icon);
}

console.log('PWA icons generated.');
