import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '1478', '--strictPort'],
  { stdio: 'ignore' },
);
let browser;
try {
  let ready = false;
  for (let count = 0; count < 50; count++) {
    try {
      if ((await fetch('http://127.0.0.1:1478')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  if (!ready) throw new Error('Screenshot development server did not start.');
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 900, height: 740 },
    deviceScaleFactor: 1,
  });
  await mkdir('docs/images', { recursive: true });
  await page.goto('http://127.0.0.1:1478/?demo=writing');
  await page.getByRole('button', { name: 'Paste from clipboard' }).click();
  await page.getByRole('button', { name: 'Improve this text' }).click();
  await page.getByRole('status').filter({ hasText: 'Nothing was copied automatically' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Improve this text' }).blur();
  await page.screenshot({ path: 'docs/images/writing.png' });
  await page.setViewportSize({ width: 640, height: 560 });
  await page.screenshot({ path: 'docs/images/compact.png' });
  await page.setViewportSize({ width: 900, height: 740 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.waitForTimeout(250); // Let the control background transitions finish before capture.
  await page.screenshot({ path: 'docs/images/light.png' });
  console.log('Captured PhrasePoP screenshots with fictional text and mocked network requests.');
} finally {
  await browser?.close();
  server.kill();
}
