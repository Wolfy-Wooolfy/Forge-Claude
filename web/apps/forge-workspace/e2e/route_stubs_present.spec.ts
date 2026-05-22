import { test, expect } from '@playwright/test'

test.describe('route_stubs_present', () => {
  test('/vision route renders vision stub', async ({ page }) => {
    await page.goto('/vision')
    const stub = page.getByTestId('vision-stub')
    await expect(stub).toBeVisible()
    await expect(stub).toContainText('PHASE-15')
  })

  test('/kb route renders kb stub', async ({ page }) => {
    await page.goto('/kb')
    const stub = page.getByTestId('kb-stub')
    await expect(stub).toBeVisible()
    await expect(stub).toContainText('PHASE-15')
  })
})
