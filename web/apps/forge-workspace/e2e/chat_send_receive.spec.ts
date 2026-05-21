import { test, expect } from '@playwright/test'

// ── helpers ───────────────────────────────────────────────────────────────────

function sseBody(chunks: string[], finalMessage: string, mode = 'IDEATION_READY'): string {
  const lines: string[] = [
    ...chunks.map((c) => `data: ${JSON.stringify({ type: 'chunk', c })}\n\n`),
    `data: ${JSON.stringify({ type: 'done', message: finalMessage, mode })}\n\n`,
  ]
  return lines.join('')
}

// ── suite ─────────────────────────────────────────────────────────────────────

test.describe('chat_send_receive', () => {
  test.beforeEach(async ({ page }) => {
    // Mock /api/ai/clarify — always returns ok (called on every discovery send)
    await page.route('**/api/ai/clarify', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    )
  })

  // ── Test 1: message send + incremental SSE streaming render ──────────────────

  test('sends a message and receives a streamed response (incremental render)', async ({ page }) => {
    // Mock intake → IDEATION_READY so discovery resolves immediately
    await page.route('**/api/ai-os/intake', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mode: 'IDEATION_READY', ok: true }),
      })
    )

    // Mock SSE stream with two chunks followed by done
    await page.route('**/api/ai-os/chat/stream', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBody(['Hello', ' world'], 'Hello world'),
      })
    )

    await page.goto('/')

    // Step 1 — discovery send (needed to advance phase to 'ready')
    await page.fill('[data-testid="chat-input"]', 'Build me a todo app')
    await page.click('[data-testid="send-button"]')
    // Discovery complete message appears
    await expect(page.locator('[data-testid="assistant-message"]').first()).toBeVisible()

    // Step 2 — streaming send (phase = 'ready' now)
    await page.fill('[data-testid="chat-input"]', 'Start building now')
    await page.click('[data-testid="send-button"]')

    // Assert: user message visible (message send confirmed)
    await expect(page.locator('[data-testid="user-message"]').last()).toContainText('Start building now')

    // Assert: streamed content rendered (SSE chunks processed)
    await expect(page.locator('[data-testid="assistant-message"]').last()).toContainText('Hello world')

    // Assert: streaming cursor gone after completion (streaming lifecycle complete)
    await expect(page.locator('[data-testid="stream-cursor"]')).not.toBeAttached()

    // Assert: phase badge shows 'ready' (state machine returned to correct phase)
    await expect(page.getByText('ready', { exact: true })).toBeVisible()
  })

  // ── Test 2: clarification answer round-trip ───────────────────────────────────

  test('clarification answer round-trip — CLARIFICATION_REQUIRED → answer → IDEATION_READY', async ({ page }) => {
    // Mock intake → CLARIFICATION_REQUIRED with questions + suggested answers
    await page.route('**/api/ai-os/intake', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'CLARIFICATION_REQUIRED',
          blocking_questions: ['What is the name of your project?'],
          suggested_answers: ['My todo app', 'My CLI tool'],
        }),
      })
    )

    // Mock clarification answer → IDEATION_READY
    await page.route('**/api/ai-os/clarification/answer', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mode: 'IDEATION_READY', ok: true }),
      })
    )

    await page.goto('/')

    // Send initial message (discovery phase)
    await page.fill('[data-testid="chat-input"]', 'I want to build something')
    await page.click('[data-testid="send-button"]')

    // Assert: clarification question shown in assistant message
    await expect(page.locator('[data-testid="assistant-message"]')).toContainText(
      'What is the name of your project?'
    )

    // Assert: quick replies rendered (suggested_answers displayed)
    await expect(page.locator('[data-testid="quick-replies"]')).toBeVisible()

    // Answer the clarification question
    await page.fill('[data-testid="chat-input"]', 'My todo app')
    await page.click('[data-testid="send-button"]')

    // Assert: IDEATION_READY → "Discovery complete." message
    await expect(page.locator('[data-testid="assistant-message"]').last()).toContainText('Discovery complete.')

    // Assert: phase is now 'ready' (clarification loop closed, streaming available)
    await expect(page.getByText('ready', { exact: true })).toBeVisible()
  })
})
