import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve(process.cwd(), "public/images/products");
const publicDir = resolve(process.cwd(), "public/images");
mkdirSync(out, { recursive: true });

const PALETTES = {
  cream: { top: "#f6efe4", bottom: "#eadfcf", glow: "#fff8ea", ink: "#2b211d" },
  blush: { top: "#f2e6df", bottom: "#e5d1c9", glow: "#fff3ea", ink: "#3a2525" },
  sage: { top: "#eceee5", bottom: "#d9dfd2", glow: "#f9fbef", ink: "#28302a" },
  cocoa: { top: "#efe3d3", bottom: "#dfcdb6", glow: "#fff4e2", ink: "#33251b" },
  rose: { top: "#f4e6e2", bottom: "#e3c9c8", glow: "#fff1ec", ink: "#3a2326" },
  linen: { top: "#f4efe7", bottom: "#e5dccc", glow: "#fffaf0", ink: "#2d2923" }
};

const shadow = (cx, cy, rx, ry, opacity = 0.16) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#3a2a22" opacity="${opacity}"/>`;

function frame(palette, art, detail = false) {
  const p = PALETTES[palette];
  const viewBox = detail ? "270 400 660 825" : "0 0 1200 1500";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1200" height="1500" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${p.top}"/>
      <stop offset="1" stop-color="${p.bottom}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="${p.glow}" stop-opacity="0.95"/>
      <stop offset="0.65" stop-color="${p.glow}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${p.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e2c793"/>
      <stop offset="0.45" stop-color="#b58b4a"/>
      <stop offset="1" stop-color="#8f6a35"/>
    </linearGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#d9b878"/>
      <stop offset="0.55" stop-color="#a9814c"/>
      <stop offset="1" stop-color="#7f5d30"/>
    </linearGradient>
    <linearGradient id="velvet" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#81283a"/>
      <stop offset="0.55" stop-color="#5c1826"/>
      <stop offset="1" stop-color="#3f0f1a"/>
    </linearGradient>
    <linearGradient id="ivory" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#fffaf0"/>
      <stop offset="1" stop-color="#ecdfc9"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e6a85c" stop-opacity="0.9"/>
      <stop offset="0.5" stop-color="#c07a32" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#8a4e1e" stop-opacity="0.9"/>
    </linearGradient>
    <pattern id="grain" width="6" height="6" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.7" fill="${p.ink}" opacity="0.05"/>
      <circle cx="4" cy="4" r="0.55" fill="${p.ink}" opacity="0.035"/>
    </pattern>
    <pattern id="linen" width="14" height="14" patternUnits="userSpaceOnUse">
      <path d="M0 7H14M7 0V14" stroke="${p.ink}" stroke-opacity="0.055" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="1500" fill="url(#bg)"/>
  <ellipse cx="600" cy="660" rx="560" ry="520" fill="url(#glow)"/>
  <path d="M250 1040V520c0-193 157-350 350-350s350 157 350 350v520" fill="none" stroke="url(#gold)" stroke-opacity="0.36" stroke-width="2"/>
  <path d="M278 1060V528c0-180 144-324 322-324s322 144 322 324v532" fill="none" stroke="url(#gold)" stroke-opacity="0.18" stroke-width="1"/>
  ${shadow(600, 1165, 320, 38, 0.13)}
  ${art}
  <rect width="1200" height="1500" fill="url(#grain)"/>
  <rect x="34" y="34" width="1132" height="1432" fill="none" stroke="url(#gold)" stroke-opacity="0.22"/>
</svg>`;
}

function ribbonKnot(cx, cy, scale = 1) {
  return `<g transform="translate(${cx} ${cy}) scale(${scale})">
    <path d="M0 8C-36 -14 -74 -8 -78 12c-4 23 32 34 78 12" fill="url(#gold)"/>
    <path d="M0 8C36 -14 74 -8 78 12c4 23-32 34-78 12" fill="url(#gold)"/>
    <rect x="-13" y="-2" width="26" height="24" rx="7" fill="url(#brass)"/>
    <path d="M-8 18 5 46l8-20" fill="none" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/>
    <path d="M8 18-5 46l-8-20" fill="none" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/>
  </g>`;
}

function rose(x, y, scale = 1, tone = "#9d4353") {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <circle r="46" fill="${tone}"/>
    <path d="M-40-10c6-30 32-46 58-40 30 7 44 34 34 58-9 22-34 36-58 28-22-8-34-26-34-46z" fill="${tone}" opacity="0.7"/>
    <path d="M-26-6c4-18 21-28 38-24 19 4 28 21 22 36-6 14-21 22-36 17-14-5-21-16-24-29z" fill="#c37786" opacity="0.85"/>
    <path d="M-12-4c3-9 11-14 20-12 9 2 14 10 11 18-3 7-10 11-18 9-7-2-11-8-13-15z" fill="#7d2d3d"/>
    <path d="M-44 22c-12 10-22 22-28 34" stroke="#5f6a4f" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M-58 42c-14-2-24-10-30-20 13-4 25-1 34 8" fill="#6d7758"/>
  </g>`;
}

function candle(x, y, scale, color = "url(#glass)", height = 230) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    ${shadow(0, height / 2 + 10, 78, 14, 0.16)}
    <rect x="-62" y="-${height / 2}" width="124" height="${height}" rx="18" fill="${color}"/>
    <rect x="-62" y="-${height / 2}" width="40" height="${height}" rx="18" fill="#fff" opacity="0.2"/>
    <ellipse cx="0" cy="-${height / 2}" rx="62" ry="16" fill="#f4d9b4"/>
    <ellipse cx="0" cy="-${height / 2}" rx="52" ry="11" fill="#caa06f" opacity="0.55"/>
    <path d="M0-${height / 2 + 4}v-30" stroke="#513723" stroke-width="4"/>
    <path d="M0-${height / 2 + 34}c-13-14 1-34 10-42 8 16 12 31-2 42-3 3-6 3-8 0z" fill="#f2b552"/>
    <path d="M0-${height / 2 + 34}c-5-8 0-18 5-24 4 9 5 17-1 24z" fill="#fff1c2"/>
    <rect x="-44" y="-12" width="88" height="52" rx="5" fill="#f7eddc" opacity="0.92"/>
    <path d="M-26 6h52M-26 17h34" stroke="#8a7259" stroke-width="3" stroke-linecap="round" opacity="0.65"/>
  </g>`;
}

/* 1. Rose Velvet Keepsake Box */
const keepsake = `<g>
  ${shadow(600, 1010, 280, 45, 0.2)}
  <g transform="translate(600 880)">
    <path d="M-250-70 0-170 250-70v220L0 250-250 150z" fill="url(#velvet)"/>
    <path d="M-250-70 0 30v220L-250 150z" fill="#4a1220"/>
    <path d="M250-70 0 30v220l250-100z" fill="#6b1f2e"/>
    <path d="M-250-70 0-170 250-70 0 30z" fill="#8a2e40"/>
    <path d="M-210-70 0 15 210-70 0-155z" fill="url(#linen)" opacity="0.16"/>
    <path d="M0-170v-36M0 30v220" stroke="url(#gold)" stroke-width="22" opacity="0.95"/>
    <path d="M-250-70 0 30 250-70" fill="none" stroke="url(#gold)" stroke-width="14" stroke-linejoin="round"/>
    ${ribbonKnot(0, -190, 0.9)}
    <path d="M-180 120c50-34 110-40 160-12" fill="none" stroke="#d4ae72" stroke-width="2" opacity="0.5"/>
  </g>
  ${rose(330, 950, 0.95, "#8f3445")}
  ${rose(858, 1010, 0.72, "#a44a5c")}
  <path d="M300 1050c-40 30-52 70-58 108" stroke="#5e6a50" stroke-width="4" fill="none" opacity="0.7"/>
</g>`;

/* 2. Celebration Treasures Hamper */
const hamper = `<g>
  ${shadow(600, 1090, 300, 44, 0.2)}
  <g transform="translate(600 960)">
    <path d="M-260-120h520v250l-260 130-260-130z" fill="url(#ivory)"/>
    <path d="M-260-120h520v40H-260z" fill="#d9c5a4"/>
    <path d="M-260 80h520" stroke="#c7ae87" stroke-width="3" opacity="0.7"/>
    <rect x="-260" y="-80" width="520" height="160" fill="url(#linen)" opacity="0.35"/>
    ${ribbonKnot(0, -150, 0.85)}
  </g>
  <g transform="translate(390 760)">
    <rect x="-58" y="-60" width="116" height="160" rx="14" fill="#8e5d3a"/>
    <ellipse cx="0" cy="-60" rx="58" ry="15" fill="#c18a5a"/>
    <ellipse cx="0" cy="-60" rx="48" ry="10" fill="#6d4428"/>
    <rect x="-38" y="-12" width="76" height="50" rx="4" fill="#efe1ca"/>
    <path d="M-22 4h44M-22 16h28" stroke="#8f6a48" stroke-width="3" stroke-linecap="round"/>
  </g>
  <g transform="translate(770 760)">
    <path d="M-80 80h160l-18-170h-124z" fill="url(#brass)"/>
    <path d="M-62-90h124" stroke="#6d4c26" stroke-width="3"/>
    <rect x="-44" y="-70" width="88" height="120" rx="4" fill="#5d3c22" opacity="0.45"/>
    <circle cx="-14" cy="-20" r="16" fill="#8d5c32"/>
    <circle cx="28" cy="10" r="16" fill="#8d5c32"/>
    <circle cx="4" cy="46" r="16" fill="#8d5c32"/>
  </g>
  <g transform="translate(620 790)">
    <rect x="-46" y="-100" width="92" height="190" rx="16" fill="#e8d3b2"/>
    <ellipse cx="0" cy="-100" rx="46" ry="12" fill="#caa980"/>
    <path d="M0-108v-20" stroke="#4a3524" stroke-width="4"/>
    <path d="M0-150c-8-10 0-22 6-28 5 10 8 20-2 28z" fill="#efb05c"/>
  </g>
  ${rose(890, 880, 0.62, "#a44a5c")}
</g>`;

/* 3. Amber Glass Candle Duo */
const candles = `<g>
  ${shadow(600, 1040, 300, 40, 0.18)}
  <g transform="translate(600 900)">
    <ellipse cx="0" cy="170" rx="315" ry="48" fill="url(#brass)" opacity="0.3"/>
    ${candle(-120, 20, 1, "url(#glass)", 280)}
    ${candle(120, -10, 0.82, "#bd8a4f", 230)}
    <path d="M-120 160c70 20 160 20 240-10" stroke="#8a6a3f" stroke-width="2" fill="none" opacity="0.4"/>
  </g>
  <path d="M350 700c-40 20-80 60-90 110" stroke="#5e6a50" stroke-width="3" fill="none" opacity="0.55"/>
  ${rose(895, 760, 0.6, "#9d4353")}
</g>`;

/* 4. Gilded Anniversary Frame */
const frameArt = `<g>
  ${shadow(600, 1110, 280, 36, 0.18)}
  <g transform="translate(600 840) rotate(-2)">
    <rect x="-230" y="-280" width="460" height="570" rx="6" fill="url(#gold)"/>
    <rect x="-202" y="-252" width="404" height="514" rx="3" fill="#6d4c2c"/>
    <rect x="-186" y="-236" width="372" height="482" fill="url(#ivory)"/>
    <rect x="-158" y="-208" width="316" height="340" fill="#d9c7b0"/>
    <path d="M-110 132V-18c0-52 48-94 106-94s106 42 106 94v150" fill="#b7a58e" opacity="0.7"/>
    <circle cx="-4" cy="-20" r="42" fill="#9c8870" opacity="0.75"/>
    <path d="M-4-58c26 0 46 20 46 46 0 12-4 22-12 30" fill="none" stroke="#f6edda" stroke-width="4" opacity="0.6"/>
    <rect x="-158" y="-208" width="316" height="340" fill="none" stroke="#fbf3e3" stroke-width="10"/>
    <path d="M-96 182h192M-60 206h120" stroke="#8d7356" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    <path d="M-230-280h460M-230 290h460" stroke="#f3ddb0" stroke-width="2" opacity="0.5"/>
    <path d="M-230-280l460 570M230-280l-460 570" stroke="#f3ddb0" stroke-width="1" opacity="0.18"/>
  </g>
  <path d="M290 1080c30-8 60-6 86 8" stroke="#5e6a50" stroke-width="3" fill="none" opacity="0.55"/>
  ${rose(890, 1040, 0.74, "#a44a5c")}
</g>`;

/* 5. Engraved Memory Locket */
const locket = `<g>
  ${shadow(600, 1140, 250, 36, 0.16)}
  <g transform="translate(600 880)">
    <path d="M-240-40c40-160 140-230 240-230S440-200 480-40" fill="none" stroke="url(#gold)" stroke-width="4" stroke-dasharray="2 8" opacity="0.75"/>
    <path d="M-170-330c-90 60-140 170-120 300 10 70 42 120 0 150-40 30-100-20-80-100 20-90 90-260 200-350z" fill="#7e2a3a" opacity="0.25"/>
    <circle cx="0" cy="-70" r="210" fill="url(#gold)"/>
    <circle cx="0" cy="-70" r="186" fill="#ecd7ae"/>
    <circle cx="0" cy="-70" r="160" fill="url(#gold)"/>
    <circle cx="0" cy="-70" r="130" fill="#7a2434"/>
    <circle cx="0" cy="-70" r="108" fill="#f1dfbe"/>
    <path d="M-40-100c0-22 18-40 40-40s40 18 40 40c0 18-12 32-28 38v30h-24v-30c-16-6-28-20-28-38z" fill="#97515d" opacity="0.5"/>
    <path d="M-54-10h108M-36 20h72M-22 48h44" stroke="#8f6a35" stroke-width="3" stroke-linecap="round" opacity="0.75"/>
    <circle cx="0" cy="-276" r="20" fill="none" stroke="url(#gold)" stroke-width="9"/>
    <path d="M0-70c-70 220-30 380 0 430 30-50 70-210 0-430z" fill="#a67c46" opacity="0.22"/>
  </g>
  <path d="M330 1000c60-20 110-8 150 30" stroke="#c9a46c" stroke-width="2" fill="none" opacity="0.6"/>
  ${rose(880, 1030, 0.66, "#8f3445")}
</g>`;

/* 6. Personalised Name Journal */
const journal = `<g>
  ${shadow(600, 1100, 300, 40, 0.18)}
  <g transform="translate(600 880) rotate(-4)">
    <rect x="-250" y="-280" width="500" height="560" rx="10" fill="#d8c9ad"/>
    <rect x="-268" y="-268" width="500" height="556" rx="10" fill="#e8dcc3"/>
    <rect x="-232" y="-300" width="440" height="560" rx="8" fill="#6b2130"/>
    <rect x="-232" y="-300" width="440" height="560" rx="8" fill="url(#linen)" opacity="0.3"/>
    <rect x="-232" y="-300" width="38" height="560" fill="#521823"/>
    <path d="M-212-250v460" stroke="#b58b4a" stroke-width="2" opacity="0.7"/>
    <path d="M-170 0h290M-170 36h190" stroke="#e2c793" stroke-width="2" opacity="0.5"/>
    <text x="-170" y="-90" font-family="Georgia, serif" font-size="42" letter-spacing="8" fill="#e6c98f">SREE</text>
    <path d="M-250 250c160 30 330 30 470-10" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.18"/>
  </g>
  <g transform="translate(820 1010) rotate(18)">
    <rect x="-160" y="-9" width="320" height="18" rx="9" fill="#2f2a24"/>
    <path d="M-160 0h-34l12-8v16z" fill="url(#gold)"/>
    <rect x="130" y="-11" width="52" height="22" rx="6" fill="url(#gold)"/>
  </g>
  <path d="M330 760c24-10 46-8 64 4" stroke="#5e6a50" stroke-width="3" fill="none" opacity="0.55"/>
</g>`;

/* 7. Cocoa the Teddy Bear */
const bear = `<g>
  ${shadow(600, 1140, 250, 40, 0.2)}
  <g transform="translate(600 900)">
    <ellipse cx="-145" cy="60" rx="100" ry="140" fill="#8b5f3f" transform="rotate(-22 -145 60)"/>
    <ellipse cx="145" cy="60" rx="100" ry="140" fill="#8b5f3f" transform="rotate(22 145 60)"/>
    <ellipse cx="0" cy="130" rx="160" ry="170" fill="#a8764f"/>
    <ellipse cx="0" cy="150" rx="98" ry="120" fill="#c79a6d"/>
    <circle cx="0" cy="-120" r="152" fill="#a8764f"/>
    <circle cx="-118" cy="-242" r="56" fill="#a8764f"/>
    <circle cx="-118" cy="-242" r="32" fill="#c79a6d"/>
    <circle cx="118" cy="-242" r="56" fill="#a8764f"/>
    <circle cx="118" cy="-242" r="32" fill="#c79a6d"/>
    <ellipse cx="0" cy="-78" rx="72" ry="56" fill="#d8b083"/>
    <ellipse cx="0" cy="-96" rx="28" ry="20" fill="#3b2a21"/>
    <path d="M0-78v20M-20-50c10 10 30 10 40 0" stroke="#3b2a21" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="-56" cy="-144" r="10" fill="#31231b"/>
    <circle cx="56" cy="-144" r="10" fill="#31231b"/>
    <circle cx="-53" cy="-147" r="3" fill="#fff" opacity="0.8"/>
    <circle cx="59" cy="-147" r="3" fill="#fff" opacity="0.8"/>
    <ellipse cx="-70" cy="-108" rx="26" ry="16" fill="#c98a83" opacity="0.5"/>
    <ellipse cx="70" cy="-108" rx="26" ry="16" fill="#c98a83" opacity="0.5"/>
    <ellipse cx="-62" cy="278" rx="58" ry="34" fill="#8b5f3f"/>
    <ellipse cx="62" cy="278" rx="58" ry="34" fill="#8b5f3f"/>
    <ellipse cx="-62" cy="278" rx="34" ry="20" fill="#c79a6d"/>
    <ellipse cx="62" cy="278" rx="34" ry="20" fill="#c79a6d"/>
    <path d="M-64-260c28-10 52-6 72 8" stroke="#6b452c" stroke-width="3" fill="none" opacity="0.4"/>
    ${ribbonKnot(0, 10, 0.55)}
  </g>
  ${rose(875, 1050, 0.55, "#a44a5c")}
</g>`;

/* 8. Linen Bunny Plush */
const bunny = `<g>
  ${shadow(600, 1140, 240, 36, 0.16)}
  <g transform="translate(600 910)">
    <ellipse cx="-62" cy="-340" rx="44" ry="158" fill="#d9cbb6" transform="rotate(-10 -62 -340)"/>
    <ellipse cx="62" cy="-340" rx="44" ry="158" fill="#d9cbb6" transform="rotate(10 62 -340)"/>
    <ellipse cx="-62" cy="-340" rx="20" ry="120" fill="#c9a9a0" opacity="0.55" transform="rotate(-10 -62 -340)"/>
    <ellipse cx="62" cy="-340" rx="20" ry="120" fill="#c9a9a0" opacity="0.55" transform="rotate(10 62 -340)"/>
    <ellipse cx="0" cy="120" rx="150" ry="190" fill="#e4d6c0"/>
    <ellipse cx="0" cy="150" rx="86" ry="120" fill="#f2e8d6"/>
    <circle cx="0" cy="-120" r="138" fill="#e4d6c0"/>
    <path d="M-40-150c8-14 24-14 32 0M8-150c8-14 24-14 32 0" fill="none" stroke="#4a3b30" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="0" cy="-104" rx="18" ry="13" fill="#c9a9a0"/>
    <path d="M0-92v12M-16-74c10 8 22 8 32 0" stroke="#4a3b30" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="0" cy="170" rx="58" ry="40" fill="#d9cbb6"/>
    <path d="M-120 50c-30 80-14 150 26 190M120 50c30 80 14 150-26 190" stroke="#cfc0a7" stroke-width="26" stroke-linecap="round" fill="none"/>
    <path d="M-150 260c0 24 20 44 44 44h212c24 0 44-20 44-44" fill="#d9cbb6"/>
  </g>
  <path d="M330 780c30-12 56-8 78 8" stroke="#5e6a50" stroke-width="3" fill="none" opacity="0.5"/>
  ${rose(875, 1010, 0.6, "#b56372")}
</g>`;

/* 9. Ivory Wedding Keepsake Set */
const wedding = `<g>
  ${shadow(600, 1110, 310, 44, 0.18)}
  <g transform="translate(600 960)">
    <path d="M-300-80h600v210l-300 130-300-130z" fill="url(#ivory)"/>
    <path d="M-300-80h600v34H-300z" fill="#ddcaab"/>
    <path d="M-300 20h600" stroke="#c7ae87" stroke-width="3" opacity="0.6"/>
    ${ribbonKnot(0, -110, 0.8)}
  </g>
  <g transform="translate(420 740)">
    <rect x="-58" y="-120" width="116" height="220" rx="8" fill="#f6eddc"/>
    <rect x="-44" y="-100" width="88" height="120" fill="none" stroke="#c9b391" stroke-width="2"/>
    <path d="M-28-64c14-30 42-30 56 0M-28-64c-2 24 12 44 28 44s30-20 28-44" fill="none" stroke="#b58b4a" stroke-width="3"/>
    <path d="M-32 50h64M-40 66h80" stroke="#b58b4a" stroke-width="2" opacity="0.6"/>
  </g>
  ${candle(700, 760, 0.6, "url(#ivory)", 210)}
  ${candle(800, 790, 0.48, "url(#ivory)", 180)}
  ${rose(330, 950, 0.6, "#b98b8b")}
  ${rose(878, 900, 0.55, "#b98b8b")}
</g>`;

/* 10. Gold Ribbon Gift Set */
const giftSet = `<g>
  ${shadow(600, 1080, 300, 42, 0.18)}
  <g transform="translate(600 900)">
    <ellipse cx="0" cy="180" rx="310" ry="46" fill="url(#brass)" opacity="0.3"/>
    <rect x="-300" y="120" width="600" height="30" rx="15" fill="url(#gold)"/>
    ${candle(-150, 30, 0.55, "url(#ivory)", 240)}
    ${candle(150, 30, 0.55, "url(#ivory)", 240)}
    <g transform="translate(0 110)">
      <path d="M-150-50h300l-22-80h-256z" fill="url(#brass)"/>
      <ellipse cx="-150" cy="-50" rx="24" ry="10" fill="#d7b679"/>
      <ellipse cx="150" cy="-50" rx="24" ry="10" fill="#d7b679"/>
      <ellipse cx="0" cy="120" rx="150" ry="24" fill="#8d6a3e" opacity="0.4"/>
    </g>
    <g transform="translate(0 240)">
      <path d="M-120-30h240l-18 80h-204z" fill="#e9dcc4"/>
      <path d="M-80-30v-50c0-34 28-62 62-62h36c34 0 62 28 62 62v50" fill="none" stroke="#b58b4a" stroke-width="3"/>
      ${ribbonKnot(0, -6, 0.45)}
    </g>
  </g>
  ${rose(880, 980, 0.58, "#9d4353")}
</g>`;

/* 11. Heritage Tea Set */
const tea = `<g>
  ${shadow(600, 1090, 300, 42, 0.18)}
  <g transform="translate(600 900)">
    <ellipse cx="0" cy="170" rx="300" ry="44" fill="#b58b4a" opacity="0.2"/>
    <g>
      <path d="M-110 150c-30-10-48-38-48-70 0-24 16-46 38-54-6-70 44-120 110-120 64 0 116 48 112 116 30 12 46 38 42 64-6 42-44 72-86 72z" fill="url(#ivory)"/>
      <path d="M-120-10c-40 0-64 28-64 56 0 34 26 60 62 60" fill="none" stroke="#e8dbc4" stroke-width="18"/>
      <path d="M112-20c46 4 70 34 64 68-6 30-30 48-58 50" fill="none" stroke="#e8dbc4" stroke-width="18"/>
      <ellipse cx="0" cy="-92" rx="46" ry="14" fill="#d9c7a8"/>
      <circle cx="0" cy="-118" r="16" fill="#e8dbc4"/>
      <path d="M-100 20c60 18 140 18 200 0" stroke="#d9c7a8" stroke-width="2" fill="none"/>
    </g>
    <g transform="translate(-185 200)">
      <ellipse cx="0" cy="0" rx="88" ry="22" fill="#e8dcc3"/>
      <path d="M-70 0c0 52 26 82 70 82s70-30 70-82" fill="url(#ivory)"/>
      <path d="M70 10c34 0 42 42 8 46" fill="none" stroke="#e8dbc4" stroke-width="12"/>
      <ellipse cx="0" cy="0" rx="56" ry="13" fill="#c9b692" opacity="0.6"/>
    </g>
    <g transform="translate(195 210) scale(0.86)">
      <ellipse cx="0" cy="0" rx="88" ry="22" fill="#e8dcc3"/>
      <path d="M-70 0c0 52 26 82 70 82s70-30 70-82" fill="url(#ivory)"/>
      <path d="M70 10c34 0 42 42 8 46" fill="none" stroke="#e8dbc4" stroke-width="12"/>
      <ellipse cx="0" cy="0" rx="56" ry="13" fill="#c9b692" opacity="0.6"/>
    </g>
  </g>
  <path d="M322 760c34-14 62-10 86 6" stroke="#5e6a50" stroke-width="3" fill="none" opacity="0.5"/>
</g>`;

/* 12. Scented Rose Gift Box */
const roseBox = `<g>
  ${shadow(600, 1100, 300, 40, 0.18)}
  <g transform="translate(600 940)">
    <path d="M-270-90h540v210l-270 120-270-120z" fill="#e9d8bf"/>
    <path d="M-270-90 0 30 270-90 0-210z" fill="#f7edda"/>
    <path d="M0 30v210l270-120V-90z" fill="#dcc7a8"/>
    <path d="M-270-90 0 30 270-90" fill="none" stroke="#b58b4a" stroke-width="3" opacity="0.7"/>
    <path d="M0 30v210" stroke="#b58b4a" stroke-width="2" opacity="0.5"/>
  </g>
  <g transform="translate(390 760)">
    <rect x="-60" y="-100" width="120" height="190" rx="18" fill="#d9a3a6"/>
    <ellipse cx="0" cy="-100" rx="60" ry="16" fill="#f0c9c5"/>
    <rect x="-42" y="-30" width="84" height="58" rx="4" fill="#f7edda"/>
    <path d="M-24-16h48M-24-4h30" stroke="#9a6a6a" stroke-width="3" stroke-linecap="round"/>
    <path d="M0-116v-18" stroke="#4a3524" stroke-width="3"/>
  </g>
  <g transform="translate(770 780) rotate(6)">
    <rect x="-85" y="-45" width="170" height="110" rx="14" fill="#f3e6d2"/>
    <path d="M-60-12h120M-60 8h84" stroke="#9a8368" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    <path d="M-85-45c30-18 60-18 90 0" fill="#ded0b8"/>
  </g>
  <g transform="translate(600 1010)">
    <path d="M-62-30h124l-12 90h-100z" fill="#e7d9c2"/>
    <ellipse cx="0" cy="-30" rx="62" ry="14" fill="#f7edda"/>
    <path d="M-38-12h76M-30 8h60" stroke="#b58b4a" stroke-width="2" opacity="0.5"/>
    ${ribbonKnot(0, -44, 0.38)}
  </g>
  ${rose(860, 1040, 0.8, "#a94f60")}
  ${rose(330, 880, 0.62, "#b56372")}
</g>`;

const products = {
  "rose-keepsake-box": { palette: "blush", art: keepsake },
  "celebrate-hamper": { palette: "cocoa", art: hamper },
  "amber-candle-duo": { palette: "cream", art: candles },
  "anniversary-photo-frame": { palette: "rose", art: frameArt },
  "engraved-memory-locket": { palette: "blush", art: locket },
  "personalised-journal": { palette: "linen", art: journal },
  "cocoa-bear": { palette: "cocoa", art: bear },
  "bunny-plush": { palette: "sage", art: bunny },
  "ivory-wedding-set": { palette: "cream", art: wedding },
  "gold-ribbon-gift-set": { palette: "linen", art: giftSet },
  "heritage-tea-set": { palette: "sage", art: tea },
  "rose-gift-box": { palette: "rose", art: roseBox }
};

for (const [slug, entry] of Object.entries(products)) {
  writeFileSync(resolve(out, `${slug}.svg`), frame(entry.palette, entry.art, false));
  writeFileSync(resolve(out, `${slug}-detail.svg`), frame(entry.palette, entry.art, true));
}

const hero = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200" width="1600" height="1200" role="img">
  <defs>
    <linearGradient id="hbg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#f3e9db"/>
      <stop offset="0.55" stop-color="#ead7c9"/>
      <stop offset="1" stop-color="#d9bdb4"/>
    </linearGradient>
    <radialGradient id="hglow" cx="0.6" cy="0.35" r="0.6">
      <stop offset="0" stop-color="#fff8ea" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#fff8ea" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hgold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e2c793"/>
      <stop offset="0.5" stop-color="#b58b4a"/>
      <stop offset="1" stop-color="#8f6a35"/>
    </linearGradient>
    <linearGradient id="hvelvet" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#81283a"/>
      <stop offset="0.55" stop-color="#5c1826"/>
      <stop offset="1" stop-color="#3f0f1a"/>
    </linearGradient>
    <linearGradient id="hivory" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0" stop-color="#fffaf0"/>
      <stop offset="1" stop-color="#e9d9bf"/>
    </linearGradient>
    <pattern id="hgrain" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.8" fill="#3a2a22" opacity="0.045"/>
      <circle cx="5" cy="5" r="0.6" fill="#3a2a22" opacity="0.035"/>
    </pattern>
  </defs>
  <rect width="1600" height="1200" fill="url(#hbg)"/>
  <ellipse cx="900" cy="480" rx="760" ry="640" fill="url(#hglow)"/>
  <path d="M690 1030V420c0-210 170-380 380-380s380 170 380 380v610" fill="#f6eddc" opacity="0.45"/>
  <path d="M710 1030V428c0-198 160-358 358-358s358 160 358 358v602" fill="none" stroke="url(#hgold)" stroke-opacity="0.5" stroke-width="2"/>
  <path d="M300 1020h1100" stroke="url(#hgold)" stroke-opacity="0.35" stroke-width="2"/>
  <ellipse cx="960" cy="1025" rx="470" ry="50" fill="#4a2f26" opacity="0.12"/>

  <g transform="translate(960 780)">
    <path d="M-330-80 0-220 330-80v300L0 380-330 220z" fill="url(#hvelvet)"/>
    <path d="M-330-80 0 60v320L-330 220z" fill="#4a1220"/>
    <path d="M330-80 0 60v320l330-160z" fill="#6b1f2e"/>
    <path d="M-330-80 0-220 330-80 0 60z" fill="#8a2e40"/>
    <path d="M0-220v-52M0 60v320" stroke="url(#hgold)" stroke-width="26"/>
    <path d="M-330-80 0 60 330-80" fill="none" stroke="url(#hgold)" stroke-width="18" stroke-linejoin="round"/>
    <g transform="translate(0 -252) scale(1.15)">
      <path d="M0 8C-36 -14 -74 -8 -78 12c-4 23 32 34 78 12" fill="url(#hgold)"/>
      <path d="M0 8C36 -14 74 -8 78 12c4 23-32 34-78 12" fill="url(#hgold)"/>
      <rect x="-13" y="-2" width="26" height="24" rx="7" fill="#a9814c"/>
    </g>
    <path d="M-240 190c70-46 150-52 220-14" fill="none" stroke="#d4ae72" stroke-width="2" opacity="0.45"/>
  </g>

  <g transform="translate(450 880)">
    <ellipse cx="0" cy="150" rx="170" ry="24" fill="#3a2a22" opacity="0.12"/>
    <rect x="-92" y="-40" width="184" height="200" rx="10" fill="url(#hivory)"/>
    <rect x="-92" y="-40" width="184" height="34" fill="#dbc6a4"/>
    <path d="M-92 30h184" stroke="#c7ae87" stroke-width="2" opacity="0.7"/>
    <ellipse cx="-46" cy="-70" rx="44" ry="16" fill="#e8d3b2"/>
    <path d="M-46-78v-22" stroke="#4a3524" stroke-width="4"/>
    <path d="M-46-120c-10-12 0-26 8-34 6 12 10 24-3 34z" fill="#efb05c"/>
    <ellipse cx="52" cy="-58" rx="36" ry="42" fill="#b98e5f"/>
    <path d="M28-68h48M34-48h36" stroke="#8a5f38" stroke-width="3" opacity="0.6"/>
    <g transform="translate(0 120) scale(0.7)">
      <path d="M0 8C-36 -14 -74 -8 -78 12c-4 23 32 34 78 12" fill="url(#hgold)"/>
      <path d="M0 8C36 -14 74 -8 78 12c4 23-32 34-78 12" fill="url(#hgold)"/>
      <rect x="-13" y="-2" width="26" height="24" rx="7" fill="#a9814c"/>
    </g>
  </g>

  <g transform="translate(1320 900)">
    <ellipse cx="0" cy="120" rx="120" ry="20" fill="#3a2a22" opacity="0.12"/>
    <rect x="-58" y="-60" width="116" height="180" rx="14" fill="#c07a32" opacity="0.9"/>
    <ellipse cx="0" cy="-60" rx="58" ry="15" fill="#f4d9b4"/>
    <ellipse cx="0" cy="-60" rx="48" ry="10" fill="#a87543"/>
    <path d="M0-72v-22" stroke="#4a3524" stroke-width="4"/>
    <path d="M0-118c-10-12 0-26 8-34 6 12 10 24-3 34z" fill="#efb05c"/>
    <rect x="-40" y="-16" width="80" height="48" rx="4" fill="#f7eddc" opacity="0.9"/>
    <path d="M-24 0h48M-24 12h30" stroke="#8a7259" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
  </g>

  <g transform="translate(250 990) scale(1.1)">
    <circle r="46" fill="#8f3445"/>
    <path d="M-40-10c6-30 32-46 58-40 30 7 44 34 34 58-9 22-34 36-58 28-22-8-34-26-34-46z" fill="#9d4353" opacity="0.75"/>
    <path d="M-26-6c4-18 21-28 38-24 19 4 28 21 22 36-6 14-21 22-36 17-14-5-21-16-24-29z" fill="#c37786"/>
    <path d="M-44 22c-12 10-22 22-28 34" stroke="#5f6a4f" stroke-width="4" fill="none" stroke-linecap="round"/>
  </g>
  <g transform="translate(1440 760) scale(0.8)">
    <circle r="46" fill="#9d4353"/>
    <path d="M-26-6c4-18 21-28 38-24 19 4 28 21 22 36-6 14-21 22-36 17-14-5-21-16-24-29z" fill="#c37786"/>
  </g>
  <rect width="1600" height="1200" fill="url(#hgrain)"/>
  <rect x="28" y="28" width="1544" height="1144" fill="none" stroke="url(#hgold)" stroke-opacity="0.25"/>
</svg>`;

writeFileSync(resolve(publicDir, "hero.svg"), hero);

console.log(`Generated ${Object.keys(products).length * 2} product illustrations and the hero image in ${out}`);
