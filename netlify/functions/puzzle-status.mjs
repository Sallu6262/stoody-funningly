import { callAppsScript, errorResponse, json, validateId } from '../lib/puzzle.mjs'

export default async (request) => {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405)
  try {
    const url = new URL(request.url)
    const payload = {
      action: 'paper.status',
      playerId: validateId(url.searchParams.get('playerId'), 'player ID'),
      paperId: validateId(url.searchParams.get('paperId'), 'paper ID'),
      questionId: validateId(url.searchParams.get('questionId'), 'question ID')
    }
    return json(await callAppsScript(payload))
  } catch (error) {
    return errorResponse(error)
  }
}
