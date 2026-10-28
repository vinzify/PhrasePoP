import { expect, test } from '@playwright/test';

test('defaults to dark and persists light from Appearance settings', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/?demo=writing');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('streams a rewrite but copies only after an explicit click', async ({ page }) => {
  await page.goto('/?demo=writing');
  await page.getByRole('button', { name: 'Paste from clipboard' }).click();
  await page.getByRole('button', { name: 'Improve this text' }).click();
  await expect(page.getByLabel('A fresh take')).toHaveValue(
    /Could you share a brief project update/,
  );
  await expect(
    page.getByRole('status').filter({ hasText: 'Nothing was copied automatically' }),
  ).toBeVisible();
  const before = await page.evaluate(
    () =>
      (window as unknown as { __phraseDemo: { calls: { command: string }[] } }).__phraseDemo.calls,
  );
  expect(before.some((call) => call.command === 'set_clipboard')).toBe(false);
  await page.getByRole('button', { name: 'Copy result' }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
});
test('LM Studio, selected model, and session-only credentials are retained', async ({ page }) => {
  await page.goto('/?demo=writing');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Provider', { exact: true }).selectOption('LM Studio');
  await page.getByLabel('Model ID', { exact: true }).fill('my-lm-model');
  await page.getByLabel('API key · this session only').fill('fake-test-key');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByLabel('Your words').fill('Please send an update.');
  await page.getByRole('button', { name: 'Improve this text' }).click();
  await expect(page.getByLabel('A fresh take')).toHaveValue(/Could you share/);
  const requests = await page.evaluate(
    () =>
      (
        window as unknown as {
          __phraseDemo: { requests: { url: string; body: { model: string } }[] };
        }
      ).__phraseDemo.requests,
  );
  expect(requests[0].url).toBe('http://localhost:1234/v1/chat/completions');
  expect(requests[0].body.model).toBe('my-lm-model');
  expect(await page.evaluate(() => localStorage.getItem('phrasepop-settings'))).not.toContain(
    'fake-test-key',
  );
});
test('cancellation never auto-copies a late response', async ({ page }) => {
  await page.goto('/?demo=slow');
  await page.getByLabel('Your words').fill('Synthetic request text.');
  await page.getByRole('button', { name: 'Improve this text' }).click();
  await page.getByRole('button', { name: 'Stop generating' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Stopped.' })).toBeVisible();
  await expect(page.getByLabel('A fresh take')).toHaveValue('');
});
test('provider errors preserve source text and allow retry', async ({ page }) => {
  await page.goto('/?demo=error');
  await page.getByLabel('Your words').fill('Keep this draft.');
  await page.getByRole('button', { name: 'Improve this text' }).click();
  await expect(page.getByRole('status')).toContainText('HTTP 503');
  await expect(page.getByLabel('Your words')).toHaveValue('Keep this draft.');
  await expect(page.getByRole('button', { name: 'Improve this text' })).toBeEnabled();
});
test('late clipboard imports never overwrite a newer draft', async ({ page }) => {
  await page.goto('/?demo=slow-paste');
  await page.getByRole('button', { name: 'Paste from clipboard' }).click();
  await page.getByLabel('Your words').fill('My newer draft.');
  await expect(page.getByRole('status')).toContainText('not replaced');
  await expect(page.getByLabel('Your words')).toHaveValue('My newer draft.');
});
test('Wayland guidance and minimum-size layout remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 560 });
  await page.goto('/?demo=writing');
  await expect(page.getByRole('button', { name: 'Paste from clipboard' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('phrasepop --clipboard', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Global shortcut', { exact: true })).toHaveCount(0);
});
