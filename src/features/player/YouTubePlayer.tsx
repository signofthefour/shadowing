import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createYouTubePort, type YouTubePort } from './youtubeApi'

export type YouTubePlayerHandle = Pick<YouTubePort, 'playRange' | 'cue'>

type YouTubePlayerProps = {
  videoId: string
  onFinished: () => void
  onError: (message: string) => void
  onReady?: () => void
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId, onFinished, onError, onReady }, ref) {
    const portRef = useRef<YouTubePort | null>(null)
    const [ready, setReady] = useState(false)
    const elementId = useRef(`youtube-player-${crypto.randomUUID()}`).current

    useImperativeHandle(ref, () => ({
      playRange(startSeconds, endSeconds) {
        portRef.current?.playRange(startSeconds, endSeconds)
      },
      cue(seconds) {
        portRef.current?.cue(seconds)
      },
    }))

    useEffect(() => {
      let mounted = true
      createYouTubePort({ elementId, videoId, onFinished, onError })
        .then((port) => {
          if (!mounted) return port.destroy()
          portRef.current = port
          setReady(true)
          onReady?.()
        })
        .catch((error: unknown) => onError(error instanceof Error ? error.message : 'YouTube could not be loaded.'))
      return () => {
        mounted = false
        portRef.current?.destroy()
      }
    }, [elementId, onError, onFinished, onReady, videoId])

    return (
      <div className="youtube-frame-wrap" aria-busy={!ready}>
        <div id={elementId} />
        {!ready && <p className="video-loading">Loading video…</p>}
      </div>
    )
  },
)
