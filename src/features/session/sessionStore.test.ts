import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createSessionStore } from './sessionStore'
import type { PracticeSession, StoredTake } from '../../domain/types'

const session: PracticeSession = {
  speechId: 'steve-jobs-stanford-2005',
  activeLineId: 'line-002',
  completedLineIds: ['line-001'],
  updatedAt: '2026-09-16T00:00:00.000Z',
}

const take: StoredTake = {
  lineId: 'line-001',
  blob: new Blob(['audio'], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  durationMs: 1200,
  recordedAt: '2026-09-16T00:00:00.000Z',
}

describe('session store', () => {
  afterEach(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('shadowing-practice')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })

  it('restores progress and recorded takes', async () => {
    const store = createSessionStore()
    await store.saveProgress(session)
    await store.replaceTake(session.speechId, take)

    const restored = await store.load(session.speechId)

    expect(restored.session).toEqual(session)
    expect(restored.takes).toHaveLength(1)
    expect(restored.takes[0]).toMatchObject({ lineId: 'line-001', durationMs: 1200 })
  })

  it('quit and erase deletes progress and every take', async () => {
    const store = createSessionStore()
    await store.saveProgress(session)
    await store.replaceTake(session.speechId, take)

    await store.discard(session.speechId)

    expect(await store.load(session.speechId)).toEqual({ session: null, takes: [] })
  })
})
