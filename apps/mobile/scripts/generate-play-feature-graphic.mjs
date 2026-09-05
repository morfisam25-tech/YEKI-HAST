import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../assets/store');
mkdirSync(outDir, { recursive: true });

const W = 1024;
const H = 500;
const clamp = (v, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v));

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbPng(width, height, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour, no alpha
  const scan = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    scan[row] = 0;
    rgb.copy(scan, row + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scan, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function ellipse(nx, ny, cx, cy, rx, ry) {
  const dx = (nx - cx) / rx;
  const dy = (ny - cy) / ry;
  return Math.sqrt(dx * dx + dy * dy);
}

function insideTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const s = (x1,y1,x2,y2,x3,y3) => (x1-x3)*(y2-y3)-(x2-x3)*(y1-y3);
  const d1 = s(px,py,ax,ay,bx,by);
  const d2 = s(px,py,bx,by,cx,cy);
  const d3 = s(px,py,cx,cy,ax,ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

const rgb = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const nx = (x + 0.5) / W;
    const ny = (y + 0.5) / H;
    const vignette = Math.min(1, Math.hypot(nx - 0.5, ny - 0.5) / 0.72);
    const warm = Math.exp(-Math.pow((nx - 0.46) / 0.43, 2) - Math.pow((ny - 0.70) / 0.55, 2));
    let r = 9 + 29 * warm - 4 * vignette;
    let g = 10 + 15 * warm - 4 * vignette;
    let b = 11 + 5 * warm - 4 * vignette;

    const leftD = ellipse(nx, ny, 0.40, 0.44, 0.22, 0.23);
    const rightD = ellipse(nx, ny, 0.61, 0.55, 0.17, 0.18);
    const left = leftD <= 1 || insideTriangle(nx, ny, 0.245, 0.58, 0.36, 0.61, 0.285, 0.73);
    const right = rightD <= 1 || insideTriangle(nx, ny, 0.68, 0.66, 0.79, 0.68, 0.73, 0.80);

    const glowL = Math.exp(-Math.pow(Math.max(leftD - 1, 0) / 0.08, 2));
    const glowR = Math.exp(-Math.pow(Math.max(rightD - 1, 0) / 0.08, 2));
    r += 52 * glowL + 28 * glowR;
    g += 25 * glowL + 19 * glowR;
    b += 7 * glowL + 8 * glowR;

    if (left) {
      const light = Math.max(0, Math.min(1, 0.62 - 0.65*(nx-0.40) - 0.72*(ny-0.44)));
      r = 188 + 66 * light;
      g = 132 + 88 * light;
      b = 63 + 112 * light;
    }
    if (right) {
      const light = Math.max(0, Math.min(1, 0.47 - 0.72*(nx-0.61) - 0.53*(ny-0.55)));
      r = 44 + 139 * light;
      g = 40 + 105 * light;
      b = 40 + 60 * light;
    }

    const floorGlow = Math.exp(-Math.pow((ny - 0.92) / 0.07, 2)) * Math.exp(-Math.pow((nx - 0.5) / 0.34, 2));
    r += 36 * floorGlow;
    g += 17 * floorGlow;
    b += 5 * floorGlow;

    const i = (y * W + x) * 3;
    rgb[i] = Math.round(clamp(r));
    rgb[i + 1] = Math.round(clamp(g));
    rgb[i + 2] = Math.round(clamp(b));
  }
}

const out = resolve(outDir, 'play-feature-graphic-1024x500.png');
writeFileSync(out, encodeRgbPng(W, H, rgb));
console.log(`generated ${out} (${W}x${H}, RGB/no-alpha)`);
