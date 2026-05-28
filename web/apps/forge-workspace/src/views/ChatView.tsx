import { useEffect, useRef, useState } from 'react'
import { chatStream, answerClarification } from '@/api'
import { detectLanguage } from '@/lib/detectLanguage'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { QuickReplies, normalizeChips } from '@/components/chat/QuickReplies'
import type { ChatMessage, ChatPhase, ClarificationState, QuickReplyChip } from '@/components/chat/types'
import { useProject } from '@/contexts/ProjectContext'

// ── helpers ───────────────────────────────────────────────────────────────────

const PHASE_LABEL: Record<ChatPhase, string> = {
  discovery:    'جاهز',
  streaming:    'يفكر…',
  ready:        'جاهز',
  clarification:'يطرح أسئلة',
}

function makeId(): string {
  return Math.random().toString(36).slice(2)
}

function userMsg(content: string): ChatMessage {
  return { id: makeId(), role: 'user', content, isStreaming: false }
}

function assistantMsg(content: string, streaming = false): ChatMessage {
  return { id: makeId(), role: 'assistant', content, isStreaming: streaming }
}

// ── state shape ───────────────────────────────────────────────────────────────

interface ChatState {
  messages: ChatMessage[]
  phase: ChatPhase
  clarification: ClarificationState | null
  pendingReplies: QuickReplyChip[]
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ChatView() {
  const { activeProjectId: projectId } = useProject()
  const [state, setState] = useState<ChatState>({
    messages: [],
    phase: 'discovery',
    clarification: null,
    pendingReplies: [],
  })

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.messages])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  const isDisabled = state.phase === 'streaming'

  // ── mutation helpers ───────────────────────────────────────────────────────

  function addMessage(msg: ChatMessage) {
    setState((prev) => ({ ...prev, messages: [...prev.messages, msg] }))
  }

  // ── SSE streaming ──────────────────────────────────────────────────────────

  async function doStream(text: string, pid: string) {
    const lang = detectLanguage(text)
    const ac = new AbortController()
    abortRef.current = ac

    const streamingId = makeId()
    setState((prev) => ({
      ...prev,
      phase: 'streaming',
      pendingReplies: [],
      messages: [
        ...prev.messages,
        { id: streamingId, role: 'assistant', content: '', isStreaming: true },
      ],
    }))

    try {
      for await (const evt of chatStream({ message: text, project_id: pid, user_language: lang }, ac.signal)) {
        if (ac.signal.aborted) break

        if (evt.type === 'chunk') {
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === streamingId ? { ...m, content: m.content + evt.c } : m
            ),
          }))
        } else if (evt.type === 'done') {
          const chips = normalizeChips(evt.suggested_answers)
          setState((prev) => ({
            ...prev,
            phase: 'ready',
            pendingReplies: chips,
            messages: prev.messages.map((m) =>
              m.id === streamingId
                ? { ...m, content: evt.message ?? m.content, isStreaming: false, mode: evt.mode, quickReplies: chips }
                : m
            ),
          }))
          return
        } else if (evt.type === 'error') {
          const errText = lang === 'ar' ? 'حدث خطأ. حاول مجدداً.' : 'An error occurred. Please try again.'
          setState((prev) => ({
            ...prev,
            phase: 'ready',
            messages: prev.messages.map((m) =>
              m.id === streamingId ? { ...m, content: errText, isStreaming: false } : m
            ),
          }))
          return
        }
      }
      // Generator exhausted without done event — finalize
      setState((prev) => ({
        ...prev,
        phase: 'ready',
        messages: prev.messages.map((m) =>
          m.id === streamingId ? { ...m, isStreaming: false } : m
        ),
      }))
    } catch {
      if (!ac.signal.aborted) {
        const errText = lang === 'ar' ? 'تعذّر الاتصال بالخادم.' : 'Could not reach server.'
        setState((prev) => ({
          ...prev,
          phase: 'ready',
          messages: prev.messages.map((m) =>
            m.id === streamingId ? { ...m, content: errText, isStreaming: false } : m
          ),
        }))
      }
    }
  }

  // ── clarification flow ─────────────────────────────────────────────────────

  async function doClarificationAnswer(text: string, clar: ClarificationState) {
    setState((prev) => ({ ...prev, phase: 'streaming', pendingReplies: [] }))

    try {
      const res = await answerClarification({
        project_id: clar.projectId,
        project_name: clar.projectName,
        answers: { raw_answer: text, answered_questions: clar.questions },
      })

      if (res.mode === 'CLARIFICATION_REQUIRED') {
        const questions = Array.isArray(res.blocking_questions) ? res.blocking_questions : []
        const chips = normalizeChips(res.suggested_answers)
        addMessage(assistantMsg(questions.join('\n')))
        setState((prev) => ({
          ...prev,
          phase: 'clarification',
          pendingReplies: chips,
          clarification: { ...clar, questions },
        }))
        return
      }

      if (res.mode === 'IDEATION_READY') {
        addMessage(assistantMsg(detectLanguage(text) === 'ar' ? 'اكتمل التحليل.' : 'Discovery complete.'))
        setState((prev) => ({ ...prev, phase: 'ready', clarification: null }))
        return
      }

      addMessage(assistantMsg(JSON.stringify(res, null, 2)))
      setState((prev) => ({ ...prev, phase: 'ready', clarification: null }))
    } catch (err) {
      addMessage(assistantMsg(err instanceof Error ? err.message : 'Unknown error'))
      setState((prev) => ({ ...prev, phase: 'clarification' }))
    }
  }

  // ── send handler ───────────────────────────────────────────────────────────

  async function handleSend(text: string) {
    addMessage(userMsg(text))

    const { phase, clarification } = state

    if (phase === 'clarification' && clarification !== null) {
      await doClarificationAnswer(text, clarification)
      return
    }

    // All messages route through processMessage — handles CONVERSATION and PIPELINE modes
    await doStream(text, projectId)
  }

  function handleQuickReply(value: string) {
    setState((prev) => ({ ...prev, pendingReplies: [] }))
    void handleSend(value)
  }

  function dismissReplies() {
    setState((prev) => ({ ...prev, pendingReplies: [] }))
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-4 p-4" data-testid="chat-view">

      <div className="flex items-center gap-2 text-xs text-gray-400 flex-shrink-0">
        <span>Project: <strong className="text-gray-200">{projectId}</strong></span>
        <span className="text-xs px-2 py-0.5 rounded-full border border-border">
          {PHASE_LABEL[state.phase]}
        </span>
      </div>

      {/* Message list */}
      <div
        data-testid="message-list"
        className="flex-1 overflow-y-auto flex flex-col pr-1 min-h-0"
      >
        {state.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm gap-3">
            <span className="text-3xl select-none">✦</span>
            <p className="text-gray-300 font-medium">مرحباً بك في Forge</p>
            <p className="text-xs text-center max-w-xs leading-relaxed">
              اكتب فكرتك أو مشروعك وسيساعدك Forge في تحليله وبناء رؤية واضحة له.
            </p>
          </div>
        )}
        {state.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {state.pendingReplies.length > 0 && (
          <QuickReplies
            chips={state.pendingReplies}
            onSend={handleQuickReply}
            onDismiss={dismissReplies}
          />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Chat input */}
      <div className="flex-shrink-0">
        <ChatInput disabled={isDisabled} onSend={handleSend} />
      </div>
    </div>
  )
}
