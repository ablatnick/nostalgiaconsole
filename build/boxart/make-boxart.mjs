// Renders build/boxart/nostalgiaconsole-boxart.png (600x800), the cover Sunshine
// shows in Moonlight: a game-case look with a green header band and a
// dashboard scene below. Needs google-chrome (headless).
//   node build/boxart/make-boxart.mjs

import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// The avatar is the app's own 3D avatar, rendered by Electron to a PNG.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const avatarPng = join(here, 'avatar.png');
execFileSync(join(root, 'node_modules', '.bin', 'electron'), [root, '--no-sandbox', '--capture=' + avatarPng, '--size=400x800', '--delay=1500',
  '--user-data=' + join(root, 'test', '.ud-boxart'), '--avatar-shot=' + JSON.stringify({ hat: 'headphones', hatColor: '#2b2f33' })], { stdio: 'ignore' });
const avatarData = 'data:image/png;base64,' + readFileSync(avatarPng).toString('base64');
const orb = readFileSync(join(here, '..', '..', 'src', 'renderer', 'logo.svg'), 'utf8').replace(/<\?xml[^>]*>/, '');

const tiles = [
  ['#6cbf24', '#3f8f0e', 0], ['#2c8fd6', '#155988', 1], ['#e0632a', '#93330b', 2], ['#7d58c6', '#46297f', 3], ['#1aa3a3', '#0d6464', 4],
].map(([a, b, d]) => {
  const s = d === 0 ? 1 : 0.66 * 0.84 ** (d - 1);
  let x = 36;
  if (d > 0) { x = 36 + 250 + 22; let sc = 0.66; for (let k = 1; k < d; k++) { x += 250 * sc * 0.5; sc *= 0.84; } }
  const y = (141 - 141 * s) / 2 - d * 4;
  return `<i style="left:${x}px;top:${y}px;transform:scale(${s});z-index:${10 - d};background:linear-gradient(160deg,${a},${b})"></i>`;
}).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:600px;height:800px;overflow:hidden;background:#111}
body{font-family:"Segoe UI","Noto Sans","Ubuntu",sans-serif;position:relative}
.case{position:absolute;inset:0;overflow:hidden}
.band{position:absolute;left:0;right:0;top:0;height:86px;z-index:5;
  background:linear-gradient(180deg,#8fd346 0%,#5fb11f 45%,#3f8f0e 55%,#4b9c14 100%);
  box-shadow:0 3px 0 rgba(255,255,255,.55),0 8px 18px rgba(0,0,0,.45)}
.band::before{content:"";position:absolute;left:0;right:0;top:0;height:44%;background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.08))}
.band::after{content:"";position:absolute;left:-10%;right:-10%;top:58%;height:22px;border-radius:50%;border-top:2px solid rgba(255,255,255,.55)}
.band .orb{position:absolute;left:14px;top:4px;width:78px;height:78px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))}
.band .orb svg{width:100%;height:100%}
.band .name{position:absolute;left:104px;top:20px;color:#fff;font-size:36px;font-weight:300;letter-spacing:2px;text-shadow:0 2px 4px rgba(0,0,0,.35)}
.band .name b{font-weight:600}
.band .tag{position:absolute;right:18px;top:33px;color:#fff;font-size:15px;font-weight:600;letter-spacing:3px;opacity:.95;text-shadow:0 1px 3px rgba(0,0,0,.35)}
.art{position:absolute;left:0;right:0;top:86px;bottom:0;
  background:radial-gradient(90% 60% at 30% 28%,#ffffff 0%,#e6ebed 45%,#b8c3c9 100%)}
.glow{position:absolute;border-radius:50%;filter:blur(40px)}
.g1{width:520px;height:260px;left:-140px;top:420px;background:rgba(140,210,70,.6)}
.g2{width:360px;height:260px;right:-120px;top:-60px;background:rgba(255,255,255,.9)}
svg.rib{position:absolute;left:0;top:0}
.title{position:absolute;left:36px;top:40px;font-size:44px;font-weight:300;color:#56616a;letter-spacing:-1px}
.row{position:absolute;left:0;top:118px;width:600px;height:141px}
.row i{position:absolute;width:250px;height:141px;border:3px solid #fff;border-radius:5px;transform-origin:0 50%;box-sizing:border-box;
  box-shadow:0 10px 18px -8px rgba(30,50,60,.55);-webkit-box-reflect:below 4px linear-gradient(transparent 70%,rgba(255,255,255,.25))}
.row i:first-child{box-shadow:0 0 0 2px #fff,0 0 26px 6px rgba(255,255,255,.85)}
.row i::after{content:"";position:absolute;inset:0;background:linear-gradient(165deg,rgba(255,255,255,.45) 0%,rgba(255,255,255,.08) 34%,transparent 35%)}
.cap{position:absolute;left:36px;top:300px;color:#2f373c}
.cap b{display:block;font-size:20px}.cap span{font-size:14px;color:#6a757c}
.avatar{position:absolute;right:14px;top:250px;width:170px;height:340px;z-index:20}
.avatar svg{width:100%;height:100%}
.logo{position:absolute;left:0;right:0;bottom:88px;text-align:center;font-size:50px;font-weight:300;letter-spacing:2px;color:#8a9196;text-shadow:0 2px 0 rgba(255,255,255,.6)}
.logo b{font-weight:300;color:#5cb31d}
.sub{position:absolute;left:0;right:0;bottom:50px;text-align:center;font-size:18px;color:#5a666d;letter-spacing:.5px}
.hint{position:absolute;left:36px;bottom:14px;display:flex;gap:16px;font-size:13px;color:#5a666d}
.hint span{display:flex;align-items:center;gap:6px}
.hint em{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;color:#fff;font-style:normal;font-weight:700;font-size:11px;
  box-shadow:inset 0 -2px 3px rgba(0,0,0,.35),inset 0 2px 2px rgba(255,255,255,.55)}
</style></head><body><div class="case">
<div class="band"><div class="orb">${orb}</div><div class="name"><b>NOSTALGIA</b>CONSOLE</div></div>
<div class="art">
  <div class="glow g1"></div><div class="glow g2"></div>
  <svg class="rib" width="600" height="714" viewBox="0 0 600 714">
    <defs><linearGradient id="a" x1="0" x2="1"><stop offset="0" stop-color="#86cc3c" stop-opacity="0"/><stop offset=".5" stop-color="#86cc3c" stop-opacity=".65"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#86cc3c" stop-opacity="0"/></linearGradient></defs>
    <path d="M-60 430 C 120 350, 300 520, 660 400 L 660 440 C 320 560, 140 400, -60 480 Z" fill="url(#a)"/>
    <path d="M-60 500 C 160 450, 360 590, 660 480 L 660 500 C 360 620, 160 485, -60 530 Z" fill="url(#b)"/>
  </svg>
  <div class="title">spotlight</div>
  <div class="row">${tiles}</div>
  <div class="cap"><b>your games</b><span>steam · non-steam · moonlight</span></div>
  <div class="avatar"><img src="${avatarData}" style="width:100%;height:100%"></div>
  <div class="logo"><b>NOSTALGIA</b>CONSOLE</div>
  <div class="sub">the dashboard for your steam library</div>
  <div class="hint"><span><em style="background:#5dbb1f">A</em>play</span><span><em style="background:#e0262c">B</em>back</span><span><em style="background:#f0b000">Y</em>pin</span></div>
</div></div></body></html>`;

const htmlFile = join(here, 'boxart.html');
writeFileSync(htmlFile, html);
execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=600,800',
  `--screenshot=${join(here, 'nostalgiaconsole-boxart.png')}`, `file://${htmlFile}`], { stdio: 'ignore' });
console.log('wrote', join(here, 'nostalgiaconsole-boxart.png'));
