// ساخت آیکون‌های اکستنشن Zabansaz Apex با sharp
// آیکون: پس‌زمینه گرادیان بنفش/صورتی + نماد بریل ⠿ (سه‌نقطه)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, 'icons');
if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

// SVG با گرادیان شعاعی و سه نقطه‌ی بریل
function svgFor(size) {
  // اندازه‌ی نقطه‌ها و جایگاه بر اساس سایز مقیاس‌پذیر است.
  const s = size;
  const r = s * 0.13; // شعاع هر نقطه
  const cx1 = s * 0.36;
  const cx2 = s * 0.64;
  const cy1 = s * 0.36;
  const cy2 = s * 0.50;
  const cy3 = s * 0.64;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset="0.55" stop-color="#a855f7"/>
      <stop offset="1" stop-color="#db2777"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.25" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="ds" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${(s * 0.02).toFixed(2)}"/>
      <feOffset dx="0" dy="${(s * 0.02).toFixed(2)}" result="o"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect x="0" y="0" width="${s}" height="${s}" rx="${(s * 0.22).toFixed(2)}" ry="${(s * 0.22).toFixed(2)}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${s}" height="${s}" rx="${(s * 0.22).toFixed(2)}" ry="${(s * 0.22).toFixed(2)}" fill="url(#glow)"/>

  <!-- سه نقطه‌ی بریل ⠿ با درخشش -->
  <g filter="url(#ds)" fill="#ffffff">
    <circle cx="${cx1.toFixed(2)}" cy="${cy1.toFixed(2)}" r="${r.toFixed(2)}"/>
    <circle cx="${cx2.toFixed(2)}" cy="${cy1.toFixed(2)}" r="${r.toFixed(2)}"/>
    <circle cx="${cx1.toFixed(2)}" cy="${cy2.toFixed(2)}" r="${r.toFixed(2)}"/>
    <circle cx="${cx2.toFixed(2)}" cy="${cy2.toFixed(2)}" r="${r.toFixed(2)}"/>
    <circle cx="${cx1.toFixed(2)}" cy="${cy3.toFixed(2)}" r="${r.toFixed(2)}"/>
    <circle cx="${cx2.toFixed(2)}" cy="${cy3.toFixed(2)}" r="${r.toFixed(2)}"/>
  </g>
</svg>`;
}

async function build() {
  const sizes = [16, 32, 48, 128];
  for (const sz of sizes) {
    const svg = Buffer.from(svgFor(sz));
    const out = path.join(ICONS_DIR, `icon${sz}.png`);
    await sharp(svg, { density: 384 })
      .resize(sz, sz, { fit: 'cover' })
      .png()
      .toFile(out);
    console.log('built', out, sz + 'x' + sz);
  }

  // همچنین یک icon.png بزرگ برای استفاده‌ی عمومی
  const big = Buffer.from(svgFor(256));
  await sharp(big, { density: 384 }).resize(256, 256).png().toFile(path.join(ICONS_DIR, 'icon.png'));
  console.log('built icon.png 256x256');
}

build().then(() => {
  console.log('DONE');
}).catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
