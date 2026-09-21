import { openDB } from 'idb'
import type { PracticeSession, StoredTake } from '../../domain/types'

const DATABASE_NAME = 'shadowing-practice'

type TakeRecord = StoredTake & { speechId: PracticeSession['speechId'] }

async function openSessionDatabase() {
  return openDB(DATABASE_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('session')
      const takes = database.createObjectStore('takes', { keyPath: 'key' })
      takes.createIndex('by-speech', 'speechId')
    },
  })
}

export type SessionStore = {
  load(speechId: PracticeSession['speechId']): Promise<{
    session: PracticeSession | null
    takes: StoredTake[]
  }>
  saveProgress(session: PracticeSession): Promise<void>
  replaceTake(speechId: PracticeSession['speechId'], take: StoredTake): Promise<void>
  discard(speechId: PracticeSession['speechId']): Promise<void>
}

export function createSessionStore(): SessionStore {
  return {
    async load(speechId) {
      const database = await openSessionDatabase()
      try {
        const transaction = database.transaction(['session', 'takes'], 'readonly')
        const session = (await transaction.objectStore('session').get(speechId)) ?? null
        const records = await transaction.objectStore('takes').index('by-speech').getAll(speechId)
        await transaction.done
        return {
          session,
          takes: records
            .map(({ speechId: _speechId, key: _key, ...take }) => take as StoredTake)
            .sort((a, b) => a.lineId.localeCompare(b.lineId)),
        }
      } finally {
        database.close()
      }
    },

    async saveProgress(session) {
      const database = await openSessionDatabase()
      try {
        await database.put('session', session, session.speechId)
      } finally {
        database.close()
      }
    },

    async replaceTake(speechId, take) {
      const database = await openSessionDatabase()
      try {
        await database.put('takes', {
          ...take,
          speechId,
          key: `${speechId}:${take.lineId}`,
        } satisfies TakeRecord & { key: string })
      } finally {
        database.close()
      }
    },

    async discard(speechId) {
      const database = await openSessionDatabase()
      try {
        const transaction = database.transaction(['session', 'takes'], 'readwrite')
        await transaction.objectStore('session').delete(speechId)
        const takeStore = transaction.objectStore('takes')
        const keys = await takeStore.index('by-speech').getAllKeys(speechId)
        await Promise.all(keys.map((key) => takeStore.delete(key)))
        await transaction.done
      } finally {
        database.close()
      }
    },
  }
}
