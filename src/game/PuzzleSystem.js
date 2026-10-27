import * as THREE from 'three'
import { PUZZLE_CONFIG, getFallbackPaper } from './puzzleConfig.js'
import { PuzzleApi, getOrCreatePlayerId, makeId, readJson, writeJson } from './PuzzleApi.js'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export class PuzzleSystem {
  constructor(game) {
    this.game = game
    this.api = new PuzzleApi()
    this.playerId = getOrCreatePlayerId()
    this.papers = [1, 2, 3].map(getFallbackPaper)
    this.records = {}
    this.activeCheckpoint = 1
    this.puzzle = this.papers[0]
    this.prepared = false
    this.station = PUZZLE_CONFIG.submissionStation
    this._state = 'idle'
    this.panelOpen = false
    this.stationMissionActive = false
    this.checkpointMissionActive = false
    this.finalRescueMissionActive = false
    this.openedAtStation = false
    this.requestInFlight = false
    this.draftRequestInFlight = false
    this.draftDirty = false
    this.draftTimer = 0
    this.draftPromise = null
    this.pollCountdown = PUZZLE_CONFIG.pollIntervalMs / 1000
    this.lastProgressWrite = 0
    this.completed = false
    this.unlockedLocks = [false, false, false]
    this.failureOpen = false

    this.layer = document.querySelector('#puzzle-layer')
    this.form = document.querySelector('#puzzle-form')
    this.fieldsRoot = document.querySelector('#puzzle-fields')
    this.formFeedback = document.querySelector('#puzzle-form-feedback')
    this.submitButton = document.querySelector('#puzzle-submit')
    this.closeButton = document.querySelector('#puzzle-close')
    this.intro = document.querySelector('#puzzle-intro')
    this.title = document.querySelector('#puzzle-title')
    this.stationControls = document.querySelector('#station-controls')
    this.stationOpen = document.querySelector('#station-open')
    this.stationLabel = this.stationOpen.querySelector('span')
    this.approval = document.querySelector('#approval-status')
    this.approvalEyebrow = document.querySelector('#approval-eyebrow')
    this.approvalTitle = document.querySelector('#approval-title')
    this.approvalMessage = document.querySelector('#approval-message')
    this.approvalPlayer = document.querySelector('#approval-player')
    this.approvalAction = document.querySelector('#approval-action')
    this.missionHud = document.querySelector('#mission-hud')
    this.missionEyebrow = this.missionHud.querySelector('span')
    this.missionTitle = this.missionHud.querySelector('strong')
    this.missionDistance = document.querySelector('#waypoint-distance')
    this.timerHud = document.querySelector('#timer-hud')
    this.timerCheckpoint = document.querySelector('#timer-checkpoint')
    this.timerValue = document.querySelector('#timer-value')
    this.timerState = document.querySelector('#timer-state')
    this.timerEnd = document.querySelector('#timer-end')
    this.failureLayer = document.querySelector('#failure-layer')
    this.failureTitle = document.querySelector('#failure-title')
    this.failureMessage = document.querySelector('#failure-message')
    this.retryButton = document.querySelector('#failure-retry')
    this.wallet = document.querySelector('#codes-wallet')
    this.successLayer = document.querySelector('#success-layer')

    this.initializeRecords()
    this.buildStation()
    this.buildForm()
    this.bindUI()
  }

  get currentRecord() {
    return this.records[this.activeCheckpoint]
  }

  get state() {
    return this.currentRecord?.state || this._state
  }

  set state(value) {
    if (this.currentRecord) this.currentRecord.state = value
    this._state = value
  }

  get rewardCode() {
    return this.currentRecord?.rewardCode || null
  }

  initializeRecords() {
    for (const paper of this.papers) {
      const durationMs = Math.max(10, Number(paper.timerSeconds) || 300) * 1000
      this.records[paper.checkpointId] = {
        paperId: paper.paperId,
        questionId: paper.id,
        state: paper.checkpointId === 1 ? 'idle' : 'locked',
        answers: {},
        submissionId: null,
        attemptId: null,
        rewardCode: null,
        feedback: '',
        submittedAt: '',
        verified: false,
        timerDurationMs: durationMs,
        timerRemainingMs: durationMs,
        timerStatus: 'idle',
        timerUpdatedAt: Date.now()
      }
    }
  }

  async prepare() {
    if (this.prepared) return
    const results = await Promise.all([1, 2, 3].map(async (checkpointId) => {
      try {
        const result = await this.api.getActivePaper(checkpointId)
        if (result?.paper?.paperId && Array.isArray(result.paper.fields) && result.paper.fields.length) return result.paper
      } catch (error) {
        console.warn(`Using bundled Checkpoint ${checkpointId} paper because the live paper could not load: ${error.message}`)
      }
      return getFallbackPaper(checkpointId)
    }))
    this.papers = results
    this.records = {}
    this.initializeRecords()
    this.restoreProgress()
    await this.verifyPersistedApprovals()
    this.selectCheckpoint(this.activeCheckpoint)
    this.buildForm()
    this.restoreUnlockedLocks()
    this.updateWallet()
    this.prepared = true
  }

  async verifyPersistedApprovals() {
    const checks = this.papers.map(async (paper) => {
      const record = this.records[paper.checkpointId]
      const needsVerification = record.state === 'approved' || Boolean(record.rewardCode) || this.unlockedLocks[paper.lockIndex]
      if (!needsVerification) return
      try {
        const result = await this.api.status({ playerId: this.playerId, paperId: paper.paperId, questionId: paper.id })
        if (String(result.status || '').toUpperCase() === 'APPROVED' && result.lockCode) {
          record.state = 'approved'
          record.rewardCode = result.lockCode
          record.verified = true
          record.timerStatus = 'completed'
          return
        }
        record.state = paper.checkpointId === 1 ? 'idle' : 'locked'
        record.rewardCode = null
        record.verified = false
        this.unlockedLocks[paper.lockIndex] = false
      } catch {
        record.verified = false
        this.unlockedLocks[paper.lockIndex] = false
      }
    })
    await Promise.all(checks)
    this.completed = this.completed && this.unlockedLocks.every(Boolean)
  }

  buildStation() {
    const { x, y } = this.station
    const world = this.game.world
    const materials = world.materials

    const road = world.mesh(new THREE.BoxGeometry(6.8, 10.5, 0.07), materials.road, [x, y - 5.1, 0.045])
    road.castShadow = false
    world.mesh(new THREE.BoxGeometry(0.12, 7.0, 0.025), materials.cream, [x, y - 5.2, 0.09])
    const pad = world.mesh(new THREE.CylinderGeometry(2.65, 2.65, 0.11, 24), materials.teal, [x, y, 0.08], [Math.PI / 2, 0, 0])
    pad.receiveShadow = true
    const ring = world.mesh(new THREE.RingGeometry(1.95, 2.28, 28), materials.cream, [x, y, 0.15])
    ring.castShadow = false

    world.addStaticBox([0.30, 0.30, 2.8], [x - 2.15, y + 0.7, 1.4], materials.ink, { type: 'answer-station' })
    world.addStaticBox([0.30, 0.30, 2.8], [x + 2.15, y + 0.7, 1.4], materials.ink, { type: 'answer-station' })
    world.addStaticBox([4.8, 1.4, 0.28], [x, y + 0.7, 2.75], materials.orange, { type: 'answer-station' })
    world.addStaticBox([1.2, 0.7, 1.0], [x, y + 1.55, 0.52], materials.ink, { type: 'answer-station-console' })
    world.addLabel('Answer Station', 'Submit all three checkpoint papers', [x, y + 0.45, 3.35], [4.7, 1.55], ['#173a3f', '#70d6c9'])

    this.waypoint = this.makeWaypoint(0x70d6c9)
    this.waypoint.position.set(x, y, 0.2)
    this.game.scene.add(this.waypoint)

    this.checkpointWaypoint = this.makeWaypoint(0xffa35c)
    this.checkpointWaypoint.visible = false
    this.game.scene.add(this.checkpointWaypoint)
  }

  makeWaypoint(color) {
    const waypoint = new THREE.Group()
    const marker = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
    const glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide })
    const waypointRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 28), marker)
    waypointRing.rotation.x = Math.PI / 2
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.7, 7.2, 16, 1, true), glow)
    beam.rotation.x = Math.PI / 2
    beam.position.z = 3.6
    waypoint.add(waypointRing, beam)
    waypoint.visible = false
    return waypoint
  }

  bindUI() {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault()
      this.submit()
    })
    this.closeButton.addEventListener('click', () => this.closeForm())
    this.form.addEventListener('input', () => this.scheduleDraft())
    this.form.addEventListener('change', () => this.scheduleDraft({ immediate: true }))
    this.stationOpen.addEventListener('click', () => this.openForm())
    this.timerEnd.addEventListener('click', () => this.forceTimeout())
    this.retryButton.addEventListener('click', () => this.retryCurrentPaper())
    this.approvalAction.addEventListener('click', () => {
      if (this.state === 'approved') this.advanceFromApproval()
      else if (this.state === 'rejected') this.guideToStation()
      else this.checkApproval(true)
    })
    this.wallet.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy-code]')
      if (!button) return
      const record = this.records[Number(button.dataset.copyCode)]
      if (!record?.rewardCode) return
      try {
        await navigator.clipboard.writeText(record.rewardCode)
        button.dataset.label = button.textContent
        button.textContent = 'Copied'
        window.setTimeout(() => { button.textContent = button.dataset.label || `Lock ${button.dataset.copyCode}` }, 1100)
      } catch {
        button.textContent = record.rewardCode
      }
    })
  }

  selectCheckpoint(checkpointId) {
    const safe = clamp(Number(checkpointId) || 1, 1, 3)
    this.activeCheckpoint = safe
    this.puzzle = this.papers.find((paper) => paper.checkpointId === safe) || getFallbackPaper(safe)
    this._state = this.currentRecord?.state || 'idle'
    this.stationLabel.textContent = `Checkpoint ${safe} Answer Station`
    this.buildForm()
    this.updateTimerHud()
  }

  buildForm() {
    if (!this.fieldsRoot || !this.puzzle) return
    this.fieldsRoot.replaceChildren()
    this.title.textContent = `Checkpoint ${this.puzzle.checkpointId} response`
    this.intro.textContent = `${this.puzzle.title} · Complete every applicable field. You can revise and resubmit if the examiner rejects this attempt.`

    for (const field of this.puzzle.fields) {
      const group = document.createElement('fieldset')
      group.className = `puzzle-field puzzle-field--${field.type}`
      group.dataset.fieldId = field.id

      if (field.questionText) {
        const question = document.createElement('p')
        question.className = 'puzzle-field__question'
        question.textContent = field.questionText
        group.append(question)
      }

      const label = document.createElement(field.type === 'mcq' ? 'legend' : 'label')
      label.textContent = field.label
      if (field.required) {
        const required = document.createElement('em')
        required.textContent = 'Required'
        label.append(required)
      }
      group.append(label)

      if (field.type === 'mcq') {
        const options = document.createElement('div')
        options.className = 'puzzle-options'
        field.options.forEach((option, index) => {
          const optionLabel = document.createElement('label')
          const input = document.createElement('input')
          input.type = 'radio'
          input.name = field.id
          input.value = option.value
          input.required = Boolean(field.required && index === 0)
          optionLabel.append(input, document.createTextNode(option.label))
          options.append(optionLabel)
        })
        group.append(options)
      } else {
        const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input')
        input.id = `puzzle-${this.puzzle.checkpointId}-${field.id}`
        input.name = field.id
        if (input instanceof HTMLInputElement) input.type = field.type === 'number' ? 'number' : 'text'
        input.placeholder = field.placeholder || ''
        input.required = Boolean(field.required)
        if (field.maxLength) input.maxLength = field.maxLength
        if (field.type === 'number') {
          input.step = field.step || 'any'
          input.inputMode = 'decimal'
        }
        label.htmlFor = input.id
        group.append(input)
      }
      this.fieldsRoot.append(group)
    }
  }

  restoreProgress() {
    let saved = readJson(PUZZLE_CONFIG.progressStorageKey)
    if (!saved) {
      const legacy = readJson(PUZZLE_CONFIG.legacyProgressStorageKey)
      if (legacy?.paperId) {
        saved = {
          version: 2,
          activeCheckpoint: 1,
          papers: { 1: legacy },
          unlockedLocks: [false, false, false],
          completed: false
        }
      }
    }
    if (!saved) return

    for (const paper of this.papers) {
      const stored = saved.papers?.[paper.checkpointId]
      if (!stored || stored.paperId !== paper.paperId || stored.questionId !== paper.id) continue
      const record = this.records[paper.checkpointId]
      record.state = ['idle', 'locked', 'to-checkpoint', 'briefing', 'to-station', 'form', 'pending', 'rejected', 'approved', 'timeout', 'failed'].includes(stored.state)
        ? stored.state
        : record.state
      record.answers = stored.answers && typeof stored.answers === 'object' ? stored.answers : {}
      record.submissionId = stored.submissionId || null
      record.attemptId = stored.attemptId || null
      record.rewardCode = stored.rewardCode || null
      record.feedback = stored.feedback || ''
      record.submittedAt = stored.submittedAt || ''
      record.verified = false
      record.timerDurationMs = Math.max(10000, Number(stored.timerDurationMs) || record.timerDurationMs)
      record.timerRemainingMs = clamp(Number(stored.timerRemainingMs) || record.timerDurationMs, 0, record.timerDurationMs)
      record.timerStatus = ['idle', 'running', 'paused', 'completed', 'expired'].includes(stored.timerStatus) ? stored.timerStatus : 'idle'
      record.timerUpdatedAt = Number(stored.timerUpdatedAt) || Date.now()
      if (record.timerStatus === 'running') {
        record.timerRemainingMs = Math.max(0, record.timerRemainingMs - Math.max(0, Date.now() - record.timerUpdatedAt))
        record.timerUpdatedAt = Date.now()
        if (record.timerRemainingMs <= 0) {
          record.timerStatus = 'expired'
          record.state = 'timeout'
        }
      }
    }

    this.activeCheckpoint = clamp(Number(saved.activeCheckpoint) || 1, 1, 3)
    this.unlockedLocks = Array.from({ length: 3 }, (_, index) => Boolean(saved.unlockedLocks?.[index]))
    this.completed = Boolean(saved.completed && this.unlockedLocks.every(Boolean))
  }

  restoreUnlockedLocks() {
    this.unlockedLocks.forEach((unlocked, index) => {
      if (!unlocked) return
      this.game.world.rescue.unlock(index)
      const form = this.game.rescueForms?.[index]
      if (form) {
        form.classList.add('is-unlocked')
        form.querySelector('input').disabled = true
        form.querySelector('button').disabled = true
        form.querySelector('output').textContent = 'Already open'
      }
    })
  }

  saveProgress({ force = false } = {}) {
    const now = performance.now()
    if (!force && now - this.lastProgressWrite < 650) return
    this.lastProgressWrite = now
    writeJson(PUZZLE_CONFIG.progressStorageKey, {
      version: 2,
      activeCheckpoint: this.activeCheckpoint,
      papers: this.records,
      unlockedLocks: this.unlockedLocks,
      completed: this.completed
    })
  }

  getCheckpointBriefing() {
    this.startCurrentPaper()
    return {
      eyebrow: `CHECKPOINT ${this.activeCheckpoint} · TIMED PAPER`,
      title: this.puzzle.title,
      text: this.puzzle.prompt,
      continueLabel: 'Drive to Answer Station'
    }
  }

  resumeSession() {
    if (this.completed) {
      this.game.world.rescue.train.beginRescue()
      this.showSuccess(true)
      return true
    }
    const record = this.currentRecord
    if (!record || (this.activeCheckpoint === 1 && record.state === 'idle')) return false
    if (record.state === 'pending') {
      this.pauseTimer()
      this.showPending(record.submittedAt)
      this.pollCountdown = 1
    } else if (record.state === 'approved') {
      this.stopTimerForApproval()
      this.showApproved(record.rewardCode)
    } else if (record.state === 'rejected') {
      this.resumeTimer()
      this.showRejected(record.feedback)
      this.guideToStation()
    } else if (record.state === 'to-checkpoint' || record.state === 'locked') {
      this.guideToCheckpoint(this.activeCheckpoint)
    } else if (record.state === 'timeout' || record.state === 'failed' || record.timerStatus === 'expired') {
      this.triggerTimeout()
    } else {
      this.resumeTimer()
      this.beginStationMission()
    }
    return true
  }

  startCurrentPaper({ reset = false } = {}) {
    const record = this.currentRecord
    if (reset || record.timerStatus === 'idle' || record.timerStatus === 'expired') {
      record.timerRemainingMs = record.timerDurationMs
      record.timerStatus = 'running'
      record.timerUpdatedAt = Date.now()
      this.game.world.rescue.train.resetForPaper()
    } else if (record.timerStatus === 'paused') {
      this.resumeTimer()
    }
    record.state = 'briefing'
    this._state = record.state
    this.timerHud.classList.add('is-visible')
    this.updateTimerHud()
    this.saveProgress({ force: true })
  }

  pauseTimer() {
    const record = this.currentRecord
    if (record.timerStatus !== 'running') return
    this.tickTimer(Date.now())
    record.timerStatus = 'paused'
    record.timerUpdatedAt = Date.now()
    this.updateTimerHud()
    this.saveProgress({ force: true })
  }

  resumeTimer() {
    const record = this.currentRecord
    if (record.timerStatus === 'completed' || record.timerRemainingMs <= 0) return
    record.timerStatus = 'running'
    record.timerUpdatedAt = Date.now()
    this.timerHud.classList.add('is-visible')
    this.updateTimerHud()
    this.saveProgress({ force: true })
  }

  stopTimerForApproval() {
    const record = this.currentRecord
    record.timerStatus = 'completed'
    record.timerUpdatedAt = Date.now()
    this.timerHud.classList.remove('is-visible')
    this.game.world.rescue.train.resetToTunnel()
  }

  tickTimer(now) {
    const record = this.currentRecord
    if (record.timerStatus !== 'running') return
    const elapsed = Math.max(0, now - record.timerUpdatedAt)
    record.timerRemainingMs = Math.max(0, record.timerRemainingMs - elapsed)
    record.timerUpdatedAt = now
  }

  beginStationMission() {
    const record = this.currentRecord
    record.state = 'to-station'
    this._state = record.state
    this.stationMissionActive = true
    this.checkpointMissionActive = false
    this.finalRescueMissionActive = false
    this.openedAtStation = false
    this.waypoint.visible = true
    this.checkpointWaypoint.visible = false
    this.approval.classList.remove('is-visible')
    this.setMissionHud(`CHECKPOINT ${this.activeCheckpoint} · SUBMISSION RUN`, 'Reach Answer Station')
    this.game.enableDriving()
    this.saveProgress({ force: true })
  }

  guideToCheckpoint(checkpointId) {
    this.selectCheckpoint(checkpointId)
    const record = this.currentRecord
    record.state = 'to-checkpoint'
    this._state = record.state
    this.stationMissionActive = false
    this.checkpointMissionActive = true
    this.finalRescueMissionActive = false
    this.waypoint.visible = false
    const site = this.game.world.rescue.locations[this.activeCheckpoint - 1]
    this.checkpointWaypoint.position.set(site.x, site.y, 0.2)
    this.checkpointWaypoint.visible = true
    this.approval.classList.remove('is-visible')
    this.setMissionHud(`MISSION ${this.activeCheckpoint}`, `Reach ${site.name}`)
    this.game.enableDriving()
    this.saveProgress({ force: true })
  }

  arriveAtCheckpoint() {
    if (!this.checkpointMissionActive) return
    this.checkpointMissionActive = false
    this.checkpointWaypoint.visible = false
    this.missionHud.classList.remove('is-visible')
    const briefing = this.getCheckpointBriefing()
    this.game.story.showPuzzleBriefing(briefing, () => this.beginStationMission())
  }

  setMissionHud(eyebrow, title) {
    this.missionEyebrow.textContent = eyebrow
    this.missionTitle.textContent = title
    this.missionDistance.textContent = '-- m'
    this.missionHud.classList.add('is-visible')
  }

  guideToStation() {
    const record = this.currentRecord
    record.state = 'rejected'
    this._state = record.state
    this.stationMissionActive = true
    this.checkpointMissionActive = false
    this.openedAtStation = false
    this.waypoint.visible = true
    this.checkpointWaypoint.visible = false
    this.setMissionHud(`CHECKPOINT ${this.activeCheckpoint} · REVISION`, 'Return to Answer Station')
    this.saveProgress({ force: true })
  }

  canInteract() {
    return this.stationControls.classList.contains('is-near') && !['pending', 'approved', 'submitting', 'timeout', 'failed'].includes(this.state)
  }

  openForm() {
    if (!this.canInteract()) return
    const record = this.currentRecord
    if (!record.attemptId) record.attemptId = makeId('ATT')
    this.populateAnswers()
    this.panelOpen = true
    record.state = 'form'
    this._state = record.state
    this.layer.classList.add('is-active')
    document.documentElement.classList.add('puzzle-active')
    this.formFeedback.textContent = ''
    this.submitButton.disabled = false
    this.submitButton.textContent = record.submissionId ? 'Resubmit for approval' : 'Submit for approval'
    this.game.pauseDriving('ANSWER STATION')
    window.setTimeout(() => this.form.querySelector('input, textarea')?.focus(), 120)
  }

  closeForm({ resume = true, force = false } = {}) {
    if (this.requestInFlight && !force) return
    const record = this.currentRecord
    this.panelOpen = false
    this.layer.classList.remove('is-active')
    document.documentElement.classList.remove('puzzle-active')
    if (record.state === 'form') record.state = record.submissionId ? 'rejected' : 'to-station'
    this._state = record.state
    if (!force) this.saveDraft()
    if (resume) this.game.enableDriving()
  }

  populateAnswers() {
    const answers = this.currentRecord.answers
    for (const field of this.puzzle.fields) {
      const value = answers[field.id] ?? ''
      if (field.type === 'mcq') {
        const option = this.form.querySelector(`input[name="${field.id}"][value="${CSS.escape(String(value))}"]`)
        if (option) option.checked = true
      } else {
        const input = this.form.elements.namedItem(field.id)
        if (input) input.value = value
      }
    }
  }

  collectAnswers() {
    const answers = {}
    for (const field of this.puzzle.fields) {
      if (field.type === 'mcq') answers[field.id] = this.form.querySelector(`input[name="${field.id}"]:checked`)?.value || ''
      else answers[field.id] = String(this.form.elements.namedItem(field.id)?.value ?? '').trim()
    }
    return answers
  }

  scheduleDraft({ immediate = false } = {}) {
    if (!this.panelOpen || ['pending', 'approved', 'submitting'].includes(this.state)) return
    this.currentRecord.answers = this.collectAnswers()
    this.saveProgress()
    window.clearTimeout(this.draftTimer)
    this.draftTimer = window.setTimeout(() => this.saveDraft(), immediate ? 120 : PUZZLE_CONFIG.draftDelayMs)
  }

  async saveDraft() {
    window.clearTimeout(this.draftTimer)
    const record = this.currentRecord
    if (!record.attemptId || ['pending', 'approved', 'submitting'].includes(record.state)) return
    record.answers = this.panelOpen ? this.collectAnswers() : record.answers
    if (!Object.values(record.answers).some((value) => String(value).trim())) return
    if (this.draftRequestInFlight) {
      this.draftDirty = true
      return this.draftPromise
    }

    const paper = this.puzzle
    this.draftRequestInFlight = true
    this.draftDirty = false
    if (this.panelOpen) this.formFeedback.textContent = 'Saving draft…'
    this.draftPromise = this.api.saveDraft({
      attemptId: record.attemptId,
      playerId: this.playerId,
      paperId: paper.paperId,
      questionId: paper.id,
      checkpointId: paper.checkpointId,
      schemaVersion: paper.schemaVersion,
      answers: record.answers
    }).then(() => {
      if (this.panelOpen && record.state === 'form') this.formFeedback.textContent = 'Draft saved'
      this.saveProgress({ force: true })
    }).catch((error) => {
      if (this.panelOpen && record.state === 'form') this.formFeedback.textContent = `Draft will retry: ${error.message}`
      this.draftDirty = true
    }).finally(() => {
      this.draftRequestInFlight = false
      if (this.draftDirty && this.panelOpen && record.state === 'form') this.scheduleDraft()
    })
    return this.draftPromise
  }

  async submit() {
    if (this.requestInFlight || !this.form.reportValidity()) return
    const record = this.currentRecord
    record.answers = this.collectAnswers()
    if (!record.attemptId) record.attemptId = makeId('ATT')
    await this.saveDraft()
    this.requestInFlight = true
    record.state = 'submitting'
    this._state = record.state
    this.pauseTimer()
    this.submitButton.disabled = true
    this.submitButton.textContent = 'Submitting…'
    this.formFeedback.textContent = 'Sending your work securely…'

    try {
      const result = await this.api.submit({
        requestId: makeId('REQ'),
        attemptId: record.attemptId,
        playerId: this.playerId,
        paperId: this.puzzle.paperId,
        questionId: this.puzzle.id,
        checkpointId: this.puzzle.checkpointId,
        schemaVersion: this.puzzle.schemaVersion,
        answers: record.answers
      })
      record.submissionId = result.submissionId
      record.submittedAt = result.submittedAt || new Date().toISOString()
      this.stationMissionActive = false
      this.waypoint.visible = false
      this.missionHud.classList.remove('is-visible')
      this.requestInFlight = false
      this.closeForm({ resume: false })
      const status = String(result.status || 'PENDING').toUpperCase()
      if (status === 'APPROVED') this.handleApproved(result)
      else if (status === 'REJECTED') this.handleRejected(result.feedback)
      else {
        record.state = 'pending'
        this._state = record.state
        this.showPending(record.submittedAt)
        this.pollCountdown = PUZZLE_CONFIG.pollIntervalMs / 1000
      }
      this.saveProgress({ force: true })
      this.game.enableDriving()
    } catch (error) {
      record.state = 'form'
      this._state = record.state
      this.resumeTimer()
      this.formFeedback.textContent = `Could not submit: ${error.message}`
      this.submitButton.disabled = false
      this.submitButton.textContent = 'Try again'
    } finally {
      this.requestInFlight = false
    }
  }

  showPending(submittedAt) {
    const record = this.currentRecord
    record.submittedAt = submittedAt || record.submittedAt
    this.approval.className = 'approval-status is-visible is-pending'
    this.approvalEyebrow.textContent = `CHECKPOINT ${this.activeCheckpoint} · SUBMISSION RECEIVED`
    this.approvalTitle.textContent = "Awaiting Examiner's Approval"
    this.approvalMessage.textContent = record.submittedAt
      ? `Submitted ${new Date(record.submittedAt).toLocaleString()}. The countdown is paused while the examiner reviews it.`
      : 'The countdown is paused while the examiner reviews it.'
    this.approvalPlayer.textContent = `Player ${this.playerId}`
    this.approvalAction.textContent = 'Check now'
    this.timerHud.classList.add('is-visible')
    this.updateTimerHud()
  }

  showRejected(feedback) {
    const record = this.currentRecord
    record.feedback = feedback || ''
    this.approval.className = 'approval-status is-visible is-rejected'
    this.approvalEyebrow.textContent = `CHECKPOINT ${this.activeCheckpoint} · EXAMINER RESPONSE`
    this.approvalTitle.textContent = 'Revision requested'
    this.approvalMessage.textContent = record.feedback || 'The examiner rejected this attempt. Review your work and submit again before time runs out.'
    this.approvalPlayer.textContent = `Player ${this.playerId}`
    this.approvalAction.textContent = 'Return to station'
  }

  showApproved(lockCode) {
    const record = this.currentRecord
    this.approval.className = 'approval-status is-visible is-approved'
    this.approvalEyebrow.textContent = `CHECKPOINT ${this.activeCheckpoint} APPROVED`
    this.approvalTitle.textContent = lockCode ? `Lock Code ${this.activeCheckpoint} · ${lockCode}` : `Lock Code ${this.activeCheckpoint} awarded`
    this.approvalMessage.textContent = this.activeCheckpoint < 3
      ? `Checkpoint complete. Checkpoint ${this.activeCheckpoint + 1} is now available.`
      : 'All three papers are approved. Drive to the captive and open every lock.'
    this.approvalPlayer.textContent = `Player ${this.playerId}`
    this.approvalAction.textContent = this.activeCheckpoint < 3 ? `Route to checkpoint ${this.activeCheckpoint + 1}` : 'Route to captive'
    this.updateWallet()
  }

  handleApproved(result) {
    const record = this.currentRecord
    record.state = 'approved'
    record.rewardCode = result.lockCode || record.rewardCode || null
    record.verified = true
    record.feedback = ''
    this._state = record.state
    this.stationMissionActive = false
    this.checkpointMissionActive = false
    this.waypoint.visible = false
    this.checkpointWaypoint.visible = false
    this.missionHud.classList.remove('is-visible')
    this.stopTimerForApproval()
    this.showApproved(record.rewardCode)
    this.game.setTransientStatus(`CODE ${this.activeCheckpoint} AWARDED`, 1600)
  }

  handleRejected(feedback) {
    const record = this.currentRecord
    record.state = 'rejected'
    record.feedback = feedback || ''
    this._state = record.state
    this.resumeTimer()
    this.showRejected(record.feedback)
    this.guideToStation()
  }

  async checkApproval(manual = false) {
    const record = this.currentRecord
    if (this.requestInFlight || !record.submissionId) return
    this.requestInFlight = true
    if (manual) this.approvalAction.textContent = 'Checking…'
    try {
      const result = await this.api.status({ playerId: this.playerId, paperId: this.puzzle.paperId, questionId: this.puzzle.id })
      const status = String(result.status || '').toUpperCase()
      if (status === 'APPROVED') this.handleApproved(result)
      else if (status === 'REJECTED') this.handleRejected(result.feedback)
      else {
        record.state = 'pending'
        this._state = record.state
        this.pauseTimer()
        this.showPending(result.submittedAt)
      }
      this.saveProgress({ force: true })
    } catch (error) {
      this.approvalMessage.textContent = `Approval check failed: ${error.message}. The timer remains paused; another check will run automatically.`
      this.approvalAction.textContent = 'Try again'
    } finally {
      this.requestInFlight = false
      this.pollCountdown = PUZZLE_CONFIG.pollIntervalMs / 1000
    }
  }

  setMockStatus(status, feedback = '', checkpointId = this.activeCheckpoint) {
    const paper = this.papers.find((item) => item.checkpointId === Number(checkpointId))
    return paper ? this.api.setMockStatus(status, feedback, paper.paperId) : false
  }

  advanceFromApproval() {
    if (this.activeCheckpoint < 3) this.guideToCheckpoint(this.activeCheckpoint + 1)
    else this.beginFinalRescueMission()
  }

  beginFinalRescueMission() {
    this.stationMissionActive = false
    this.checkpointMissionActive = false
    this.finalRescueMissionActive = true
    this.waypoint.visible = false
    this.checkpointWaypoint.visible = false
    this.approval.classList.remove('is-visible')
    this.setMissionHud('FINAL RESCUE', 'Drive to the captive and enter all three codes')
    this.game.enableDriving()
    this.saveProgress({ force: true })
  }

  async tryUnlock(index, enteredCode) {
    const paper = this.papers.find((item) => item.lockIndex === index)
    const record = paper ? this.records[paper.checkpointId] : null
    if (!paper || !record?.rewardCode || record.state !== 'approved') return { ok: false, reason: 'not-awarded' }
    try {
      const result = await this.api.status({ playerId: this.playerId, paperId: paper.paperId, questionId: paper.id })
      const approved = String(result.status || '').toUpperCase() === 'APPROVED'
      const serverCode = String(result.lockCode || '').trim().toUpperCase()
      if (!approved || !serverCode) return { ok: false, reason: 'not-awarded' }
      record.rewardCode = result.lockCode
      record.verified = true
      if (String(enteredCode).trim().toUpperCase() !== serverCode) return { ok: false, reason: 'wrong-code' }
      const unlocked = this.game.world.rescue.unlock(index)
      if (unlocked.ok) {
        this.unlockedLocks[index] = true
        this.saveProgress({ force: true })
        this.updateWallet()
        if (this.unlockedLocks.every(Boolean)) this.completeRescue()
      }
      return unlocked
    } catch (error) {
      return { ok: false, reason: 'verification-failed', message: error.message }
    }
  }

  completeRescue() {
    if (this.completed) return
    this.completed = true
    this.finalRescueMissionActive = false
    this.missionHud.classList.remove('is-visible')
    this.game.toggleRescuePanel(false)
    this.game.pauseDriving('RESCUED')
    this.game.world.rescue.train.beginRescue()
    this.saveProgress({ force: true })
    window.setTimeout(() => this.showSuccess(false), 900)
  }

  showSuccess(restored = false) {
    this.successLayer.classList.add('is-active')
    this.successLayer.querySelector('p').textContent = restored
      ? 'All three locks are open. Your completed rescue has been restored.'
      : 'All three papers were approved, every lock opened, and your friend is safe.'
    document.documentElement.classList.add('success-active')
  }

  forceTimeout() {
    if (this.currentRecord.timerStatus !== 'running') return
    this.currentRecord.timerRemainingMs = 0
    this.currentRecord.timerUpdatedAt = Date.now()
    this.triggerTimeout()
  }

  triggerTimeout() {
    const record = this.currentRecord
    if (record.state === 'failed' || this.failureOpen || this.game.world.rescue.train.phase === 'crashing') return
    record.timerRemainingMs = 0
    record.timerStatus = 'expired'
    record.state = 'timeout'
    this._state = record.state
    this.stationMissionActive = false
    this.checkpointMissionActive = false
    this.waypoint.visible = false
    this.checkpointWaypoint.visible = false
    this.missionHud.classList.remove('is-visible')
    this.timerHud.classList.remove('is-visible')
    if (this.panelOpen) this.closeForm({ resume: false, force: true })
    this.game.pauseDriving('TIME OUT')
    this.game.openTrainView({ locked: true })
    this.game.world.rescue.train.timeout(() => {
      record.state = 'failed'
      this._state = record.state
      this.game.closeTrainView({ force: true, resume: false })
      this.showFailure()
      this.saveProgress({ force: true })
    })
    this.saveProgress({ force: true })
  }

  showFailure() {
    this.failureOpen = true
    this.failureTitle.textContent = `Checkpoint ${this.activeCheckpoint} timed out`
    this.failureMessage.textContent = 'The train reached the captive. Retry this paper; earlier approvals, collected codes and opened locks are preserved.'
    this.failureLayer.classList.add('is-active')
    document.documentElement.classList.add('failure-active')
  }

  retryCurrentPaper() {
    const record = this.currentRecord
    record.state = 'briefing'
    record.submissionId = null
    record.attemptId = makeId('ATT')
    record.feedback = ''
    record.submittedAt = ''
    record.timerRemainingMs = record.timerDurationMs
    record.timerStatus = 'running'
    record.timerUpdatedAt = Date.now()
    this._state = record.state
    this.failureOpen = false
    this.failureLayer.classList.remove('is-active')
    document.documentElement.classList.remove('failure-active')
    this.game.world.rescue.train.resetForPaper()
    this.timerHud.classList.add('is-visible')
    this.beginStationMission()
    this.saveProgress({ force: true })
  }

  updateTimerHud() {
    const record = this.currentRecord
    if (!record) return
    const totalSeconds = Math.max(0, Math.ceil(record.timerRemainingMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    this.timerCheckpoint.textContent = `CHECKPOINT ${this.activeCheckpoint}`
    this.timerValue.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    this.timerState.textContent = record.timerStatus === 'paused' ? 'PAUSED FOR REVIEW' : record.timerStatus === 'running' ? 'TRAIN APPROACHING' : 'SAFE'
    this.timerHud.classList.toggle('is-paused', record.timerStatus === 'paused')
    this.timerHud.classList.toggle('is-critical', record.timerStatus === 'running' && record.timerRemainingMs <= 30000)
    this.timerEnd.disabled = record.timerStatus !== 'running'
    const progress = 1 - record.timerRemainingMs / record.timerDurationMs
    this.game.world.rescue.train.setTimerProgress(progress, totalSeconds, record.timerStatus)
  }

  updateWallet() {
    this.wallet.classList.toggle('is-visible', Object.values(this.records).some((record) => record.rewardCode))
    for (const button of this.wallet.querySelectorAll('[data-copy-code]')) {
      const checkpointId = Number(button.dataset.copyCode)
      const code = this.records[checkpointId]?.rewardCode
      button.disabled = !code
      button.textContent = code ? `Lock ${checkpointId}: ${code}` : `Lock ${checkpointId}: —`
    }
  }

  update(delta) {
    const record = this.currentRecord
    const now = Date.now()
    if (record?.timerStatus === 'running') {
      this.tickTimer(now)
      this.updateTimerHud()
      this.saveProgress()
      if (record.timerRemainingMs <= 0) this.triggerTimeout()
    } else if (record?.timerStatus === 'paused') {
      this.updateTimerHud()
    }

    const stationDistance = Math.hypot(this.game.vehicle.position.x - this.station.x, this.game.vehicle.position.y - this.station.y)
    const nearStation = stationDistance <= this.station.interactionRadius
    const mayOpen = !['pending', 'approved', 'submitting', 'timeout', 'failed'].includes(this.state)
    this.stationControls.classList.toggle('is-near', nearStation && mayOpen && !this.panelOpen)

    if (this.stationMissionActive) {
      this.missionDistance.textContent = `${Math.max(0, Math.round(stationDistance))} m`
      const pulse = 1 + Math.sin(this.game.elapsed * 3) * 0.07
      this.waypoint.scale.setScalar(pulse)
      this.waypoint.rotation.z += delta * 0.42
      if (['to-station', 'rejected'].includes(this.state) && nearStation && !this.openedAtStation) {
        this.openedAtStation = true
        this.openForm()
      }
    }

    if (this.checkpointMissionActive) {
      const site = this.game.world.rescue.locations[this.activeCheckpoint - 1]
      const distance = Math.hypot(this.game.vehicle.position.x - site.x, this.game.vehicle.position.y - site.y)
      this.missionDistance.textContent = `${Math.max(0, Math.round(distance))} m`
      const pulse = 1 + Math.sin(this.game.elapsed * 3.2) * 0.08
      this.checkpointWaypoint.scale.setScalar(pulse)
      this.checkpointWaypoint.rotation.z += delta * 0.45
      if (distance <= PUZZLE_CONFIG.checkpointRadius) this.arriveAtCheckpoint()
    }

    if (this.finalRescueMissionActive) {
      const captive = this.game.world.rescue.captivePosition
      const distance = Math.hypot(this.game.vehicle.position.x - captive.x, this.game.vehicle.position.y - captive.y)
      this.missionDistance.textContent = `${Math.max(0, Math.round(distance))} m`
    }

    if (this.state === 'pending' && document.visibilityState === 'visible') {
      this.pollCountdown -= delta
      if (this.pollCountdown <= 0) this.checkApproval()
    }
  }

  drawMapOverlay(context, mapPoint) {
    if (this.checkpointMissionActive) {
      const site = this.game.world.rescue.locations[this.activeCheckpoint - 1]
      const [x, y] = mapPoint(site.x, site.y)
      context.strokeStyle = '#ffb266'
      context.lineWidth = 3
      context.beginPath()
      context.arc(x, y, 7, 0, Math.PI * 2)
      context.stroke()
      context.fillStyle = '#fff3cd'
      context.font = '900 8px system-ui'
      context.textAlign = 'center'
      context.fillText(String(this.activeCheckpoint), x, y + 3)
    }
    if (this.stationMissionActive || ['pending', 'rejected'].includes(this.state)) {
      const [x, y] = mapPoint(this.station.x, this.station.y)
      context.fillStyle = this.state === 'rejected' ? '#ff8d7d' : '#70d6c9'
      context.beginPath()
      context.arc(x, y, 6, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#123b40'
      context.font = '900 7px system-ui'
      context.textAlign = 'center'
      context.fillText('A', x, y + 2.5)
    }
    if (this.finalRescueMissionActive) {
      const captive = this.game.world.rescue.captivePosition
      const [x, y] = mapPoint(captive.x, captive.y)
      context.fillStyle = '#66d6a0'
      context.beginPath()
      context.arc(x, y, 7, 0, Math.PI * 2)
      context.fill()
    }
  }

  isDrivingBlocked() {
    return this.panelOpen || this.failureOpen || this.completed
  }

  getState() {
    const record = this.currentRecord
    return {
      state: this.state,
      apiMode: this.api.mode,
      paperId: this.puzzle.paperId,
      playerId: this.playerId,
      attemptId: record?.attemptId,
      submissionId: record?.submissionId,
      activeCheckpoint: this.activeCheckpoint,
      stationMissionActive: this.stationMissionActive,
      checkpointMissionActive: this.checkpointMissionActive,
      finalRescueMissionActive: this.finalRescueMissionActive,
      panelOpen: this.panelOpen,
      rewardCode: record?.rewardCode,
      approvedCheckpoints: Object.values(this.records).filter((item) => item.state === 'approved').map((item) => item.questionId),
      unlockedLocks: [...this.unlockedLocks],
      completed: this.completed,
      timer: record ? {
        status: record.timerStatus,
        remainingMs: record.timerRemainingMs,
        durationMs: record.timerDurationMs
      } : null,
      draftSaving: this.draftRequestInFlight
    }
  }
}
