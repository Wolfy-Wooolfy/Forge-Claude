import { test, expect } from '@playwright/test'

// ── mock helpers ──────────────────────────────────────────────────────────────

type ProjectRow = {
  project_id: string
  project_name?: string
  active_runtime_state?: string
  current_phase?: string
}

function projectsBody(items: ProjectRow[], activeId: string): string {
  return JSON.stringify({ items, active_project_id: activeId })
}

const DEFAULT_PROJECT: ProjectRow = {
  project_id: 'default_project',
  project_name: 'default_project',
}

const E2E_PROJECT: ProjectRow = {
  project_id: 'e2e_test_proj',
  project_name: 'E2E Test Project',
  active_runtime_state: 'IDLE',
  current_phase: 'PHASE_A',
}

// ── suite ─────────────────────────────────────────────────────────────────────

test.describe('project_lifecycle', () => {
  // ── Test 1: default_project protection ────────────────────────────────────

  test('default_project has no delete button (delete protection)', async ({ page }) => {
    await page.route('**/api/projects', async (route) => {
      if (route.request().method() !== 'GET') { await route.continue(); return }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: projectsBody([DEFAULT_PROJECT], 'default_project'),
      })
    })

    await page.route('**/api/ai/history*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      })
    )

    await page.goto('/projects')

    // default_project visible in list
    await expect(page.getByTestId('project-item-default_project')).toBeVisible()

    // delete button NOT present — default_project is protected from deletion
    await expect(page.getByTestId('delete-project-btn')).not.toBeAttached()
  })

  // ── Test 2: full lifecycle create → activate → delete ─────────────────────

  test('project lifecycle: create → activate → delete', async ({ page }) => {
    // Tracks whether the test project has been created (not yet deleted)
    let hasTestProject = false

    // ── GET /api/projects — state-dependent ───────────────────────────────
    await page.route('**/api/projects', async (route) => {
      if (route.request().method() !== 'GET') { await route.continue(); return }
      const items: ProjectRow[] = hasTestProject
        ? [DEFAULT_PROJECT, E2E_PROJECT]
        : [DEFAULT_PROJECT]
      const activeId = hasTestProject ? 'e2e_test_proj' : 'default_project'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: projectsBody(items, activeId),
      })
    })

    // ── GET /api/ai/history — always empty ────────────────────────────────
    await page.route('**/api/ai/history*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      })
    )

    // ── POST /api/projects/create ─────────────────────────────────────────
    await page.route('**/api/projects/create', async (route) => {
      hasTestProject = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          active_project_id: 'e2e_test_proj',
          project: E2E_PROJECT,
        }),
      })
    })

    // ── POST /api/projects/activate — returns project matching request body ─
    await page.route('**/api/projects/activate', async (route) => {
      const raw = route.request().postData() ?? '{}'
      const body = JSON.parse(raw) as { project_id?: string }
      const pid = body.project_id ?? 'default_project'
      const project: ProjectRow =
        pid === 'e2e_test_proj' ? E2E_PROJECT : DEFAULT_PROJECT
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ project }),
      })
    })

    // ── POST /api/projects/delete ─────────────────────────────────────────
    await page.route('**/api/projects/delete', async (route) => {
      hasTestProject = false
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    // ─────────────────────────────────────────────────────────────────────
    await page.goto('/projects')

    // Initial state: only default_project, no delete button
    await expect(page.getByTestId('project-item-default_project')).toBeVisible()
    await expect(page.getByTestId('delete-project-btn')).not.toBeAttached()

    // ── Step 1: CREATE ────────────────────────────────────────────────────

    await page.getByTestId('new-project-btn').click()
    // Create dialog opens
    await expect(page.getByTestId('create-project-name-input')).toBeVisible()

    await page.getByTestId('create-project-name-input').fill('E2E Test Project')
    await page.getByTestId('create-project-submit-btn').click()

    // New project appears in list
    await expect(page.getByTestId('project-item-e2e_test_proj')).toBeVisible()
    // Context panel visible (e2e_test_proj now active after create)
    await expect(page.getByTestId('project-context-panel')).toBeVisible()
    // Delete button visible — non-default project is now active
    await expect(page.getByTestId('delete-project-btn')).toBeVisible()

    // ── Step 2: ACTIVATE ─────────────────────────────────────────────────
    // Switch to default_project to confirm deactivation hides delete button
    await page.getByTestId('project-item-default_project').click()
    await expect(page.getByTestId('delete-project-btn')).not.toBeAttached()

    // Activate e2e_test_proj — explicit activate call
    await page.getByTestId('project-item-e2e_test_proj').click()
    // Context panel updated with e2e_test_proj data
    await expect(page.getByTestId('project-context-panel')).toContainText('E2E Test Project')
    // Delete button restored
    await expect(page.getByTestId('delete-project-btn')).toBeVisible()

    // ── Step 3: DELETE ────────────────────────────────────────────────────

    await page.getByTestId('delete-project-btn').click()
    // Confirm dialog appears
    await expect(page.getByTestId('delete-project-confirm-btn')).toBeVisible()

    await page.getByTestId('delete-project-confirm-btn').click()

    // e2e_test_proj removed from list
    await expect(page.getByTestId('project-item-e2e_test_proj')).not.toBeAttached()
    // default_project still visible
    await expect(page.getByTestId('project-item-default_project')).toBeVisible()
    // Delete button gone — back to default_project
    await expect(page.getByTestId('delete-project-btn')).not.toBeAttached()
  })
})
