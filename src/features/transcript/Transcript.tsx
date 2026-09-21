import { useEffect, useRef } from 'react'
import type { TranscriptLine } from '../../domain/types'

type TranscriptProps = {
  lines: TranscriptLine[]
  activeLineId: string
  onSelect: (lineId: string) => void
  disabled?: boolean
}

export function Transcript({ lines, activeLineId, onSelect, disabled = false }: TranscriptProps) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    activeRef.current?.scrollIntoView?.({
      block: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [activeLineId])

  return (
    <div className="lyric-scroll" aria-label="Timed transcript">
      {lines.map((line) => {
        const active = line.id === activeLineId
        return (
          <button
            className={`lyric-line${active ? ' is-active' : ''}`}
            key={line.id}
            ref={active ? activeRef : undefined}
            type="button"
            disabled={disabled}
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(line.id)}
          >
            {line.text}
          </button>
        )
      })}
    </div>
  )
}
