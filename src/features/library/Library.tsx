import { useEffect, useState } from 'react'
import type { Speech } from '../../domain/types'
import type { SessionStore } from '../session/sessionStore'
import '../../app/App.css'

type LibraryProps = {
  speeches: Speech[]
  store: SessionStore
  onSelect: (speechId: string) => void
}

type ProgressEntry = Awaited<ReturnType<SessionStore['getProgress']>>

export function Library({ speeches, store, onSelect }: LibraryProps) {
  const [progress, setProgress] = useState<Map<string, ProgressEntry>>(new Map())

  useEffect(() => {
    let current = true
    Promise.all(
      speeches.map(async (speech) => [speech.id, await store.getProgress(speech.id)] as const),
    ).then((entries) => {
      if (!current) return
      setProgress(new Map(entries))
    }).catch(() => {
      // Progress is a convenience display; leave cards showing "Not started" if it can't be loaded.
    })
    return () => {
      current = false
    }
  }, [speeches, store])

  return (
    <div className="library-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Speak Along home">Speak Along</a>
      </header>
      <main className="library-grid" aria-label="Speech library">
        {speeches.map((speech) => {
          const completedCount = progress.get(speech.id)?.completedCount ?? 0
          return (
            <button
              key={speech.id}
              type="button"
              className="speech-card"
              onClick={() => onSelect(speech.id)}
            >
              <img className="speech-thumbnail" src={`https://img.youtube.com/vi/${speech.videoId}/hqdefault.jpg`} alt="" />
              <span className="speech-title">{speech.title}</span>
              <span className="speech-progress">
                {completedCount > 0 ? `${completedCount}/${speech.lines.length} recorded` : 'Not started'}
              </span>
            </button>
          )
        })}
      </main>
    </div>
  )
}
