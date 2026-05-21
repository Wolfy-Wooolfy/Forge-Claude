export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming: boolean
  mode?: string
  quickReplies?: QuickReplyChip[]
}

export interface QuickReplyChip {
  label: string
  value: string
  exclusive: boolean
  multiSelect: boolean
  action: string | null
}

export interface ClarificationState {
  projectId: string
  projectName: string
  originalRequest: string
  questions: string[]
}

export type ChatPhase = 'discovery' | 'clarification' | 'ready' | 'streaming'
