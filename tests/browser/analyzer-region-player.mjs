import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const html = await readFile(new URL('../../src/index.html', import.meta.url), 'utf8');
  const region = html.slice(html.indexOf('<div class="analyzer-state" id="analyzer-region-screen">'), html.indexOf('          <!-- [Claude] — 2026-10-09', html.indexOf('<div class="analyzer-state" id="analyzer-region-screen">')));
  // Sert le vrai markup et les vrais modules, sans lancer les autres workspaces.
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (url.hostname !== 'region.test') return request.continue();
    if (url.pathname === '/') return request.respond({ contentType: 'text/html', body: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="/ui/components/analyzer-region.css"><style>body{margin:0;background:#f4f6f2;font-family:Arial;--accent:#30b75c;--surface:#fff;--border:#dce5de;--text:#25251f;--text-dim:#667085}#analyzer-region-screen{display:flex;min-height:100vh}.analyzer-region-hero{box-sizing:border-box}</style></head><body>${region}</body></html>` });
    try {
      const body = await readFile(new URL(`../../src${url.pathname}`, import.meta.url));
      return request.respond({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body });
    } catch { return request.respond({ status: 404 }); }
  });
  await page.goto('http://region.test');
  await page.evaluate(async () => {
    const { createRegionPlayer } = await import('/ui/components/analyzer-region-player.js');
    window.changes = [];
    window.regionPlayer = createRegionPlayer(document.querySelector('#analyzer-region-player'), { duration: 700, start: 0, end: 240, onChange: (start, end) => window.changes.push({ start, end }) });
    // PCM valide, 700 secondes : lecture/décodage réels par Chromium.
    const samples = 700 * 8000;
    const data = new ArrayBuffer(44 + samples * 2);
    const v = new DataView(data);
    const str = (offset, value) => [...value].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, data.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, samples * 2, true);
    window.regionPlayer.load(URL.createObjectURL(new Blob([data], { type: 'audio/wav' })));
  });
  await page.waitForFunction(() => !document.querySelector('#analyzer-region-preview').disabled);
  const set = async (id, value) => page.$eval(`#analyzer-region-${id}`, (el, value) => { el.value = value; el.dispatchEvent(new Event('change')); }, value);
  await set('start', '02:30');
  assert.deepEqual(await page.evaluate(() => changes.at(-1)), { start: 150, end: 240 });
  await set('end', '02:45');
  await page.click('#analyzer-region-preview');
  await page.waitForFunction(() => { const a = document.querySelector('audio'); return !a.paused && a.currentTime > 150; });
  // Avancer près de la fin vérifie l’arrêt réel, sans attendre 15 secondes.
  await page.$eval('audio', a => { a.currentTime = 164.9; });
  await page.waitForFunction(() => document.querySelector('audio').paused);
  assert.equal(await page.$eval('audio', a => a.currentTime), 165);
  await page.$eval('audio', async a => { a.currentTime = 300; await a.play(); });
  await page.click('#analyzer-region-mark-start');
  assert.equal((await page.evaluate(() => changes.at(-1))).start, 300);
  await page.$eval('audio', a => { a.currentTime = 330; });
  await page.click('#analyzer-region-mark-end');
  assert.deepEqual(await page.evaluate(() => changes.at(-1)), { start: 300, end: 330 });
  await set('end', '11:40');
  const selection = await page.evaluate(() => changes.at(-1));
  assert(selection.end - selection.start <= 480 && selection.end <= 700);
  await set('start', 'nonsense');
  assert.equal(await page.$eval('#analyzer-region-start', el => el.getAttribute('aria-invalid')), 'true');
  await set('start', '05:00');
  await page.screenshot({ path: '/tmp/analyzer-region-player.png' });
  await page.setViewport({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => regionPlayer.destroy());
  assert.equal(await page.$('audio'), null);
  console.log('PASS : décodage et lecture WAV, repères saisis/à l’écoute, arrêt à la fin, bornes, saisie invalide, mobile, nettoyage.');
} finally { await browser.close(); }
