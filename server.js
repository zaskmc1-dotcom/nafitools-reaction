const express = require('express');
const cors = require('cors');
const { addExtra } = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const crypto = require('crypto');

const puppeteer = addExtra(require('puppeteer'));
puppeteer.use(StealthPlugin());

const API_URL = 'https://react.keyysspanel.web.id/api/react';
const FRONTEND_ORIGIN = 'https://react.keyysspanel.web.id';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'ok', service: 'NAFITOOLS Reaction' }));

app.post('/react', async (req, res) => {
  const { url, emojis } = req.body;
  if (!url || !url.includes('whatsapp.com/channel')) {
    return res.status(400).json({ success: false, error: 'URL tidak valid' });
  }

  const fingerprint = 'DEV_' + crypto.randomBytes(4).toString('hex');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-gpu', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });
    await page.goto(FRONTEND_ORIGIN, { waitUntil: 'networkidle2', timeout: 30000 });

    // Tunggu Turnstile auto-solve (max 30 detik)
    let token = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1500));
      token = await page.evaluate(() => {
        const inp = document.querySelector('input[name="cf-turnstile-response"]');
        if (inp && inp.value) return inp.value;
        if (window.turnstile && window.turnstile.getResponse) {
          try { return window.turnstile.getResponse(); } catch (e) {}
        }
        return null;
      });
      if (token && token.length > 20) break;
    }

    if (!token) {
      token = `${crypto.randomBytes(2).toString('hex').toUpperCase()}.${crypto.randomBytes(4).toString('hex').toUpperCase()}.${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    }

    const result = await page.evaluate(async (api, fp, emoji, tk, u) => {
      const r = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Fingerprint': fp },
        body: JSON.stringify({
          link: u, emoji: emoji, url: u, emojis: emoji,
          deviceFingerprint: fp, turnstileToken: tk
        })
      });
      const t = await r.text();
      try { return { ok: r.ok, status: r.status, data: JSON.parse(t) }; }
      catch { return { ok: r.ok, status: r.status, raw: t.slice(0, 400) }; }
    }, API_URL, fingerprint, emojis, token, url);

    res.json({
      success: result.ok && result.data && result.data.success !== false,
      fingerprint,
      httpStatus: result.status,
      data: result.data || { raw: result.raw }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server jalan di ' + PORT));