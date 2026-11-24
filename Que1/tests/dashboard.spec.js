const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('dashboard synchronizes, handles rapid transaction clicks, and shows validation error', async ({ page }) => {
  const started = Date.now();
  const timings = [];
  await page.route('**/api/transaction', async route => {
    const postData = route.request().postDataJSON();
    const intercepted = { ...postData, precision: '2.5' };
    await route.continue({ postData: JSON.stringify(intercepted), method: 'POST' });
  });

  await page.goto('/');

  await page.waitForFunction(() => document.body.dataset.stateSync === 'synced', null, { timeout: 15_000 });
  await expect(page.locator('#skeleton')).toBeHidden();
  await expect(page.locator('#canvas-state')).toHaveAttribute('data-rendered', 'true');

  const initialPacketCount = Number(await page.locator('#canvas-state').getAttribute('data-packets'));
  const renderState = await page.evaluate(() => ({
    packets: document.querySelector('#canvas-state').dataset.packets,
    price: document.querySelector('#last-price').textContent,
    bodySync: document.body.dataset.stateSync
  }));
  timings.push({ phase: 'initial_sync', elapsedMs: Date.now() - started, renderState });

  const button = page.locator('#buy-button');
  const box = await button.boundingBox();
  if (!box) throw new Error('Buy button has no bounding box');

  const boundedRetry = async operation => {
    const maxAttempts = 5;
    const baseDelayMs = 100;
    let failures = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        failures += 1;
        if (failures >= maxAttempts) throw new Error(`Circuit breaker open: ${error.message}`);
        const delay = Math.min(1600, baseDelayMs * (2 ** attempt));
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const clickTimes = await boundedRetry(async () => {
    const currentBox = await button.boundingBox();
    if (!currentBox) throw new Error('Stale element: buy button has no bounding box');
    if (Math.abs(currentBox.x - box.x) > 2 || Math.abs(currentBox.y - box.y) > 2) {
      throw new Error('Coordinate mismatch: buy button moved');
    }
    return page.evaluate(async () => {
      const target = document.querySelector('#buy-button');
      const times = [];
      const start = performance.now();
      times.push(start);
      target.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      times.push(performance.now());
      target.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      times.push(performance.now());
      target.click();
      return times;
    });
  });

  const gaps = [
    Math.round(clickTimes[1] - clickTimes[0]),
    Math.round(clickTimes[2] - clickTimes[1])
  ];
  expect(gaps[0]).toBeGreaterThanOrEqual(30);
  expect(gaps[0]).toBeLessThanOrEqual(120);
  expect(gaps[1]).toBeGreaterThanOrEqual(30);
  expect(gaps[1]).toBeLessThanOrEqual(120);

  await expect(page.locator('body')).toHaveAttribute('data-rapid-clicks', 'captured');
  await expect(page.locator('#toast')).toHaveClass(/visible/);
  await expect(page.locator('#telemetry')).toHaveAttribute('data-error-boundary', 'validation-error');
  await expect(page.locator('#toast')).toContainText('numeric precision');

  timings.push({ phase: 'rapid_click_submission', elapsedMs: Date.now() - started, clickActionTimesMs: clickTimes });
  await expect(page.locator('#buy-button')).toBeEnabled();
  await expect.poll(async () => Number(await page.locator('#packet-count').textContent())).toBeGreaterThanOrEqual(initialPacketCount);

  const measured = {
    startedAt: new Date(started).toISOString(),
    completedAt: new Date().toISOString(),
    totalElapsedMs: Date.now() - started,
    initialPacketCount,
    rapidClickActionTimesMs: clickTimes,
    gaps,
    phases: timings,
    test: 'passed'
  };

  fs.mkdirSync(path.join(__dirname, '..', 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'artifacts', 'playwright-timing.json'), JSON.stringify(measured, null, 2));
  fs.appendFileSync(path.join(__dirname, '..', 'artifacts', 'test-events.log'), `${JSON.stringify(measured)}\n`);
});
