import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { QuickReplyChip } from './types'

interface QuickRepliesProps {
  chips: QuickReplyChip[]
  onSend: (value: string) => void
  onDismiss: () => void
}

export function QuickReplies({ chips, onSend, onDismiss }: QuickRepliesProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const hasMultiSelect = chips.some((c) => c.multiSelect && !c.exclusive)

  function handleChip(chip: QuickReplyChip) {
    if (chip.action === 'open_input') {
      onDismiss()
      return
    }

    if (chip.exclusive || !chip.multiSelect) {
      onSend(chip.value)
      return
    }

    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(chip.value)) {
        next.delete(chip.value)
      } else {
        next.add(chip.value)
      }
      return next
    })
  }

  function handleSendSelected() {
    if (selected.size === 0) return
    onSend([...selected].join('، '))
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2" data-testid="quick-replies">
      {chips.map((chip) => (
        <button
          key={chip.value + chip.label}
          type="button"
          onClick={() => handleChip(chip)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            'border-border hover:bg-accent hover:text-accent-foreground',
            selected.has(chip.value) && 'bg-primary text-primary-foreground border-primary'
          )}
        >
          {chip.label}
        </button>
      ))}
      {hasMultiSelect && selected.size > 0 && (
        <button
          type="button"
          onClick={handleSendSelected}
          className="rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs"
        >
          إرسال الاختيارات
        </button>
      )}
    </div>
  )
}

export function normalizeChips(answers: unknown[] | undefined): QuickReplyChip[] {
  if (!Array.isArray(answers)) return []
  return answers.flatMap((a): QuickReplyChip[] => {
    if (typeof a === 'string') {
      return [{ label: a, value: a, exclusive: false, multiSelect: true, action: null }]
    }
    if (a !== null && typeof a === 'object') {
      const obj = a as Record<string, unknown>
      const label =
        typeof obj['label'] === 'string'
          ? obj['label']
          : typeof obj['value'] === 'string'
            ? obj['value']
            : ''
      const value = typeof obj['value'] === 'string' ? obj['value'] : label
      if (!label) return []
      return [
        {
          label,
          value,
          exclusive: obj['exclusive'] === true,
          multiSelect: obj['multi_select'] !== false,
          action: typeof obj['action'] === 'string' ? obj['action'] : null,
        },
      ]
    }
    return []
  })
}
