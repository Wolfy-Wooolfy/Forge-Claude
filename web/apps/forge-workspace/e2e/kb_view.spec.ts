import { test, expect } from '@playwright/test'
import type { KBSource } from '../src/api/kb'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSource(overrides: Partial<KBSource> = {}): KBSource {
  return {
    schema_version: '1.0.0',
    id: 'src_aabbccddee11',
    url: 'https://example.com/article',
    title: 'My Test Source',
    fetched_at: '2026-05-23T10:00:00.000Z',
    content_type: 'text/html',
    raw_byte_size: 25600,
    extracted_text_size: 12000,
    language: 'en',
    credibility: null,
    scope: 'project',
    project_id: 'test_project',
    ...overrides,
  }
}

// ── suite ─────────────────────────────────────────────────────────────────────

test.describe('kb_view', () => {
  test('no sources → shows empty state', async ({ page }) => {
    await page.route('**/api/kb/sources**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          project_id: 'test_project',
          scope: 'project',
          sources: [],
          count: 0,
        }),
      })
    )

    await page.goto('/kb')

    await expect(page.getByTestId('kb-view')).toBeVisible()
    await expect(page.getByTestId('kb-empty-state')).toBeVisible()
    await expect(page.getByTestId('kb-empty-state')).toContainText('لا توجد مصادر')
  })

  test('one source → shows source list with title and content type', async ({ page }) => {
    const source = makeSource()

    await page.route('**/api/kb/sources**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          project_id: 'test_project',
          scope: 'project',
          sources: [source],
          count: 1,
        }),
      })
    )

    await page.goto('/kb')

    const view = page.getByTestId('kb-view')
    await expect(view).toBeVisible()
    await expect(page.getByTestId('kb-source-list')).toBeVisible()
    const item = page.getByTestId(`kb-source-item-${source.id}`)
    await expect(item).toBeVisible()
    await expect(item).toContainText('My Test Source')
    await expect(item).toContainText('text/html')
  })

  test('source without title → falls back to URL', async ({ page }) => {
    const source = makeSource({ title: null, url: 'https://fallback.example.com/page' })

    await page.route('**/api/kb/sources**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          project_id: 'test_project',
          scope: 'project',
          sources: [source],
          count: 1,
        }),
      })
    )

    await page.goto('/kb')

    const item = page.getByTestId(`kb-source-item-${source.id}`)
    await expect(item).toBeVisible()
    await expect(item).toContainText('fallback.example.com')
  })
})
