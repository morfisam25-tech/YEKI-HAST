import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../assets/generated');
mkdirSync(outDir, { recursive: true });

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * clamp(t);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

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

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scan = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    scan[row] = 0;
    rgba.copy(scan, row + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scan, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ellipseValue(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return Math.sqrt(dx * dx + dy * dy) - 1;
}

function triangleMask(x, y, ax, ay, bx, by, cx, cy) {
  const s1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const s2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const s3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
  const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
  return !(hasNeg && hasPos) ? 1 : 0;
}

function pseudoNoise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return (n - Math.floor(n)) * 2 - 1;
}

function sample(nx, ny, transparentBackground = false, monochrome = false) {
  const aa = 0.0022;

  const leftBase = ellipseValue(nx, ny, 0.385, 0.43, 0.255, 0.225);
  const leftCut = ellipseValue(nx, ny, 0.565, 0.47, 0.145, 0.16);
  const leftBody = smoothstep(aa, -aa, leftBase) * (1 - smoothstep(aa, -aa, leftCut));
  const leftTail = triangleMask(nx, ny, 0.245, 0.565, 0.355, 0.61, 0.285, 0.69);
  const leftTailFade = smoothstep(0.11, 0.0, Math.hypot(nx - 0.305, ny - 0.61));
  const leftMask = clamp(Math.max(leftBody, leftTail * leftTailFade));

  const rightBase = ellipseValue(nx, ny, 0.66, 0.535, 0.195, 0.175);
  const rightBody = smoothstep(aa, -aa, rightBase);
  const rightTail = triangleMask(nx, ny, 0.705, 0.63, 0.82, 0.64, 0.755, 0.725);
  const rightTailFade = smoothstep(0.12, 0.0, Math.hypot(nx - 0.765, ny - 0.67));
  const rightMask = clamp(Math.max(rightBody, rightTail * rightTailFade));

  const markMask = Math.max(leftMask, rightMask);

  if (monochrome) {
    return [255, 255, 255, Math.round(255 * markMask)];
  }

  let r = 9;
  let g = 10;
  let b = 11;
  let a = transparentBackground ? 0 : 255;

  if (!transparentBackground) {
    const centerGlow = Math.exp(-Math.pow(Math.hypot(nx - 0.51, ny - 0.49) / 0.54, 2) * 2.2);
    const floorGlow = Math.exp(-Math.pow((ny - 0.86) / 0.15, 2)) * Math.exp(-Math.pow((nx - 0.5) / 0.52, 2));
    const vignette = clamp(Math.hypot(nx - 0.5, ny - 0.5) / 0.72);
    r = 10 + 8 * centerGlow + 24 * floorGlow - 5 * vignette;
    g = 11 + 7 * centerGlow + 13 * floorGlow - 5 * vignette;
    b = 12 + 5 * centerGlow + 4 * floorGlow - 5 * vignette;

    const edge = Math.min(nx, ny, 1 - nx, 1 - ny);
    const rim = Math.exp(-Math.pow((edge - 0.035) / 0.009, 2));
    r += 55 * rim;
    g += 31 * rim;
    b += 8 * rim;
  }

  const leftGlow = Math.exp(-Math.pow(Math.max(leftBase, 0) / 0.035, 2)) * (1 - leftMask);
  const rightGlow = Math.exp(-Math.pow(Math.max(rightBase, 0) / 0.035, 2)) * (1 - rightMask);
  const glow = clamp((leftGlow + rightGlow) * 0.46);
  if (!transparentBackground) {
    r += 120 * glow;
    g += 66 * glow;
    b += 16 * glow;
  }

  if (leftMask > 0) {
    const dx = (nx - 0.385) / 0.255;
    const dy = (ny - 0.43) / 0.225;
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, dx * dx + dy * dy)));
    const light = clamp((-0.38 * dx - 0.65 * dy + 0.92 * nz + 0.3) / 1.7);
    const innerWarm = Math.exp(-Math.pow((nx - 0.56) / 0.09, 2) - Math.pow((ny - 0.48) / 0.17, 2));
    const tex = pseudoNoise(Math.floor(nx * 900), Math.floor(ny * 900)) * 3.2;
    const lr = mix(176, 255, light) + 30 * innerWarm + tex;
    const lg = mix(128, 238, light) + 15 * innerWarm + tex * 0.55;
    const lb = mix(68, 205, light) + 4 * innerWarm;
    r = mix(r, lr, leftMask);
    g = mix(g, lg, leftMask);
    b = mix(b, lb, leftMask);
    a = transparentBackground ? Math.max(a, Math.round(255 * leftMask)) : 255;
  }

  if (rightMask > 0) {
    const dx = (nx - 0.66) / 0.195;
    const dy = (ny - 0.535) / 0.175;
    const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, dx * dx + dy * dy)));
    const light = clamp((-0.74 * dx - 0.42 * dy + 0.7 * nz + 0.12) / 1.5);
    const innerWarm = Math.exp(-Math.pow((nx - 0.57) / 0.08, 2) - Math.pow((ny - 0.5) / 0.15, 2));
    const tex = pseudoNoise(Math.floor(nx * 850 + 17), Math.floor(ny * 850 + 31)) * 2.5;
    const rr = mix(35, 199, light) + 56 * innerWarm + tex;
    const rg = mix(36, 155, light) + 33 * innerWarm + tex * 0.6;
    const rb = mix(37, 96, light) + 8 * innerWarm;
    r = mix(r, rr, rightMask);
    g = mix(g, rg, rightMask);
    b = mix(b, rb, rightMask);
    a = transparentBackground ? Math.max(a, Math.round(255 * rightMask)) : 255;
  }

  return [
    Math.round(clamp(r, 0, 255)),
    Math.round(clamp(g, 0, 255)),
    Math.round(clamp(b, 0, 255)),
    a,
  ];
}

function render(size, options = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const [r, g, b, a] = sample(nx, ny, options.transparentBackground, options.monochrome);
      const i = (y * size + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return encodePng(size, size, rgba);
}

const outputs = [
  ['app-icon.png', 1024, {}],
  ['android-adaptive-foreground.png', 1024, { transparentBackground: true }],
  ['android-monochrome.png', 1024, { transparentBackground: true, monochrome: true }],
  ['play-store-icon.png', 512, {}],
];

for (const [name, size, options] of outputs) {
  const file = resolve(outDir, name);
  writeFileSync(file, render(size, options));
  console.log(`generated ${file} (${size}x${size})`);
}
