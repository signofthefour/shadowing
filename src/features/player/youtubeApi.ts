export type YouTubePlayerLike = {
  loadVideoById(options: {
    videoId: string
    startSeconds: number
    endSeconds: number
  }): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  pauseVideo(): void
  destroy(): void
}

type YouTubeNamespace = {
  Player: new (
    elementId: string,
    options: {
      videoId: string
      playerVars: Record<string, number | string>
      events: {
        onReady: () => void
        onStateChange: (event: { data: number }) => void
        onError: () => void
      }
    },
  ) => YouTubePlayerLike
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

export type YouTubePort = {
  playRange(startSeconds: number, endSeconds: number): void
  cue(seconds: number): void
  destroy(): void
}

export function makePlayerPort(
  player: YouTubePlayerLike,
  videoId: string,
): YouTubePort {
  return {
    playRange(startSeconds, endSeconds) {
      player.loadVideoById({ videoId, startSeconds, endSeconds })
    },
    cue(seconds) {
      player.seekTo(seconds, true)
      player.pauseVideo()
    },
    destroy() {
      player.destroy()
    },
  }
}

let apiPromise: Promise<YouTubeNamespace> | null = null

function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      if (window.YT) resolve(window.YT)
      else reject(new Error('YouTube API did not initialize.'))
    }

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new Error('YouTube could not be loaded. Check your connection.'))
    document.head.append(script)
  }).catch((error: unknown) => {
    apiPromise = null
    throw error
  })

  return apiPromise
}

export async function createYouTubePort(options: {
  elementId: string
  videoId: string
  onFinished: () => void
  onError: (message: string) => void
}): Promise<YouTubePort> {
  const api = await loadYouTubeApi()
  return new Promise((resolve, reject) => {
    let player: YouTubePlayerLike
    let ready = false
    player = new api.Player(options.elementId, {
      videoId: options.videoId,
      playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
      events: {
        onReady: () => {
          ready = true
          resolve(makePlayerPort(player, options.videoId))
        },
        onStateChange: ({ data }) => {
          if (data === 0) options.onFinished()
        },
        onError: () => {
          const message = 'The video could not be played. Check your connection and retry.'
          if (ready) options.onError(message)
          else reject(new Error(message))
        },
      },
    })
  })
}
