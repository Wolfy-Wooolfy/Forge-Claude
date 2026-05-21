import { cn } from '@/lib/utils'
import type { ChatMessage } from './types'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const hasArabic = /[؀-ۿ]/.test(message.content)
  const dir = hasArabic ? 'rtl' : 'ltr'

  return (
    <div
      data-testid={isUser ? 'user-message' : 'assistant-message'}
      className={cn('flex flex-col gap-1 mb-4', isUser ? 'items-end' : 'items-start')}
    >
      <div className="text-xs text-muted-foreground">
        {isUser ? 'You' : 'AI Workspace'}
      </div>
      <div
        dir={dir}
        className={cn(
          'rounded-lg px-4 py-2 max-w-[80%] whitespace-pre-wrap break-words text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
          message.mode === 'PENDING_CONFIRMATION' && 'border border-yellow-500/60'
        )}
      >
        {message.content}
        {message.isStreaming && (
          <span
            data-testid="stream-cursor"
            className="inline-block w-0.5 h-4 ml-0.5 bg-current animate-pulse align-text-bottom"
          />
        )}
      </div>
    </div>
  )
}
