const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const file   = process.argv[2] || 'lilo_magic_overlay.html';
  const out    = process.argv[3] || 'screenshots/iter.png';
  const cropTo = process.argv[4] || '.card-wrap';
  const url    = 'file://' + path.resolve(file);

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--ignore-certificate-errors', '--allow-file-access-from-files'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 760, height: 1200 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') console.log(`[err] ${m.text()}`);
  });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.every(i => i.complete && i.naturalWidth > 0) &&
           document.fonts.ready;
  }, null, { timeout: 15000 }).catch(() => {});

  await page.waitForTimeout(400);

  const target = await page.$(cropTo);
  if (target) {
    await target.screenshot({ path: out.replace(/\.png$/, '_card.png') });
  }
  await page.screenshot({ path: out, fullPage: true });

  await browser.close();
  console.log('saved:', out, '+ _card.png');
})().catch(e => { console.error(e); process.exit(1); });
