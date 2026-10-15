// يولّد أيقونة iOS (1024 بدون شفافية) وشاشة البداية من الشعار المتجه
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/favicon.svg').toString();
// Apple تقص الزوايا بنفسها، فالأيقونة مربعة كاملة وبلا قناة شفافية
const square = Buffer.from(svg.replace('rx="112"', 'rx="0"'));
const dir = 'ios/App/App/Assets.xcassets';
await sharp(square).resize(1024, 1024).flatten({ background: '#0f4d3a' }).removeAlpha().png().toFile(`${dir}/AppIcon.appiconset/AppIcon-512@2x.png`);
// شاشة البداية: الشعار في المنتصف على خلفية بلون التطبيق
const logo = await sharp(Buffer.from(svg)).resize(640, 640).png().toBuffer();
const splash = await sharp({ create: { width: 2732, height: 2732, channels: 3, background: '#0f4d3a' } })
  .composite([{ input: logo, gravity: 'center' }]).png().toBuffer();
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) await sharp(splash).toFile(`${dir}/Splash.imageset/${f}`);
console.log('iOS icon and splash generated');
