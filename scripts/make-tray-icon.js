'use strict';

// Tray uchun 32x32 qor parchasi PNG ikonkasini yaratadi (tashqi paketlarsiz).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = path.join(__dirname, '..', 'assets');
const OUT_FILE = path.join(OUT_DIR, 'tray.png');
const SIZE = 32;
const SS = 4;
const N = SIZE * SS;
const PIXELS_PER_UNIT = N / 2;

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buffer.length; i++) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  let t = length2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / length2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px;
  const cy = ay + dy * t - py;
  return Math.sqrt(cx * cx + cy * cy);
}

function buildSegments() {
  const segments = [];
  const armLen = 0.86;
  const armStart = 0.08;

  for (let k = 0; k < 6; k++) {
    const angle = (k * Math.PI) / 3;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const point = (r) => [ca * r, sa * r];

    const [sx, sy] = point(armStart);
    const [ex, ey] = point(armLen);
    segments.push([sx, sy, ex, ey]);

    for (const [base, len] of [
      [0.46, 0.22],
      [0.66, 0.16],
    ]) {
      for (const side of [-1, 1]) {
        const branchAngle = angle + side * 0.62;
        const [bx, by] = point(base);
        const tx = bx + Math.cos(branchAngle) * len;
        const ty = by + Math.sin(branchAngle) * len;
        segments.push([bx, by, tx, ty]);
      }
    }
  }

  return segments;
}

function render() {
  const segments = buildSegments();
  const halfWidth = 0.062;
  const accum = new Float64Array(N * N);

  for (let y = 0; y < N; y++) {
    const py = ((y + 0.5) / N) * 2 - 1;
    for (let x = 0; x < N; x++) {
      const px = ((x + 0.5) / N) * 2 - 1;

      let best = Infinity;
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        const d = segmentDistance(px, py, s[0], s[1], s[2], s[3]);
        if (d < best) best = d;
      }

      let coverage = (halfWidth - best) * PIXELS_PER_UNIT + 0.5;
      const center = Math.sqrt(px * px + py * py);
      if (center < 0.09) coverage = Math.max(coverage, (0.09 - center) * PIXELS_PER_UNIT + 0.5);
      accum[y * N + x] = coverage < 0 ? 0 : coverage > 1 ? 1 : coverage;
    }
  }

  // 4x4 supersampling -> 32x32
  const raw = Buffer.alloc(SIZE * SIZE * 4);
  const rowLength = SIZE * 4 + 1;
  const scanlines = Buffer.alloc(rowLength * SIZE);

  for (let y = 0; y < SIZE; y++) {
    scanlines[y * rowLength] = 0;
    for (let x = 0; x < SIZE; x++) {
      let sum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          sum += accum[(y * SS + sy) * N + (x * SS + sx)];
        }
      }
      const alpha = sum / (SS * SS);
      const offset = y * rowLength + 1 + x * 4;
      // och ko'k-oq rang
      scanlines[offset] = 234;
      scanlines[offset + 1] = 243;
      scanlines[offset + 2] = 255;
      scanlines[offset + 3] = Math.round(alpha * 255);
      raw[(y * SIZE + x) * 4 + 3] = Math.round(alpha * 255);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, png);
  console.log('tray icon ->', OUT_FILE, png.length, 'bytes');
}

render();
