import { test, expect } from '@playwright/test'
import type { DoctorCheck } from '../src/api/system'

// ── mock helpers ──────────────────────────────────────────────────────────────

function makeReport(checks: DoctorCheck[]) {
  const counts = { pass: 0, warn: 0, fail: 0 }
  for (const c of checks) {
    if (c.status === 'PASS') counts.pass++
    else if (c.status === 'WARN') counts.warn++
    else counts.fail++
  }
  return {
    ok: counts.fail === 0,
    results: {
      schema_version: '1.0',
      ok: counts.fail === 0,
      summary: `${counts.fail} critical, ${counts.warn} warning`,
      counts,
      started_at: new Date().toISOString(),
      duration_ms: 42,
      checks,
      links: { ui: 'http://localhost:3100/', api: '', logs: '', decisions: '' },
    },
  }
}

function mockDoctor(checks: DoctorCheck[]) {
  return JSON.stringify(makeReport(checks))
}

const ALL_PASS: DoctorCheck[] = [
  { id: 'node_version', status: 'PASS', detail: 'v20.10.0' },
  { id: 'api_server_port', status: 'PASS', detail: 'listening on 4505' },
]

const WITH_WARN: DoctorCheck[] = [
  { id: 'node_version', status: 'PASS', detail: 'v20.10.0' },
  { id: 'env_dotfile', status: 'WARN', detail: '.env not found' },
]

const WITH_FAIL: DoctorCheck[] = [
  { id: 'node_version', status: 'PASS', detail: 'v20.10.0' },
  { id: 'missing_dependencies', status: 'FAIL', detail: 'express not in package.json' },
]

// ── suite ─────────────────────────────────────────────────────────────────────

test.describe('doctor_indicator', () => {
  test('all checks pass → green indicator', async ({ page }) => {
    await page.route('**/api/system/doctor', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockDoctor(ALL_PASS),
      })
    )

    await page.goto('/doctor')

    const indicator = page.getByTestId('doctor-status-indicator')
    await expect(indicator).toBeVisible()
    await expect(indicator).toHaveAttribute('data-status', 'green')
    await expect(indicator).toContainText('Healthy')
  })

  test('checks with warnings → yellow indicator', async ({ page }) => {
    await page.route('**/api/system/doctor', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockDoctor(WITH_WARN),
      })
    )

    await page.goto('/doctor')

    const indicator = page.getByTestId('doctor-status-indicator')
    await expect(indicator).toBeVisible()
    await expect(indicator).toHaveAttribute('data-status', 'yellow')
    await expect(indicator).toContainText('Warning')
  })

  test('checks with failures → red indicator', async ({ page }) => {
    await page.route('**/api/system/doctor', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockDoctor(WITH_FAIL),
      })
    )

    await page.goto('/doctor')

    const indicator = page.getByTestId('doctor-status-indicator')
    await expect(indicator).toBeVisible()
    await expect(indicator).toHaveAttribute('data-status', 'red')
    await expect(indicator).toContainText('Critical')
  })

  test('check list renders all items with correct status', async ({ page }) => {
    await page.route('**/api/system/doctor', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockDoctor(WITH_WARN),
      })
    )

    await page.goto('/doctor')

    // Check list is present
    await expect(page.getByTestId('doctor-check-list')).toBeVisible()

    // Each check item is rendered
    for (const check of WITH_WARN) {
      await expect(page.getByTestId(`doctor-check-item-${check.id}`)).toBeVisible()
    }

    // WARN item is visible
    const warnItem = page.getByTestId('doctor-check-item-env_dotfile')
    await expect(warnItem).toContainText('WARN')
    await expect(warnItem).toContainText('.env not found')
  })
})
