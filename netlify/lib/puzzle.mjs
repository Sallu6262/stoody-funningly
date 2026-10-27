const ID_PATTERN = /^[a-zA-Z0-9_-]{3,120}$/

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  })
}

export function validateId(value, label) {
  const normalized = String(value || '').trim()
  if (!ID_PATTERN.test(normalized)) throw new Error(`Invalid ${label}`)
  return normalized
}

export function sanitizeAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Answers must be an object')
  const entries = Object.entries(value)
  if (!entries.length || entries.length > 40) throw new Error('Invalid answer count')
  const answers = {}
  for (const [key, answer] of entries) {
    const fieldId = validateId(key, 'answer field')
    const text = Array.isArray(answer) ? answer.map(String) : String(answer ?? '')
    const length = Array.isArray(text) ? text.join('').length : text.length
    if (length > 5000) throw new Error(`Answer ${fieldId} is too long`)
    answers[fieldId] = text
  }
  return answers
}

export async function parseBody(request) {
  const raw = await request.text()
  if (!raw || raw.length > 60000) throw new Error('Invalid request body')
  return JSON.parse(raw)
}

export async function callAppsScript(payload) {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL
  const secret = process.env.PUZZLE_API_SECRET
  if (!url || !secret) {
    const error = new Error('Puzzle backend is not configured')
    error.status = 503
    throw error
  }

  const response = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: JSON.stringify({ ...payload, secret })
  })
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Google Apps Script returned an invalid response')
  }
  if (!response.ok || data.ok === false) throw new Error(data.error || `Approval service failed (${response.status})`)
  return data
}

export function errorResponse(error) {
  const status = Number(error.status) || (/invalid|too long|must be/i.test(error.message) ? 400 : 502)
  return json({ ok: false, error: error.message || 'Unexpected server error' }, status)
}
