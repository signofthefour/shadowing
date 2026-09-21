import { describe, expect, it, vi } from 'vitest'
import { createYouTubePort, makePlayerPort } from './youtubeApi'

describe('YouTube player port', () => {
  it('plays only the selected transcript range', () => {
    const player = {
      loadVideoById: vi.fn(),
      seekTo: vi.fn(),
      pauseVideo: vi.fn(),
      destroy: vi.fn(),
    }
    const port = makePlayerPort(player, 'UF8uR6Z6KLc')

    port.playRange(10.2, 14.8)

    expect(player.loadVideoById).toHaveBeenCalledWith({
      videoId: 'UF8uR6Z6KLc',
      startSeconds: 10.2,
      endSeconds: 14.8,
    })
  })

  it('seeks without continuing playback', () => {
    const player = {
      loadVideoById: vi.fn(),
      seekTo: vi.fn(),
      pauseVideo: vi.fn(),
      destroy: vi.fn(),
    }
    const port = makePlayerPort(player, 'UF8uR6Z6KLc')

    port.cue(25)

    expect(player.seekTo).toHaveBeenCalledWith(25, true)
    expect(player.pauseVideo).toHaveBeenCalledOnce()
  })

  it('identifies the host-page origin to the iframe player', async () => {
    let receivedPlayerVars: Record<string, unknown> | undefined
    class FakePlayer {
      constructor(_elementId: string, options: {
        playerVars: Record<string, number | string>
        events: {
          onReady: () => void
          onStateChange: (event: { data: number }) => void
          onError: () => void
        }
      }) {
        receivedPlayerVars = options.playerVars
        queueMicrotask(options.events.onReady)
      }

      loadVideoById() {}
      seekTo() {}
      pauseVideo() {}
      destroy() {}
    }
    window.YT = { Player: FakePlayer }

    try {
      await createYouTubePort({
        elementId: 'youtube-player-test',
        videoId: 'UF8uR6Z6KLc',
        onFinished() {},
        onError() {},
      })

      expect(receivedPlayerVars).toMatchObject({ origin: 'http://localhost:3000' })
    } finally {
      delete window.YT
    }
  })
})
