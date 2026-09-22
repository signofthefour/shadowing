import { expect, test } from '@playwright/test'
import transcriptLines from '../src/data/speeches/stanfordSpeech.generated.json' with { type: 'json' }

const SPEECH_ID = 'steve-jobs-stanford-2005'

async function installPracticeFakes(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(type: string) {
        return type === 'audio/webm;codecs=opus'
      }

      readonly mimeType = 'audio/webm;codecs=opus'

      start() {}

      stop() {
        const event = new Event('dataavailable')
        Object.defineProperty(event, 'data', {
          value: new Blob([localStorage.getItem('e2e-recording-body') ?? 'recorded voice'], { type: this.mimeType }),
        })
        this.dispatchEvent(event)
        this.dispatchEvent(new Event('stop'))
      }
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (localStorage.getItem('e2e-microphone-denied') === 'true') {
            throw new DOMException('Permission denied', 'NotAllowedError')
          }
          return { getTracks: () => [{ stop() {} }] }
        },
      },
    })
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    })

    class FakeYouTubePlayer {
      private readonly events: {
        onReady: () => void
        onStateChange: (event: { data: number }) => void
        onError: () => void
      }

      constructor(_elementId: string, options: {
        events: {
          onReady: () => void
          onStateChange: (event: { data: number }) => void
          onError: () => void
        }
      }) {
        this.events = options.events
        const failuresRemaining = Number(localStorage.getItem('e2e-video-failures') ?? 0)
        if (failuresRemaining > 0) {
          localStorage.setItem('e2e-video-failures', String(failuresRemaining - 1))
          queueMicrotask(() => this.events.onError())
        } else {
          queueMicrotask(() => this.events.onReady())
        }
      }

      loadVideoById() {
        if (localStorage.getItem('e2e-video-playback-fails') === 'true') {
          localStorage.setItem('e2e-video-playback-fails', 'false')
          queueMicrotask(() => this.events.onError())
          return
        }
        setTimeout(() => this.events.onStateChange({ data: 0 }), 0)
      }

      seekTo() {}
      pauseVideo() {}
      destroy() {}
    }

    Object.defineProperty(window, 'YT', {
      configurable: true,
      value: { Player: FakeYouTubePlayer },
    })

    class FakeAudioContext {
      async decodeAudioData() {
        if (localStorage.getItem('e2e-export-fails') === 'true') {
          throw new Error('Audio could not be decoded.')
        }
        const samples = new Float32Array([0, 0.25, -0.25, 0])
        return {
          sampleRate: 44_100,
          numberOfChannels: 1,
          length: samples.length,
          duration: samples.length / 44_100,
          getChannelData: () => samples,
        }
      }

      async close() {}
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    })

    class FakeAudio extends EventTarget {
      constructor(readonly src: string) {
        super()
      }

      pause() {}

      async play() {
        const plays = Number(localStorage.getItem('e2e-audio-play-count') ?? 0)
        localStorage.setItem('e2e-audio-play-count', String(plays + 1))
        queueMicrotask(() => this.dispatchEvent(new Event('ended')))
      }
    }

    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: FakeAudio,
    })
  })
}

async function finishSourceAndRecord(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Hear this line' }).click()
  await expect(page.getByRole('button', { name: 'Record' })).toBeEnabled()
  await page.getByRole('button', { name: 'Record' }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeEnabled()
}

async function seedCompletedSession(page: import('@playwright/test').Page) {
  await page.evaluate(async ({ speechId, lineIds }) => {
    const request = indexedDB.open('shadowing-practice', 1)
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['session', 'takes'], 'readwrite')
    transaction.objectStore('session').put({
      speechId,
      activeLineId: lineIds.at(-1),
      completedLineIds: lineIds,
      updatedAt: '2026-09-21T00:00:00.000Z',
    }, speechId)
    const takes = transaction.objectStore('takes')
    for (const lineId of lineIds) {
      takes.put({
        key: `${speechId}:${lineId}`,
        speechId,
        lineId,
        blob: new Blob(['voice'], { type: 'audio/webm' }),
        mimeType: 'audio/webm',
        durationMs: 100,
        recordedAt: '2026-09-21T00:00:00.000Z',
      })
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  }, {
    speechId: SPEECH_ID,
    lineIds: transcriptLines.map((line) => line.id),
  })
}

async function storedTakeBody(page: import('@playwright/test').Page, lineId: string) {
  return page.evaluate(async ({ speechId, lineId }) => {
    const request = indexedDB.open('shadowing-practice', 1)
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const record = await new Promise<{ blob: Blob } | undefined>((resolve, reject) => {
      const getRequest = database.transaction('takes').objectStore('takes').get(`${speechId}:${lineId}`)
      getRequest.onsuccess = () => resolve(getRequest.result)
      getRequest.onerror = () => reject(getRequest.error)
    })
    database.close()
    return record?.blob.text() ?? null
  }, { speechId: SPEECH_ID, lineId })
}

async function openStanfordSpeech(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Stanford Commencement/ }).click()
}

test.beforeEach(async ({ page }) => {
  await installPracticeFakes(page)
})

test('shows the Stanford practice screen and erases only after confirmation', async ({ page }) => {
  await page.goto('/')
  await openStanfordSpeech(page)
  await expect(page.getByText('Line 1 of 144')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quit & Erase' })).toBeVisible()

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Quit & Erase' }).click()
  await expect(page.getByText('Line 1 of 144')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Quit & Erase' }).click()
  await expect(page.getByText('Line 1 of 144')).toBeVisible()
})

test('advances without recording and restores the skipped position', async ({ page }) => {
  await page.goto('/')
  await openStanfordSpeech(page)

  const next = page.getByRole('button', { name: 'Next', exact: true })
  await expect(next).toBeEnabled()
  await next.click()
  await expect(page.getByText('Line 2 of 144')).toBeVisible()

  await page.reload()

  await expect(page.getByText('Line 2 of 144')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeDisabled()
})

test('restores the recorded take and next line after refresh', async ({ page }) => {
  await page.goto('/')
  await openStanfordSpeech(page)

  await finishSourceAndRecord(page)

  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Line 2 of 144')).toBeVisible()

  await page.reload()

  await expect(page.getByText('Line 2 of 144')).toBeVisible()
  await page.locator('.lyric-line').first().click()
  await page.getByRole('button', { name: 'Listen', exact: true }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('e2e-audio-play-count'))).toBe('1')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('explains microphone denial and keeps the current line', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('e2e-microphone-denied', 'true'))
  await page.goto('/')
  await openStanfordSpeech(page)

  await page.getByRole('button', { name: 'Hear this line' }).click()
  await expect(page.getByRole('button', { name: 'Record' })).toBeEnabled()
  await page.getByRole('button', { name: 'Record' }).click()

  await expect(page.getByRole('alert')).toContainText('Microphone access is blocked')
  await expect(page.getByRole('button', { name: 'Retry video' })).toHaveCount(0)
  await expect(page.getByText('Line 1 of 144')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeDisabled()
})

test('preserves the previous take when a replacement cannot be stored', async ({ page }) => {
  await page.goto('/')
  await openStanfordSpeech(page)
  await finishSourceAndRecord(page)
  await page.evaluate(() => {
    localStorage.setItem('e2e-video-playback-fails', 'true')
    localStorage.setItem('e2e-recording-body', 'replacement voice')
    IDBObjectStore.prototype.put = function put() {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
  })

  await page.getByRole('button', { name: 'Hear this line' }).click()
  await expect(page.getByRole('button', { name: 'Retry video' })).toBeVisible()
  await page.getByRole('button', { name: 'Record' }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()

  await expect(page.getByRole('alert')).toContainText('Browser storage is full. Clear some space and record again.')
  await expect(page.getByRole('button', { name: 'Retry video' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeEnabled()
  await expect.poll(() => storedTakeBody(page, transcriptLines[0].id)).toBe('recorded voice')
  await expect(page.getByText('Line 1 of 144')).toBeVisible()
})

test('recovers from an initial video failure when retried', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('e2e-video-failures', '1'))
  await page.goto('/')
  await openStanfordSpeech(page)

  await expect(page.getByRole('alert')).toContainText('The video could not be played')
  await page.getByRole('button', { name: 'Retry video' }).click()

  await expect(page.getByRole('alert')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Hear this line' })).toBeEnabled()
  await page.getByRole('button', { name: 'Hear this line' }).click()
  await expect(page.getByRole('button', { name: 'Record' })).toBeEnabled()
})

test('downloads a completed session as MP3', async ({ page }) => {
  await page.goto('/')
  await openStanfordSpeech(page)
  await seedCompletedSession(page)
  await page.reload()
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download MP3' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('steve-jobs-stanford-2005-shadowing-session.mp3')
  let downloadedBytes = 0
  for await (const chunk of await download.createReadStream()) downloadedBytes += chunk.length
  expect(downloadedBytes).toBeGreaterThan(0)
})

test('preserves a completed session when MP3 creation fails', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('e2e-export-fails') === null) {
      localStorage.setItem('e2e-export-fails', 'true')
    }
  })
  await page.goto('/')
  await openStanfordSpeech(page)
  await seedCompletedSession(page)
  await page.reload()
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  await page.getByRole('button', { name: 'Download MP3' }).click()

  await expect(page.getByRole('alert')).toContainText('Audio could not be decoded.')
  await expect(page.getByRole('button', { name: 'Retry video' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download MP3' })).toBeEnabled()

  await page.evaluate(() => localStorage.setItem('e2e-export-fails', 'false'))
  await page.reload()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download MP3' }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('steve-jobs-stanford-2005-shadowing-session.mp3')
})
