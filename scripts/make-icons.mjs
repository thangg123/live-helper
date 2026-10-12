// Sinh icon PNG cho extension: bi xanh nỉ, lõi trắng, chấm đỏ "đang live". Chạy: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'arena-live-helper', 'icons');
const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;

const FELT = [27, 102, 68];
const FELT_DEEP = [18, 72, 48];
const WHITE = [250, 249, 244];
const RED = [214, 40, 40];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Màu tại điểm (u, v) trong [0,1]², trả [r,g,b,a] hoặc null (trong suốt). */
function shade(u, v) {
  const dot = Math.hypot(u - 0.8, v - 0.2);
  if (dot < 0.15) return [...RED, 255];
  if (dot < 0.2) return null; // khe trong suốt quanh chấm đỏ
  const d = Math.hypot(u - 0.47, v - 0.53);
  if (d > 0.44) return null;
  if (d < 0.17) return [...WHITE, 255];
  const t = Math.min(1, Math.hypot(u - 0.35, v - 0.38) / 0.6);
  return [0, 1, 2].map((i) => Math.round(FELT[i] * (1 - t) + FELT_DEEP[i] * t)).concat(255);
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const n = SUPERSAMPLE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = shade((x + (sx + 0.5) / n) / size, (y + (sy + 0.5) / n) / size);
          if (!c) continue;
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const i = (y * size + x) * 4;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round(a / (n * n));
    }
  }
  return encodePng(size, px);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(OUT_DIR, `icon${size}.png`), render(size));
}
process.stdout.write(`Đã tạo ${SIZES.length} icon trong ${OUT_DIR}\n`);
