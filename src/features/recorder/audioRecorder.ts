const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
]

export function selectRecordingMimeType(
  isSupported: (type: string) => boolean,
): string | undefined {
  return PREFERRED_TYPES.find(isSupported)
}

export type RecordedAudio = {
  blob: Blob
  mimeType: string
  durationMs: number
}

export type AudioRecorderPort = {
  start(): void
  stop(): Promise<RecordedAudio>
  release(): void
}

export async function createAudioRecorder(): Promise<AudioRecorderPort> {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw new Error('Audio recording is not supported in this browser.')
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error('Microphone access is blocked. Enable it in your browser settings, then try again.')
    }
    throw new Error('The microphone could not be opened. Check it and try again.')
  }

  const mimeType = selectRecordingMimeType(MediaRecorder.isTypeSupported)
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  let chunks: Blob[] = []
  let startedAt = 0

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  })

  return {
    start() {
      chunks = []
      startedAt = performance.now()
      recorder.start()
    },
    stop() {
      return new Promise((resolve, reject) => {
        recorder.addEventListener(
          'stop',
          () => {
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
            if (blob.size === 0) {
              reject(new Error('No audio was captured. Record the sentence again.'))
              return
            }
            resolve({
              blob,
              mimeType: blob.type,
              durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
            })
          },
          { once: true },
        )
        recorder.stop()
      })
    },
    release() {
      stream.getTracks().forEach((track) => track.stop())
    },
  }
}
