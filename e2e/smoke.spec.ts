import { expect, test } from '@playwright/test';

test('the menu lists the six missions', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.mission-row')).toHaveCount(6);
  await expect(page.getByRole('button', { name: /First delivery/ })).toBeVisible();
});

test('the truck drives and the instruments follow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('./');
  await page.getByRole('button', { name: /Free training/ }).click();
  await expect(page.locator('#hud')).toBeVisible();

  /** Engage D, drive forward, watch the speedometer leave zero. */
  await page.keyboard.press('KeyG');
  await page.keyboard.press('KeyG');
  await page.keyboard.down('KeyW');
  await expect(page.locator('.drivetrain__speed span').first()).not.toHaveText('0', { timeout: 15_000 });
  await page.keyboard.up('KeyW');

  expect(errors).toEqual([]);
});
