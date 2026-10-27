import { callAppsScript, errorResponse, json } from '../lib/puzzle.mjs'

export default async (request) => {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405)
  try {
    const url = new URL(request.url)
    const checkpointId = Math.max(1, Math.min(99, Number(url.searchParams.get('checkpointId')) || 1))
    return json(await callAppsScript({ action: 'paper.getActive', checkpointId }))
  } catch (error) {
    return errorResponse(error)
  }
}
