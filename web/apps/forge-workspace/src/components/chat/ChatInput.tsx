import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Self-contained SR types — avoids conflict with lib.dom.d.ts ──────────────
interface SRAlternative { readonly transcript: string }
interface SRResult { readonly length: number; readonly [n: number]: SRAlternative }
interface SRResultList { readonly length: number; readonly [n: number]: SRResult }
interface SREvent extends Event { readonly results: SRResultList }
interface SRInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: Event) => void) | null
  onend: ((e: Event) => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SRConstructor = new () => SRInstance
type WindowWithSR = Window & {
  SpeechRecognition?: SRConstructor
  webkitSpeechRecognition?: SRConstructor
}

function getSR(): SRConstructor | null {
  const w = window as WindowWithSR
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}
// ─────────────────────────────────────────────────────────────────────────────

interface ChatInputProps {
  disabled: boolean
  onSend: (text: string) => void
}

export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SRInstance | null>(null)
  const SR = getSR()
  const hasVoice = SR !== null

  useEffect(() => {
    return () => { recognitionRef.current?.abort() }
  }, [])

  function toggleVoice() {
    if (!SR) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'ar-SA'

    rec.onresult = (e: SREvent) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      setValue((prev) => (prev ? prev + ' ' + transcript : transcript))
    }

    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)

    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  function handleSend() {
    const text = value.trim()
    if (!text || disabled) return
    setValue('')
    onSend(text)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border pt-4">
      <textarea
        data-testid="chat-input"
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        placeholder="اكتب رسالتك..."
        className={cn(
          'flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
          'min-h-[40px] max-h-[160px] overflow-y-auto',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />

      {hasVoice && (
        <Button
          type="button"
          variant={listening ? 'destructive' : 'outline'}
          size="icon"
          onClick={toggleVoice}
          disabled={disabled}
          aria-label={listening ? 'Stop listening' : 'Start voice input'}
          data-testid="mic-button"
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
      )}

      <Button
        type="button"
        size="icon"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        data-testid="send-button"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}
