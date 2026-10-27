import { callAppsScript, errorResponse, json, parseBody, sanitizeAnswers, validateId } from '../lib/puzzle.mjs'

export default async (request) => {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  try {
    const body = await parseBody(request)
    const payload = {
      action: 'paper.submit',
      requestId: validateId(body.requestId, 'request ID'),
      attemptId: validateId(body.attemptId, 'attempt ID'),
      playerId: validateId(body.playerId, 'player ID'),
      paperId: validateId(body.paperId, 'paper ID'),
      questionId: validateId(body.questionId, 'question ID'),
      checkpointId: Math.max(1, Math.min(99, Number(body.checkpointId) || 1)),
      schemaVersion: Math.max(1, Math.min(999, Number(body.schemaVersion) || 1)),
      answers: sanitizeAnswers(body.answers)
    }
    return json(await callAppsScript(payload))
  } catch (error) {
    return errorResponse(error)
  }
}
