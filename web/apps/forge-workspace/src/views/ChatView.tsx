import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { chatStream, answerClarification, requestIdeaSummary, fetchProjectAiOsState } from '@/api'
import type { IdeaSummary } from '@/api'
import { formalizeSpec } from '@/api/ideaSynthesis'
import type { ArchitectDesign, Spec } from '@/api/ideaSynthesis'
import { detectLanguage } from '@/lib/detectLanguage'
import { Button } from '@/components/ui/button'
import { ArchitectDesignCard } from '@/components/chat/ArchitectDesignCard'
import { SpecCard } from '@/components/chat/SpecCard'
import { ChatInput, type ChatInputHandle } from '@/components/chat/ChatInput'
import { IdeaSummaryCard } from '@/components/chat/IdeaSummaryCard'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { QuickReplies, normalizeChips } from '@/components/chat/QuickReplies'
import type { ChatMessage, ChatPhase, ClarificationState, QuickReplyChip } from '@/components/chat/types'
import { useProject, type ConversationMode } from '@/contexts/ProjectContext'

// ── helpers ───────────────────────────────────────────────────────────────────

function friendlyErrorMessage(reason: string | undefined): string {
  if (reason === 'SYNTHESIS_FAILED')   return 'تعذّر تحليل الفكرة من قِبَل المزوّد. حاول مجدداً.'
  if (reason === 'PROJECT_NOT_FOUND')  return 'المشروع غير موجود. تحقق من اختيار المشروع الصحيح.'
  if (reason === 'NO_CONVERSATION_HISTORY') return 'لا توجد محادثة بعد. ابدأ بكتابة فكرتك أولاً.'
  return 'حدث خطأ غير متوقع. حاول مجدداً.'
}

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
  conversationMode: ConversationMode
  ideaSummary: IdeaSummary | null
  architectDesign: ArchitectDesign | null
  loopId: string | null
  spec: Spec | null
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ChatView() {
  const { activeProjectId: projectId, setConversationMode } = useProject()
  const chatInputRef = useRef<ChatInputHandle | null>(null)
  const [summaryRequesting, setSummaryRequesting] = useState(false)
  const [specRequesting, setSpecRequesting] = useState(false)
  const [specError, setSpecError] = useState<string | null>(null)
  const [chatPlaceholder, setChatPlaceholder] = useState('اكتب رسالتك...')
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  const [state, setState] = useState<ChatState>({
    messages: [],
    phase: 'ready',
    clarification: null,
    pendingReplies: [],
    conversationMode: 'CONVERSATION',
    ideaSummary: null,
    architectDesign: null,
    loopId: null,
    spec: null,
  })

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.messages])

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // Hydrate conversationMode + ideaSummary from backend on project switch.
  // Also resets chat history so stale messages from a prior project don't linger.
  useEffect(() => {
    if (!projectId) return
    fetchProjectAiOsState(projectId)
      .then((data) => {
        if (!data.ok) return
        const mode = (data.project?.conversation_mode as ConversationMode) || 'CONVERSATION'
        const summary = data.idea_summary ?? null
        setState({
          messages: [],
          phase: 'ready',
          clarification: null,
          pendingReplies: [],
          conversationMode: mode,
          ideaSummary: summary,
          architectDesign: null,
          loopId: null,
          spec: null,
        })
        setConversationMode(mode)
        setSpecRequesting(false)
        setSpecError(null)
      })
      .catch(() => {
        // backend unreachable — keep defaults
      })
  }, [projectId])

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

  // ── idea synthesis flow ────────────────────────────────────────────────────

  async function refreshStateFromBackend() {
    try {
      const data = await fetchProjectAiOsState(projectId)
      if (!data.ok) return
      const mode = (data.project?.conversation_mode as ConversationMode) || 'CONVERSATION'
      const summary = data.idea_summary ?? null
      setState((prev) => ({ ...prev, conversationMode: mode, ideaSummary: summary }))
      setConversationMode(mode)
    } catch {
      // backend unreachable — leave state unchanged
    }
  }

  async function handleRequestSummary() {
    setSummaryRequesting(true)
    setErrorBanner(null)
    try {
      const res = await requestIdeaSummary({ project_id: projectId })
      if (res.ok && res.summary) {
        setState((prev) => ({ ...prev, conversationMode: 'IDEA_REVIEW', ideaSummary: res.summary! }))
        setConversationMode('IDEA_REVIEW')
      } else if (res.reason === 'NOT_IN_CONVERSATION_MODE' || res.reason === 'NO_IDEA_SUMMARY') {
        // State is stale — silently re-hydrate from backend, no chat message
        await refreshStateFromBackend()
      } else {
        setErrorBanner(friendlyErrorMessage(res.reason))
      }
    } catch {
      setErrorBanner('تعذّر الاتصال بالخادم. حاول مجدداً.')
    } finally {
      setSummaryRequesting(false)
    }
  }

  function handleIdeaConfirm(design: ArchitectDesign | null, loopId: string | null) {
    addMessage(assistantMsg('تمام، الفكرة اتثبّتت. هـ ابدأ التخطيط دلوقتي.'))
    setState((prev) => ({ ...prev, conversationMode: 'PIPELINE', ideaSummary: null, architectDesign: design, loopId, spec: null }))
    setSpecError(null)
  }

  function handleIdeaModify() {
    setState((prev) => ({ ...prev, conversationMode: 'CONVERSATION', ideaSummary: null }))
    setChatPlaceholder('ايه اللي عايز تعدّله؟')
    chatInputRef.current?.focus()
  }

  function handleIdeaReject() {
    setState((prev) => ({ ...prev, conversationMode: 'CONVERSATION', ideaSummary: null }))
  }

  // ── formalize spec flow ────────────────────────────────────────────────────

  async function handleFormalizeSpec() {
    setSpecRequesting(true)
    setSpecError(null)
    try {
      const res = await formalizeSpec({
        project_id:    projectId,
        loop_id:       state.loopId ?? undefined,
        spec_provider: 'openai',
      })
      if (res.spec) {
        setState((prev) => ({ ...prev, spec: res.spec! }))
      } else {
        setSpecError('في مشكلة في تجهيز المواصفات — يقدر يعيد المحاولة')
      }
    } catch {
      setSpecError('في مشكلة في تجهيز المواصفات — يقدر يعيد المحاولة')
    } finally {
      setSpecRequesting(false)
    }
  }

  // ── send handler ───────────────────────────────────────────────────────────

  async function handleSend(text: string) {
    setChatPlaceholder('اكتب رسالتك...')
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
        {state.messages.length === 0 && state.conversationMode !== 'IDEA_REVIEW' && (
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
        {state.conversationMode === 'IDEA_REVIEW' && state.ideaSummary && (
          <IdeaSummaryCard
            summary={state.ideaSummary}
            projectId={projectId}
            onConfirm={handleIdeaConfirm}
            onModify={handleIdeaModify}
            onReject={handleIdeaReject}
          />
        )}
        {state.architectDesign && (
          <ArchitectDesignCard design={state.architectDesign} />
        )}
        {state.architectDesign && !state.spec && (
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              onClick={() => { void handleFormalizeSpec() }}
              disabled={specRequesting || isDisabled}
              data-testid="formalize-spec-btn"
            >
              {specRequesting ? '…' : 'كمّل للمواصفات'}
            </Button>
          </div>
        )}
        {specError && (
          <div className="mt-2 px-3 py-2 rounded-md bg-red-900/40 border border-red-700/50 text-sm text-red-300">
            {specError}
          </div>
        )}
        {state.spec && (
          <SpecCard spec={state.spec} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="flex-shrink-0">
        {errorBanner && (
          <div
            role="alert"
            data-testid="error-banner"
            className="mb-2 px-3 py-2 rounded-md bg-red-900/40 border border-red-700/50 text-sm text-red-300 flex items-center justify-between gap-2"
          >
            <span>{errorBanner}</span>
            <button
              className="text-red-400 hover:text-red-200 text-xs shrink-0"
              onClick={() => setErrorBanner(null)}
              aria-label="إغلاق"
            >✕</button>
          </div>
        )}
        {state.conversationMode === 'CONVERSATION' && state.messages.length >= 3 && (
          <div className="mb-2 flex justify-end">
            <Button
              variant="default"
              size="default"
              onClick={() => { void handleRequestSummary() }}
              disabled={summaryRequesting || isDisabled}
              data-testid="request-summary-btn"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                {summaryRequesting ? '…' : '📋 اعرض ملخّص فكرتي'}
              </span>
            </Button>
          </div>
        )}
        <ChatInput
          ref={chatInputRef}
          disabled={isDisabled}
          onSend={handleSend}
          placeholder={chatPlaceholder}
        />
      </div>
    </div>
  )
}
