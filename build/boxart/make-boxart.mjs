// Renders build/boxart/nostalgiaconsole-boxart.png (600x800), the cover
// Sunshine shows in Moonlight: just the logo and wordmark on a light
// background. Needs google-chrome (headless).
//   node build/boxart/make-boxart.mjs

import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const logo = readFileSync(join(here, '..', '..', 'src', 'renderer', 'logo.svg'), 'utf8');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:600px;height:800px;overflow:hidden}
body{font-family:"Segoe UI","Noto Sans","Ubuntu",sans-serif;
  background:radial-gradient(120% 90% at 50% 38%,#ffffff 0%,#f3f5f6 48%,#d9dee1 100%);
  display:flex;flex-direction:column;align-items:center;justify-content:center}
.logo{width:430px;height:430px;margin-top:-30px}
.logo svg{width:100%;height:100%}
.word{margin-top:10px;font-size:46px;font-weight:300;letter-spacing:2px;color:#8a9196}
.word b{font-weight:300;color:#5cb31d}
</style></head><body>
<div class="logo">${logo}</div>
<div class="word"><b>NOSTALGIA</b>CONSOLE</div>
</body></html>`;

const htmlFile = join(here, 'boxart.html');
writeFileSync(htmlFile, html);
execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=600,800',
  `--screenshot=${join(here, 'nostalgiaconsole-boxart.png')}`, `file://${htmlFile}`], { stdio: 'ignore' });
console.log('wrote', join(here, 'nostalgiaconsole-boxart.png'));
