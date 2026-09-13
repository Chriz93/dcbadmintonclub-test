import { test, expect } from '@playwright/test';
import { freshState, installMock } from './mock-supabase';

test('email login · code entry survives two minutes and completes sign-in',async({page})=>{
  const state=freshState(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await installMock(page,state);
  await page.goto('/');
  await page.locator('#signin-email-input').fill('christygeorge993+regular@gmail.com');
  await page.locator('#signin-btn').click();
  const code=page.locator('#signin-code-input');
  await expect(code).toBeVisible();
  await code.fill('123');
  await page.clock.fastForward(120000);
  await expect(code).toBeVisible();
  await expect(code).toHaveValue('123');
  await expect(code).toBeFocused();
  await code.fill('123456');
  await page.locator('#signin-btn').click();
  await expect(page.locator('#invite-gate')).toBeHidden();
  await expect(page.locator('#slbl')).toHaveText('Synced');
  expect(errors).toEqual([]);
  expect(state.blocked).toEqual([]);
});

test('email login · an older TEST schema gives a migration message after code verification',async({page})=>{
  const state=freshState();state.environment={name:'test',schema_version:'L21'};
  await installMock(page,state);
  await page.goto('/');
  await page.locator('#signin-email-input').fill('christygeorge993+regular@gmail.com');
  await page.locator('#signin-btn').click();
  await page.locator('#signin-code-input').fill('123456');
  await page.locator('#signin-btn').click();
  await expect(page.locator('#env-stop')).toContainText('requires database migration L24');
  expect(state.requests.filter(r=>r.includes('/rest/v1/'))).toEqual([]);
  expect(state.blocked).toEqual([]);
});
