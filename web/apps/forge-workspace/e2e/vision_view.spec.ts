import { test, expect } from '@playwright/test'
import type { VisionFrontmatter } from '../src/api/vision'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFrontmatter(overrides: Partial<VisionFrontmatter> = {}): VisionFrontmatter {
  return {
    project_id: 'test_project',
    project_name: 'TestProject',
    domain: 'cli_tool',
    vision_version: 1,
    vision_locked: false,
    vision_locked_at: null,
    locked_by_role: null,
    amendments_history: [],
    goals: { primary: 'Build a great CLI tool', secondary: [] },
    constraints: [],
    non_goals: [],
    ...overrides,
  }
}

// ── suite ─────────────────────────────────────────────────────────────────────

test.describe('vision_view', () => {
  test('vision: null → shows empty state', async ({ page }) => {
    await page.route('**/api/vision', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, project_id: 'test_project', vision: null }),
      })
    )

    await page.goto('/vision')

    await expect(page.getByTestId('vision-view')).toBeVisible()
    await expect(page.getByTestId('vision-empty-state')).toBeVisible()
    await expect(page.getByTestId('vision-empty-state')).toContainText('لا توجد رؤية')
  })

  test('vision data → shows project name, domain, body', async ({ page }) => {
    const frontmatter = makeFrontmatter()
    const vision = {
      frontmatter,
      body: '# Project Vision: TestProject\n\nThis is the vision body.',
    }

    await page.route('**/api/vision', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, project_id: 'test_project', vision }),
      })
    )

    await page.goto('/vision')

    const view = page.getByTestId('vision-view')
    await expect(view).toBeVisible()
    await expect(view).toContainText('TestProject')
    await expect(view).toContainText('cli_tool')
    await expect(page.getByTestId('vision-body')).toBeVisible()
    await expect(page.getByTestId('vision-body')).toContainText('Project Vision: TestProject')
  })

  test('vision locked → shows Locked badge', async ({ page }) => {
    const frontmatter = makeFrontmatter({
      vision_locked: true,
      vision_locked_at: '2026-05-23T10:00:00.000Z',
      locked_by_role: 'owner',
      vision_version: 2,
    })
    const vision = {
      frontmatter,
      body: '# Locked Vision',
    }

    await page.route('**/api/vision', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, project_id: 'test_project', vision }),
      })
    )

    await page.goto('/vision')

    const view = page.getByTestId('vision-view')
    await expect(view).toBeVisible()
    await expect(view).toContainText('Locked')
    await expect(view).toContainText('v2')
  })
})
