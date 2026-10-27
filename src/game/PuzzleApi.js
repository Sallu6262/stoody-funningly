import { PUZZLE_CONFIG, getFallbackPaper } from './puzzleConfig.js'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const MOCK_KEY = 'sw-racing-puzzle-api-mock-v1'
const MOCK_DRAFT_KEY = 'sw-racing-puzzle-api-draft-v1'

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

function readJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing can disable storage. The current session still works.
  }
}

export function getOrCreatePlayerId() {
  let playerId = readJson(PUZZLE_CONFIG.playerStorageKey)
  if (typeof playerId !== 'string' || !playerId.startsWith('SW-')) {
    playerId = makeId('SW')
    writeJson(PUZZLE_CONFIG.playerStorageKey, playerId)
  }
  return playerId
}

export class PuzzleApi {
  constructor() {
    const local = LOCAL_HOSTS.has(window.location.hostname)
    this.mode = PUZZLE_CONFIG.apiMode === 'auto' ? (local ? 'mock' : 'live') : PUZZLE_CONFIG.apiMode
  }

  async request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed (${response.status})`)
    return data
  }

  async getActivePaper(checkpointId = 1) {
    if (this.mode === 'mock') return { ok: true, paper: getFallbackPaper(checkpointId) }
    const query = new URLSearchParams({ checkpointId: String(checkpointId) })
    return this.request(`/api/puzzle/paper?${query}`)
  }

  async saveDraft(payload) {
    if (this.mode === 'mock') {
      const record = {
        ...payload,
        ok: true,
        status: 'DRAFT',
        updatedAt: new Date().toISOString()
      }
      writeJson(MOCK_DRAFT_KEY, record)
      return record
    }
    return this.request('/api/puzzle/draft', { method: 'POST', body: JSON.stringify(payload) })
  }

  async submit(payload) {
    if (this.mode === 'mock') {
      const records = readJson(MOCK_KEY, {})
      const record = {
        ok: true,
        submissionId: makeId('SUB'),
        requestId: payload.requestId,
        playerId: payload.playerId,
        paperId: payload.paperId,
        attemptId: payload.attemptId,
        questionId: payload.questionId,
        answers: payload.answers,
        status: 'PENDING',
        feedback: '',
        submittedAt: new Date().toISOString()
      }
      records[payload.paperId] = record
      writeJson(MOCK_KEY, records)
      return record
    }
    return this.request('/api/puzzle/submit', { method: 'POST', body: JSON.stringify(payload) })
  }

  async status({ playerId, paperId, questionId }) {
    if (this.mode === 'mock') {
      const records = readJson(MOCK_KEY, {})
      const record = records?.paperId ? records : records?.[paperId]
      if (!record || record.playerId !== playerId || record.paperId !== paperId || record.questionId !== questionId) {
        return { ok: true, status: 'NOT_SUBMITTED' }
      }
      return { ...record, ok: true }
    }
    const query = new URLSearchParams({ playerId, paperId, questionId })
    return this.request(`/api/puzzle/status?${query}`)
  }

  setMockStatus(status, feedback = '', paperId = null) {
    if (this.mode !== 'mock') return false
    const records = readJson(MOCK_KEY, {})
    const legacy = records?.paperId ? records : null
    const key = paperId || legacy?.paperId || Object.keys(records)[0]
    const record = legacy || records[key]
    if (!record) return false
    const normalized = String(status).trim().toUpperCase()
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(normalized)) return false
    record.status = normalized
    record.feedback = String(feedback)
    if (normalized === 'APPROVED' && !record.lockCode) {
      const bytes = new Uint16Array(1)
      globalThis.crypto?.getRandomValues?.(bytes)
      record.lockCode = String(1000 + ((bytes[0] || Date.now()) % 9000))
    }
    const next = legacy ? { [record.paperId]: record } : records
    next[record.paperId] = record
    writeJson(MOCK_KEY, next)
    return true
  }
}

export { makeId, readJson, writeJson }
