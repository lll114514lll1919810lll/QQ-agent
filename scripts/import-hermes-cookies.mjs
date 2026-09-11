import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const envPath = path.join(os.homedir(), 'AppData', 'Local', 'hermes', '.env');
const mediaDir = 'D:/Software/QQ-agent/data/media';
fs.mkdirSync(mediaDir, { recursive: true });

function getVal(key) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const i = s.indexOf('=');
    if (s.slice(0, i).trim() !== key) continue;
    let v = s.slice(i + 1).trim();
    if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
    return v;
  }
  return '';
}

function parse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

for (const [key, file] of [['BILIBILI_COOKIES_JSON', 'bilibili-cookies.json'], ['NETEASE_COOKIES_JSON', 'netease-cookies.json']]) {
  const raw = getVal(key);
  const obj = parse(raw) || {};
  const n = Object.keys(obj).length;
  fs.writeFileSync(path.join(mediaDir, file), JSON.stringify(obj, null, 2), 'utf8');
  console.log(key, 'keys=', n, '->', file);
}
