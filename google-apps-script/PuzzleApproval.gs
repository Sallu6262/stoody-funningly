/**
 * Salman & Wajeha Racing daily-paper service.
 * One spreadsheet stores Papers, Questions and Responses.
 * The browser never calls this web app directly; Netlify adds the secret.
 */

const TAB_NAMES = Object.freeze({ papers: 'Papers', questions: 'Questions', responses: 'Responses' })
const PAPER_HEADERS = Object.freeze([
  'PAPER_ID', 'TITLE', 'CHECKPOINT_ID', 'PUZZLE_ID', 'INTRO_PROMPT', 'STATUS',
  'SCHEMA_VERSION', 'APPROVAL_MODE', 'PASS_PERCENT', 'TIMER_SECONDS', 'LOCK_NUMBER', 'LOCK_CODE', 'UPDATED_AT'
])
const QUESTION_HEADERS = Object.freeze([
  'PAPER_ID', 'QUESTION_ID', 'FIELD_ID', 'DISPLAY_ORDER', 'TYPE', 'LABEL',
  'QUESTION_TEXT', 'PLACEHOLDER', 'REQUIRED', 'OPTIONS_JSON', 'POINTS',
  'CORRECT_ANSWER', 'TOLERANCE', 'UNIT', 'MAX_LENGTH', 'STEP', 'ENABLED'
])
const RESPONSE_HEADERS = Object.freeze([
  'UPDATED_AT', 'STARTED_AT', 'SUBMITTED_AT', 'REVIEWED_AT', 'PAPER_ID', 'PAPER_TITLE',
  'CHECKPOINT_ID', 'PUZZLE_ID', 'ATTEMPT_ID', 'SUBMISSION_ID', 'PLAYER_ID', 'STATUS',
  'FEEDBACK', 'AUTO_SCORE', 'APPROVAL_MODE', 'ANSWER_JSON'
])

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Racing Papers')
    .addItem('Set up / repair workbook', 'setupPuzzleWorkbook')
    .addItem('Validate live papers', 'validateLivePapers')
    .addToUi()
}

function setupPuzzleWorkbook() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId())
  const defaultSheet = spreadsheet.getSheetByName('Sheet1')
  if (!spreadsheet.getSheetByName(TAB_NAMES.papers) && spreadsheet.getSheets().length === 1 &&
      defaultSheet && defaultSheet.getLastRow() <= 1 && defaultSheet.getLastColumn() <= 1) {
    defaultSheet.setName(TAB_NAMES.papers)
  }
  const papers = ensureSheet_(spreadsheet, TAB_NAMES.papers, PAPER_HEADERS)
  const questions = ensureSheet_(spreadsheet, TAB_NAMES.questions, QUESTION_HEADERS)
  const responses = ensureSheet_(spreadsheet, TAB_NAMES.responses, RESPONSE_HEADERS)
  addValidations_(papers, questions, responses)
  seedExamplePaper_(papers, questions)
  SpreadsheetApp.flush()
  return 'Workbook ready'
}

function validateLivePapers() {
  const records = tableRecords_(getSheet_(TAB_NAMES.papers))
  const live = records.filter(function(record) { return normalized_(record.STATUS) === 'LIVE' })
  if (!live.length) throw new Error('No paper is marked LIVE')
  const seen = {}
  live.forEach(function(record) {
    const checkpoint = String(record.CHECKPOINT_ID || '1')
    if (seen[checkpoint]) throw new Error('More than one LIVE paper uses checkpoint ' + checkpoint)
    seen[checkpoint] = true
    publicPaper_(record, questionRecords_(String(record.PAPER_ID)))
  })
  SpreadsheetApp.getActive().toast(live.length + ' live paper(s) validated', 'Racing Papers', 5)
}

function doGet() {
  return json_({ ok: true, service: 'salman-wajeha-papers', version: 2 })
}

function doPost(e) {
  const lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}')
    requireSecret_(payload.secret)
    if (payload.action === 'paper.getActive') return json_(getActivePaper_(payload))
    if (payload.action === 'paper.saveDraft') return json_(saveDraft_(payload))
    if (payload.action === 'paper.submit') return json_(submitPaper_(payload))
    if (payload.action === 'paper.status') return json_(getPaperStatus_(payload))
    return json_({ ok: false, error: 'Unknown action' })
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) })
  } finally {
    lock.releaseLock()
  }
}

function getActivePaper_(payload) {
  const checkpointId = String(Number(payload.checkpointId) || 1)
  const papers = tableRecords_(getSheet_(TAB_NAMES.papers)).filter(function(record) {
    return normalized_(record.STATUS) === 'LIVE' && String(record.CHECKPOINT_ID) === checkpointId
  })
  if (!papers.length) throw new Error('No LIVE paper is configured for checkpoint ' + checkpointId)
  if (papers.length > 1) throw new Error('Multiple LIVE papers are configured for checkpoint ' + checkpointId)
  const paperRecord = papers[0]
  return { ok: true, paper: publicPaper_(paperRecord, questionRecords_(String(paperRecord.PAPER_ID))) }
}

function saveDraft_(payload) {
  const context = submissionContext_(payload)
  const response = responseRow_(context, payload, true)
  if (normalized_(response.record.STATUS) === 'APPROVED') {
    return { ok: true, status: 'APPROVED', updatedAt: iso_(response.record.UPDATED_AT) }
  }
  const now = new Date()
  const record = baseResponseRecord_(context, payload, response.record, now)
  record.STATUS = 'DRAFT'
  record.UPDATED_AT = now
  record.ANSWER_JSON = JSON.stringify(context.answers)
  writeAnswers_(response.sheet, response.row, response.headers, context, record)
  return { ok: true, status: 'DRAFT', updatedAt: now.toISOString() }
}

function submitPaper_(payload) {
  const context = submissionContext_(payload)
  validateSubmissionAnswers_(context.questionRecords, context.answers)
  const response = responseRow_(context, payload, true)
  const now = new Date()
  const grade = gradeAnswers_(context.paperRecord, context.questionRecords, context.answers)
  const record = baseResponseRecord_(context, payload, response.record, now)
  record.SUBMISSION_ID = record.SUBMISSION_ID || Utilities.getUuid()
  record.SUBMITTED_AT = now
  record.UPDATED_AT = now
  record.AUTO_SCORE = grade.score === null ? '' : grade.score
  record.STATUS = grade.status
  record.FEEDBACK = grade.feedback
  record.ANSWER_JSON = JSON.stringify(context.answers)
  writeAnswers_(response.sheet, response.row, response.headers, context, record)

  const result = {
    ok: true,
    submissionId: String(record.SUBMISSION_ID),
    status: record.STATUS,
    feedback: record.FEEDBACK,
    autoScore: record.AUTO_SCORE,
    submittedAt: now.toISOString()
  }
  if (record.STATUS === 'APPROVED') result.lockCode = String(context.paperRecord.LOCK_CODE || '')
  return result
}

function getPaperStatus_(payload) {
  const paper = paperById_(String(payload.paperId))
  const sheet = getSheet_(TAB_NAMES.responses)
  const headers = readHeaders_(sheet)
  const record = findLatest_(sheet, headers, function(candidate) {
    return String(candidate.PAPER_ID) === String(payload.paperId) &&
      String(candidate.PLAYER_ID) === String(payload.playerId) &&
      String(candidate.PUZZLE_ID) === String(payload.questionId)
  })
  if (!record) return { ok: true, status: 'NOT_SUBMITTED' }

  const status = responseStatus_(record.STATUS)
  const result = {
    ok: true,
    submissionId: String(record.SUBMISSION_ID || ''),
    status: status,
    feedback: String(record.FEEDBACK || ''),
    autoScore: record.AUTO_SCORE === '' ? null : Number(record.AUTO_SCORE),
    submittedAt: iso_(record.SUBMITTED_AT),
    reviewedAt: iso_(record.REVIEWED_AT)
  }
  if (status === 'APPROVED') result.lockCode = String(paper.LOCK_CODE || '')
  return result
}

function submissionContext_(payload) {
  const paperRecord = paperById_(String(payload.paperId))
  if (normalized_(paperRecord.STATUS) !== 'LIVE') throw new Error('This paper is not live')
  if (String(paperRecord.PUZZLE_ID) !== String(payload.questionId)) throw new Error('Question does not belong to this paper')
  if (Number(payload.checkpointId) !== Math.max(1, Number(paperRecord.CHECKPOINT_ID) || 1)) {
    throw new Error('Checkpoint does not belong to this paper')
  }
  if (Number(payload.schemaVersion) !== Math.max(1, Number(paperRecord.SCHEMA_VERSION) || 1)) {
    throw new Error('This paper changed. Reload before continuing.')
  }
  const questionRecords = questionRecords_(String(paperRecord.PAPER_ID))
  publicPaper_(paperRecord, questionRecords)
  const allowed = {}
  questionRecords.forEach(function(record) { allowed[String(record.FIELD_ID)] = true })
  const answers = {}
  Object.keys(payload.answers || {}).forEach(function(fieldId) {
    if (!allowed[fieldId]) return
    const value = payload.answers[fieldId]
    answers[fieldId] = Array.isArray(value) ? value.map(String) : String(value === undefined || value === null ? '' : value)
  })
  return { paperRecord: paperRecord, questionRecords: questionRecords, answers: answers }
}

function validateSubmissionAnswers_(questions, answers) {
  questions.filter(function(record) { return truthy_(record.ENABLED, true) }).forEach(function(record) {
    const field = publicField_(record)
    const value = String(answers[field.id] === undefined ? '' : answers[field.id]).trim()
    if (field.required && !value) throw new Error('Missing required answer: ' + field.label)
    if (value.length > Math.min(5000, Math.max(1, Number(record.MAX_LENGTH) || 5000))) {
      throw new Error('Answer is too long: ' + field.label)
    }
    if (field.type === 'number' && value && !isFinite(Number(value))) throw new Error('Invalid number: ' + field.label)
    if (field.type === 'mcq' && value && !field.options.some(function(option) { return option.value === value })) {
      throw new Error('Invalid choice: ' + field.label)
    }
  })
}

function publicPaper_(paper, questions) {
  const paperId = id_(paper.PAPER_ID, 'paper ID')
  const puzzleId = id_(paper.PUZZLE_ID || ('checkpoint-' + paper.CHECKPOINT_ID), 'puzzle ID')
  const fields = questions
    .filter(function(record) { return truthy_(record.ENABLED, true) })
    .sort(function(a, b) { return Number(a.DISPLAY_ORDER || 0) - Number(b.DISPLAY_ORDER || 0) })
    .map(publicField_)
  if (!fields.length) throw new Error('Paper ' + paperId + ' has no enabled answer fields')
  return {
    paperId: paperId,
    id: puzzleId,
    schemaVersion: Math.max(1, Number(paper.SCHEMA_VERSION) || 1),
    checkpointId: Math.max(1, Number(paper.CHECKPOINT_ID) || 1),
    lockIndex: Math.max(0, (Number(paper.LOCK_NUMBER) || 1) - 1),
    title: String(paper.TITLE || 'Untitled paper'),
    prompt: String(paper.INTRO_PROMPT || ''),
    timerSeconds: Math.min(7200, Math.max(10, Number(paper.TIMER_SECONDS) || 300)),
    grading: {
      mode: normalized_(paper.APPROVAL_MODE || 'MANUAL').toLowerCase(),
      passingPercentage: Number(paper.PASS_PERCENT) || null
    },
    fields: fields
  }
}

function publicField_(record) {
  const type = normalized_(record.TYPE || 'TEXT').toLowerCase()
  if (['mcq', 'text', 'textarea', 'number'].indexOf(type) === -1) throw new Error('Unsupported field type: ' + type)
  const field = {
    id: id_(record.FIELD_ID, 'field ID'),
    questionId: id_(record.QUESTION_ID || record.FIELD_ID, 'question ID'),
    type: type,
    label: String(record.LABEL || record.QUESTION_TEXT || record.FIELD_ID),
    questionText: String(record.QUESTION_TEXT || ''),
    placeholder: String(record.PLACEHOLDER || ''),
    required: truthy_(record.REQUIRED, false)
  }
  if (record.MAX_LENGTH !== '') field.maxLength = Math.min(5000, Math.max(1, Number(record.MAX_LENGTH) || 500))
  if (record.STEP !== '') field.step = String(record.STEP)
  if (record.UNIT !== '') field.unit = String(record.UNIT)
  if (type === 'mcq') {
    let options
    try { options = JSON.parse(String(record.OPTIONS_JSON || '[]')) } catch (error) { throw new Error('Invalid OPTIONS_JSON for ' + field.id) }
    field.options = options.map(function(option, index) {
      return typeof option === 'object'
        ? { value: String(option.value), label: String(option.label) }
        : { value: String(index + 1), label: String(option) }
    })
    if (field.options.length < 2) throw new Error('MCQ ' + field.id + ' needs at least two options')
  }
  return field
}

function gradeAnswers_(paper, questions, answers) {
  const mode = normalized_(paper.APPROVAL_MODE || 'MANUAL')
  const pass = Number(paper.PASS_PERCENT) || 0
  const autoQuestions = questions.filter(function(record) {
    return String(record.CORRECT_ANSWER || '') !== '' && ['MCQ', 'NUMBER'].indexOf(normalized_(record.TYPE)) >= 0
  })
  let earned = 0
  let possible = 0
  autoQuestions.forEach(function(record) {
    const points = Math.max(0, Number(record.POINTS) || 1)
    possible += points
    const actual = String(answers[String(record.FIELD_ID)] === undefined ? '' : answers[String(record.FIELD_ID)]).trim()
    const expected = String(record.CORRECT_ANSWER).trim()
    let correct = actual.toLowerCase() === expected.toLowerCase()
    if (normalized_(record.TYPE) === 'NUMBER') {
      const tolerance = Math.max(0, Number(record.TOLERANCE) || 0)
      correct = actual !== '' && isFinite(Number(actual)) && Math.abs(Number(actual) - Number(expected)) <= tolerance
    }
    if (correct) earned += points
  })
  const score = possible ? Math.round((earned / possible) * 10000) / 100 : null
  const failedAuto = score !== null && score < pass
  if (mode === 'AUTO') {
    if (score === null) return { status: 'PENDING', score: null, feedback: 'Automatic grading is not configured; awaiting examiner review.' }
    return failedAuto
      ? { status: 'REJECTED', score: score, feedback: 'Automatic score ' + score + '% is below the required ' + pass + '%.' }
      : { status: 'APPROVED', score: score, feedback: '' }
  }
  if (mode === 'HYBRID' && failedAuto) {
    return { status: 'REJECTED', score: score, feedback: 'Automatic score ' + score + '% is below the required ' + pass + '%.' }
  }
  return { status: 'PENDING', score: score, feedback: '' }
}

function responseRow_(context, payload, create) {
  const sheet = getSheet_(TAB_NAMES.responses)
  const fields = context.questionRecords.map(publicField_)
  const headers = ensureResponseHeaders_(sheet, context.paperRecord, fields)
  let found = findLatestWithRow_(sheet, headers, function(record) {
    return String(record.PAPER_ID) === String(payload.paperId) &&
      String(record.PLAYER_ID) === String(payload.playerId) &&
      String(record.ATTEMPT_ID) === String(payload.attemptId)
  })
  if (!found && create) {
    const started = new Date()
    sheet.appendRow(headers.map(function(header) {
      if (header === 'STARTED_AT' || header === 'UPDATED_AT') return started
      if (header === 'PAPER_ID') return safeCell_(payload.paperId)
      if (header === 'PAPER_TITLE') return safeCell_(context.paperRecord.TITLE)
      if (header === 'CHECKPOINT_ID') return Number(context.paperRecord.CHECKPOINT_ID) || 1
      if (header === 'PUZZLE_ID') return safeCell_(context.paperRecord.PUZZLE_ID)
      if (header === 'ATTEMPT_ID') return safeCell_(payload.attemptId)
      if (header === 'PLAYER_ID') return safeCell_(payload.playerId)
      if (header === 'STATUS') return 'DRAFT'
      if (header === 'APPROVAL_MODE') return normalized_(context.paperRecord.APPROVAL_MODE || 'MANUAL')
      return ''
    }))
    found = { row: sheet.getLastRow(), record: rowRecord_(sheet, headers, sheet.getLastRow()) }
  }
  return { sheet: sheet, headers: headers, row: found.row, record: found.record }
}

function baseResponseRecord_(context, payload, existing, now) {
  const record = Object.assign({}, existing)
  record.PAPER_ID = payload.paperId
  record.PAPER_TITLE = context.paperRecord.TITLE
  record.CHECKPOINT_ID = Number(context.paperRecord.CHECKPOINT_ID) || 1
  record.PUZZLE_ID = context.paperRecord.PUZZLE_ID
  record.ATTEMPT_ID = payload.attemptId
  record.PLAYER_ID = payload.playerId
  record.APPROVAL_MODE = normalized_(context.paperRecord.APPROVAL_MODE || 'MANUAL')
  record.STARTED_AT = record.STARTED_AT || now
  return record
}

function writeAnswers_(sheet, row, headers, context, record) {
  context.questionRecords.forEach(function(question) {
    const fieldId = String(question.FIELD_ID)
    const header = answerHeader_(String(context.paperRecord.PAPER_ID), fieldId)
    record[header] = context.answers[fieldId] === undefined ? '' : context.answers[fieldId]
  })
  const values = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? safeCell_(record[header]) : ''
  })
  sheet.getRange(row, 1, 1, headers.length).setValues([values])
}

function ensureResponseHeaders_(sheet, paper, fields) {
  const dynamic = fields.map(function(field) { return answerHeader_(String(paper.PAPER_ID), field.id) })
  const headers = ensureHeaders_(sheet, RESPONSE_HEADERS.concat(dynamic))
  fields.forEach(function(field) {
    const header = answerHeader_(String(paper.PAPER_ID), field.id)
    const column = headers.indexOf(header) + 1
    const note = [field.questionText, field.label].filter(Boolean).join('\n\n')
    sheet.getRange(1, column).setNote(note).setWrap(true)
    sheet.setColumnWidth(column, 260)
  })
  return headers
}

function answerHeader_(paperId, fieldId) {
  return (String(paperId) + '::' + String(fieldId)).toUpperCase().replace(/[^A-Z0-9_:.-]+/g, '_').slice(0, 180)
}

function paperById_(paperId) {
  const paper = tableRecords_(getSheet_(TAB_NAMES.papers)).filter(function(record) {
    return String(record.PAPER_ID) === paperId
  })[0]
  if (!paper) throw new Error('Unknown paper ID')
  return paper
}

function questionRecords_(paperId) {
  return tableRecords_(getSheet_(TAB_NAMES.questions)).filter(function(record) {
    return String(record.PAPER_ID) === paperId
  })
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  if (!id) throw new Error('Run setupPuzzleWorkbook once from the spreadsheet')
  return SpreadsheetApp.openById(id)
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name)
  if (!sheet) throw new Error('Missing sheet tab: ' + name + '. Run setupPuzzleWorkbook.')
  return sheet
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name)
  ensureHeaders_(sheet, headers)
  sheet.setFrozenRows(1)
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setBackground('#173a3f').setFontColor('#fff4d1').setFontWeight('bold').setWrap(true)
  sheet.setRowHeight(1, 42)
  return sheet
}

function ensureHeaders_(sheet, required) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1)
  let headers = sheet.getLastRow() ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0] : []
  headers = headers.map(function(value) { return String(value).trim().toUpperCase() }).filter(String)
  required.forEach(function(header) { if (headers.indexOf(header) === -1) headers.push(header) })
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
  return headers
}

function readHeaders_(sheet) {
  if (!sheet.getLastRow()) return []
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function(value) { return String(value).trim().toUpperCase() })
}

function tableRecords_(sheet) {
  const headers = readHeaders_(sheet)
  if (sheet.getLastRow() < 2) return []
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(values) {
    const record = {}
    headers.forEach(function(header, index) { record[header] = values[index] })
    return record
  }).filter(function(record) { return Object.keys(record).some(function(key) { return String(record[key]) !== '' }) })
}

function findLatest_(sheet, headers, predicate) {
  const found = findLatestWithRow_(sheet, headers, predicate)
  return found ? found.record : null
}

function findLatestWithRow_(sheet, headers, predicate) {
  if (sheet.getLastRow() < 2) return null
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const record = {}
    headers.forEach(function(header, column) { record[header] = values[index][column] })
    if (predicate(record)) return { row: index + 2, record: record }
  }
  return null
}

function rowRecord_(sheet, headers, row) {
  const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0]
  const record = {}
  headers.forEach(function(header, index) { record[header] = values[index] })
  return record
}

function addValidations_(papers, questions, responses) {
  const paperStatus = SpreadsheetApp.newDataValidation().requireValueInList(['DRAFT', 'LIVE', 'CLOSED'], true).build()
  const approval = SpreadsheetApp.newDataValidation().requireValueInList(['MANUAL', 'AUTO', 'HYBRID'], true).build()
  const types = SpreadsheetApp.newDataValidation().requireValueInList(['MCQ', 'TEXT', 'TEXTAREA', 'NUMBER'], true).build()
  const responseStatus = SpreadsheetApp.newDataValidation().requireValueInList(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'], true).build()
  papers.getRange('F2:F').setDataValidation(paperStatus)
  papers.getRange('H2:H').setDataValidation(approval)
  questions.getRange('E2:E').setDataValidation(types)
  responses.getRange('L2:L').setDataValidation(responseStatus)
  papers.setColumnWidth(5, 420)
  questions.setColumnWidth(7, 420)
  questions.setColumnWidth(10, 320)
}

function seedExamplePaper_(papers, questions) {
  const existingPapers = tableRecords_(papers)
  const existingQuestions = tableRecords_(questions)
  const options = JSON.stringify([
    { value: 'method-a', label: 'Method A' },
    { value: 'method-b', label: 'Method B' },
    { value: 'method-c', label: 'Method C' }
  ])
  const seeds = [
    {
      paper: { PAPER_ID: 'demo-paper-1', TITLE: 'The Signal Paper', CHECKPOINT_ID: 1, PUZZLE_ID: 'checkpoint-1', INTRO_PROMPT: 'Placeholder paper for Checkpoint 1.\n\nSolve it on paper, then drive to the Answer Submission Station.', STATUS: 'LIVE', SCHEMA_VERSION: 1, APPROVAL_MODE: 'MANUAL', PASS_PERCENT: 80, TIMER_SECONDS: 300, LOCK_NUMBER: 1, LOCK_CODE: '1842', UPDATED_AT: new Date() },
      questions: [
        { PAPER_ID: 'demo-paper-1', QUESTION_ID: 'q1', FIELD_ID: 'method_choice', DISPLAY_ORDER: 1, TYPE: 'MCQ', LABEL: 'Which method did you use?', QUESTION_TEXT: 'Placeholder MCQ question.', REQUIRED: true, OPTIONS_JSON: options, POINTS: 1, ENABLED: true },
        { PAPER_ID: 'demo-paper-1', QUESTION_ID: 'q2', FIELD_ID: 'working_step_1', DISPLAY_ORDER: 2, TYPE: 'TEXTAREA', LABEL: 'Intermediate step 1', QUESTION_TEXT: 'Show the first important calculation step.', PLACEHOLDER: 'Write your working…', REQUIRED: true, MAX_LENGTH: 2000, ENABLED: true },
        { PAPER_ID: 'demo-paper-1', QUESTION_ID: 'q2', FIELD_ID: 'working_step_2', DISPLAY_ORDER: 3, TYPE: 'TEXT', LABEL: 'Intermediate step 2 or variable value', PLACEHOLDER: 'Enter a value or explanation…', REQUIRED: false, MAX_LENGTH: 500, ENABLED: true },
        { PAPER_ID: 'demo-paper-1', QUESTION_ID: 'q3', FIELD_ID: 'final_value', DISPLAY_ORDER: 4, TYPE: 'NUMBER', LABEL: 'Final numerical value', QUESTION_TEXT: 'Enter the final value.', PLACEHOLDER: '0', REQUIRED: true, POINTS: 1, TOLERANCE: 0, STEP: 'any', ENABLED: true }
      ]
    },
    {
      paper: { PAPER_ID: 'demo-paper-2', TITLE: 'The Water Tower Paper', CHECKPOINT_ID: 2, PUZZLE_ID: 'checkpoint-2', INTRO_PROMPT: 'Placeholder paper for Checkpoint 2.\n\nComplete every subpart, then drive to the Answer Submission Station.', STATUS: 'LIVE', SCHEMA_VERSION: 1, APPROVAL_MODE: 'MANUAL', PASS_PERCENT: 80, TIMER_SECONDS: 360, LOCK_NUMBER: 2, LOCK_CODE: '5729', UPDATED_AT: new Date() },
      questions: [
        { PAPER_ID: 'demo-paper-2', QUESTION_ID: 'q1', FIELD_ID: 'tower_reading', DISPLAY_ORDER: 1, TYPE: 'NUMBER', LABEL: 'Observed tower reading', QUESTION_TEXT: 'Enter the placeholder numerical reading.', PLACEHOLDER: '0', REQUIRED: true, STEP: '0.1', ENABLED: true },
        { PAPER_ID: 'demo-paper-2', QUESTION_ID: 'q2', FIELD_ID: 'unit_choice', DISPLAY_ORDER: 2, TYPE: 'MCQ', LABEL: 'Choose the working unit', REQUIRED: true, OPTIONS_JSON: JSON.stringify([{ value: 'metres', label: 'Metres' }, { value: 'litres', label: 'Litres' }, { value: 'seconds', label: 'Seconds' }]), ENABLED: true },
        { PAPER_ID: 'demo-paper-2', QUESTION_ID: 'q3', FIELD_ID: 'tower_reasoning', DISPLAY_ORDER: 3, TYPE: 'TEXTAREA', LABEL: 'Explain your reasoning', PLACEHOLDER: 'Show your working…', REQUIRED: true, MAX_LENGTH: 2000, ENABLED: true },
        { PAPER_ID: 'demo-paper-2', QUESTION_ID: 'q4', FIELD_ID: 'tower_subpart', DISPLAY_ORDER: 4, TYPE: 'TEXT', LABEL: 'Short subpart answer', PLACEHOLDER: 'Short answer…', REQUIRED: false, MAX_LENGTH: 500, ENABLED: true }
      ]
    },
    {
      paper: { PAPER_ID: 'demo-paper-3', TITLE: 'The Depot Paper', CHECKPOINT_ID: 3, PUZZLE_ID: 'checkpoint-3', INTRO_PROMPT: 'Placeholder paper for Checkpoint 3.\n\nComplete the final paper and submit it before the train arrives.', STATUS: 'LIVE', SCHEMA_VERSION: 1, APPROVAL_MODE: 'MANUAL', PASS_PERCENT: 80, TIMER_SECONDS: 420, LOCK_NUMBER: 3, LOCK_CODE: '9364', UPDATED_AT: new Date() },
      questions: [
        { PAPER_ID: 'demo-paper-3', QUESTION_ID: 'q1', FIELD_ID: 'route_choice', DISPLAY_ORDER: 1, TYPE: 'MCQ', LABEL: 'Select the correct placeholder route', REQUIRED: true, OPTIONS_JSON: JSON.stringify([{ value: 'north', label: 'North siding' }, { value: 'central', label: 'Central line' }, { value: 'south', label: 'South siding' }]), ENABLED: true },
        { PAPER_ID: 'demo-paper-3', QUESTION_ID: 'q2', FIELD_ID: 'depot_calculation', DISPLAY_ORDER: 2, TYPE: 'TEXTAREA', LABEL: 'Calculation and working', PLACEHOLDER: 'Show every important step…', REQUIRED: true, MAX_LENGTH: 2400, ENABLED: true },
        { PAPER_ID: 'demo-paper-3', QUESTION_ID: 'q3', FIELD_ID: 'depot_result', DISPLAY_ORDER: 3, TYPE: 'NUMBER', LABEL: 'Final result', PLACEHOLDER: '0', REQUIRED: true, STEP: 'any', ENABLED: true },
        { PAPER_ID: 'demo-paper-3', QUESTION_ID: 'q4', FIELD_ID: 'depot_note', DISPLAY_ORDER: 4, TYPE: 'TEXT', LABEL: 'Optional note for the examiner', PLACEHOLDER: 'Any clarification…', REQUIRED: false, MAX_LENGTH: 500, ENABLED: true }
      ]
    }
  ]

  seeds.forEach(function(seed) {
    const paperId = seed.paper.PAPER_ID
    const paperExists = existingPapers.some(function(record) { return String(record.PAPER_ID) === paperId })
    const checkpointExists = existingPapers.some(function(record) { return String(record.CHECKPOINT_ID) === String(seed.paper.CHECKPOINT_ID) })
    if (!paperExists && !checkpointExists) appendRecord_(papers, seed.paper)
    if ((paperExists || !checkpointExists) && !existingQuestions.some(function(record) { return String(record.PAPER_ID) === paperId })) {
      seed.questions.forEach(function(question) { appendRecord_(questions, question) })
    }
  })
}

function appendRecord_(sheet, record) {
  const headers = readHeaders_(sheet)
  sheet.appendRow(headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? safeCell_(record[header]) : ''
  }))
}

function responseStatus_(value) {
  const status = normalized_(value || 'DRAFT')
  return ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'].indexOf(status) >= 0 ? status : 'PENDING'
}

function requireSecret_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty('PUZZLE_API_SECRET')
  if (!expected || String(secret) !== expected) throw new Error('Unauthorized')
}

function id_(value, label) {
  const text = String(value || '').trim()
  if (!/^[a-zA-Z0-9_-]{2,120}$/.test(text)) throw new Error('Invalid ' + label)
  return text
}

function truthy_(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback
  if (typeof value === 'boolean') return value
  return ['TRUE', 'YES', '1', 'ON'].indexOf(normalized_(value)) >= 0
}

function normalized_(value) { return String(value || '').trim().toUpperCase() }

function safeCell_(value) {
  if (value === undefined || value === null) return ''
  if (value instanceof Date || typeof value === 'number' || typeof value === 'boolean') return value
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value)
  return /^[=+\-@]/.test(text) ? "'" + text : text
}

function iso_(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)
}
