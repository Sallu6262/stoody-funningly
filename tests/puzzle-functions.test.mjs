import test from 'node:test'
import assert from 'node:assert/strict'
import getActivePaper from '../netlify/functions/puzzle-paper.mjs'
import savePuzzleDraft from '../netlify/functions/puzzle-draft.mjs'
import submitPuzzle from '../netlify/functions/puzzle-submit.mjs'
import getPuzzleStatus from '../netlify/functions/puzzle-status.mjs'

const originalFetch = globalThis.fetch
const originalUrl = process.env.GOOGLE_APPS_SCRIPT_URL
const originalSecret = process.env.PUZZLE_API_SECRET

test.beforeEach(() => {
  process.env.GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/example/exec'
  process.env.PUZZLE_API_SECRET = 'server-only-secret'
})

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test.after(() => {
  if (originalUrl === undefined) delete process.env.GOOGLE_APPS_SCRIPT_URL
  else process.env.GOOGLE_APPS_SCRIPT_URL = originalUrl
  if (originalSecret === undefined) delete process.env.PUZZLE_API_SECRET
  else process.env.PUZZLE_API_SECRET = originalSecret
})

test('submission forwards only sanitized answers and server-owned authentication', async () => {
  let forwarded
  globalThis.fetch = async (_url, options) => {
    forwarded = JSON.parse(options.body)
    return new Response(JSON.stringify({ ok: true, status: 'PENDING', submittedAt: '2026-10-26T00:00:00Z' }))
  }

  const response = await submitPuzzle(new Request('http://localhost/api/puzzle/submit', {
    method: 'POST',
    body: JSON.stringify({
      requestId: 'request-123',
      attemptId: 'attempt-123',
      playerId: 'SW-player-123',
      paperId: 'paper-2026-10-26',
      questionId: 'checkpoint-1',
      checkpointId: 1,
      schemaVersion: 1,
      answers: { method_choice: 'method-b', final_value: 42 },
      status: 'APPROVED',
      lockCode: '0000',
      secret: 'attacker-secret'
    })
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(forwarded, {
    action: 'paper.submit',
    requestId: 'request-123',
    attemptId: 'attempt-123',
    playerId: 'SW-player-123',
    paperId: 'paper-2026-10-26',
    questionId: 'checkpoint-1',
    checkpointId: 1,
    schemaVersion: 1,
    answers: { method_choice: 'method-b', final_value: '42' },
    secret: 'server-only-secret'
  })
})

test('status lookup cannot send a client-selected approval state', async () => {
  let forwarded
  globalThis.fetch = async (_url, options) => {
    forwarded = JSON.parse(options.body)
    return new Response(JSON.stringify({ ok: true, status: 'APPROVED', lockCode: '1842' }))
  }

  const response = await getPuzzleStatus(new Request(
    'http://localhost/api/puzzle/status?playerId=SW-player-123&paperId=paper-2026-10-26&questionId=checkpoint-1&status=APPROVED'
  ))

  assert.equal(response.status, 200)
  assert.deepEqual(forwarded, {
    action: 'paper.status',
    playerId: 'SW-player-123',
    paperId: 'paper-2026-10-26',
    questionId: 'checkpoint-1',
    secret: 'server-only-secret'
  })
})

test('malformed identifiers and empty answer sets are rejected before Google is called', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response('{}')
  }

  const response = await submitPuzzle(new Request('http://localhost/api/puzzle/submit', {
    method: 'POST',
    body: JSON.stringify({
      requestId: 'x',
      attemptId: 'attempt-123',
      playerId: 'SW-player-123',
      paperId: 'paper-2026-10-26',
      questionId: 'checkpoint-1',
      answers: {}
    })
  }))

  assert.equal(response.status, 400)
  assert.equal(calls, 0)
})

test('active paper lookup forwards only the checkpoint and server secret', async () => {
  let forwarded
  globalThis.fetch = async (_url, options) => {
    forwarded = JSON.parse(options.body)
    return new Response(JSON.stringify({ ok: true, paper: { paperId: 'paper-2026-10-26', fields: [] } }))
  }

  const response = await getActivePaper(new Request('http://localhost/api/puzzle/paper?checkpointId=1&lockCode=0000'))

  assert.equal(response.status, 200)
  assert.deepEqual(forwarded, {
    action: 'paper.getActive',
    checkpointId: 1,
    secret: 'server-only-secret'
  })
})

test('draft autosave cannot forward client-selected approval or lock data', async () => {
  let forwarded
  globalThis.fetch = async (_url, options) => {
    forwarded = JSON.parse(options.body)
    return new Response(JSON.stringify({ ok: true, status: 'DRAFT' }))
  }

  const response = await savePuzzleDraft(new Request('http://localhost/api/puzzle/draft', {
    method: 'POST',
    body: JSON.stringify({
      attemptId: 'attempt-123',
      playerId: 'SW-player-123',
      paperId: 'paper-2026-10-26',
      questionId: 'checkpoint-1',
      checkpointId: 1,
      schemaVersion: 2,
      answers: { final_value: -42.5 },
      status: 'APPROVED',
      lockCode: '0000'
    })
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(forwarded, {
    action: 'paper.saveDraft',
    attemptId: 'attempt-123',
    playerId: 'SW-player-123',
    paperId: 'paper-2026-10-26',
    questionId: 'checkpoint-1',
    checkpointId: 1,
    schemaVersion: 2,
    answers: { final_value: '-42.5' },
    secret: 'server-only-secret'
  })
})
