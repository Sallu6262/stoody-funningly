import * as THREE from 'three'
import { STORY_CONFIG } from './storyConfig.js'

const clamp01 = (value) => Math.max(0, Math.min(1, value))
const smooth = (value) => value * value * (3 - 2 * value)
const normalizeAnswer = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export class StoryController {
  constructor(game) {
    this.game = game
    this.state = 'idle'
    this.cameraActive = false
    this.paused = false
    this.cinematicTime = 0
    this.dialogueIndex = 0
    this.checkpoint1Discovered = false
    this.checkpointReached = false
    this.missionActive = false
    this.mapAccumulator = 0
    this.temp = new THREE.Vector3()
    this.briefingContinue = null

    this.root = document.querySelector('#story-layer')
    this.caption = document.querySelector('#cinematic-caption')
    this.panel = document.querySelector('#story-panel')
    this.eyebrow = document.querySelector('#story-eyebrow')
    this.title = document.querySelector('#story-title')
    this.text = document.querySelector('#story-text')
    this.skipButton = document.querySelector('#story-skip')
    this.cinematicSkip = document.querySelector('#cinematic-skip')
    this.continueButton = document.querySelector('#story-continue')
    this.clueForm = document.querySelector('#clue-form')
    this.cluePrompt = document.querySelector('#clue-prompt')
    this.clueInput = document.querySelector('#clue-input')
    this.clueError = document.querySelector('#clue-error')
    this.missionHud = document.querySelector('#mission-hud')
    this.distance = document.querySelector('#waypoint-distance')
    this.mapShell = document.querySelector('#minimap-shell')
    this.map = document.querySelector('#minimap')
    this.mapContext = this.map.getContext('2d')
    this.mapProject = (x, y) => this.mapPoint(x, y)

    this.cameraCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(10.5, 4.5, 3.7),
      new THREE.Vector3(7.2, 6.6, 2.7),
      new THREE.Vector3(1.0, 8.0, 3.9),
      new THREE.Vector3(-13.0, 7.0, 4.5),
      new THREE.Vector3(-22.0, 6.6, 3.5),
      new THREE.Vector3(-18.0, -7.0, 7.0),
      new THREE.Vector3(-14.4, -17.5, 4.2)
    ], false, 'centripetal')
    this.targetCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4.5, 9.0, 0.7),
      new THREE.Vector3(4.5, 9.0, 0.6),
      new THREE.Vector3(4.5, 9.0, 0.6),
      new THREE.Vector3(-28.0, 9.0, 1.8),
      new THREE.Vector3(-30.0, 9.0, 1.8),
      new THREE.Vector3(-9.0, -18.0, 0.8),
      new THREE.Vector3(-9.0, -18.0, 0.75)
    ], false, 'centripetal')

    this.buildWaypoint()
    this.bindUI()
    this.resizeMap()
  }

  bindUI() {
    this.cinematicSkip.addEventListener('click', () => this.finishCinematic())
    this.skipButton.addEventListener('click', () => this.showClue())
    this.continueButton.addEventListener('click', () => this.continue())
    this.clueForm.addEventListener('submit', (event) => {
      event.preventDefault()
      this.submitClue()
    })
    this.clueInput.addEventListener('pointerdown', () => {
      window.requestAnimationFrame(() => this.focusClueInput())
    })
  }

  buildWaypoint() {
    const site = this.game.world.rescue.locations[0]
    this.waypoint = new THREE.Group()
    this.waypoint.position.set(site.x, site.y, 0.15)
    const orange = new THREE.MeshBasicMaterial({ color: 0xffa35c, transparent: true, opacity: 0.88, depthWrite: false })
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd68a, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.12, 8, 28), orange)
    ring.rotation.x = Math.PI / 2
    ring.position.z = 0.25
    ring.name = 'checkpoint-ring'
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 1.5, 7.5, 16, 1, true), glow)
    beam.rotation.x = Math.PI / 2
    beam.position.z = 3.75
    this.waypoint.add(ring, beam)
    this.waypoint.visible = false
    this.game.scene.add(this.waypoint)
  }

  begin() {
    if (this.state !== 'idle') return
    this.state = 'cinematic'
    this.cameraActive = true
    this.paused = true
    this.cinematicTime = 0
    this.root.classList.add('is-active', 'is-cinematic')
    this.mapShell.classList.add('is-visible')
    document.documentElement.classList.add('story-active', 'cinematic-active')
    this.game.pauseDriving('STORY')
    this.applyCinematicCamera(0)
    if (document.documentElement.classList.contains('reduced-motion')) this.finishCinematic()
  }

  resumeFreeDrive() {
    this.state = 'free-drive'
    this.paused = false
    this.cameraActive = false
    this.checkpoint1Discovered = true
    this.checkpointReached = true
    this.missionActive = false
    this.waypoint.visible = false
    this.mapShell.classList.add('is-visible')
    this.root.classList.remove('is-active', 'is-cinematic', 'has-panel')
    document.documentElement.classList.remove('story-active', 'cinematic-active')
    this.drawMap()
  }

  finishCinematic() {
    if (this.state !== 'cinematic') return
    this.cinematicTime = STORY_CONFIG.cinematicDuration
    this.root.classList.remove('is-cinematic')
    this.panel.classList.remove('is-question')
    document.documentElement.classList.remove('cinematic-active')
    this.showDialogue(0)
  }

  showDialogue(index) {
    this.state = 'dialogue'
    this.dialogueIndex = index
    this.paused = true
    this.cameraActive = true
    this.game.pauseDriving('STORY')
    this.root.classList.add('is-active', 'has-panel')
    this.root.classList.remove('is-cinematic')
    this.clueForm.hidden = true
    this.skipButton.hidden = false
    this.continueButton.textContent = 'Continue'
    const item = STORY_CONFIG.dialogue[index]
    this.eyebrow.textContent = item.eyebrow
    this.title.textContent = item.title
    this.text.textContent = item.text
  }

  showClue() {
    this.state = 'clue'
    this.paused = true
    this.cameraActive = true
    this.root.classList.add('is-active', 'has-panel')
    this.skipButton.hidden = true
    this.clueForm.hidden = false
    this.eyebrow.textContent = STORY_CONFIG.firstClue.eyebrow
    this.title.textContent = STORY_CONFIG.firstClue.title
    this.text.textContent = 'Solve this small clue to uncover the first route.'
    this.cluePrompt.textContent = STORY_CONFIG.firstClue.prompt
    this.clueInput.placeholder = STORY_CONFIG.firstClue.placeholder
    this.clueError.textContent = ''
    this.continueButton.textContent = 'Reveal checkpoint'
    this.focusClueInput()
    window.setTimeout(() => this.focusClueInput(), 160)
  }

  focusClueInput() {
    if (this.state !== 'clue' || this.clueForm.hidden) return
    this.clueInput.focus({ preventScroll: true })
  }

  continue() {
    if (this.state === 'dialogue') {
      const next = this.dialogueIndex + 1
      if (next < STORY_CONFIG.dialogue.length) this.showDialogue(next)
      else this.showClue()
      return
    }
    if (this.state === 'clue') {
      this.submitClue()
      return
    }
    if (this.state === 'reveal') {
      this.startMission()
      return
    }
    if (this.state === 'arrival') {
      this.closePopup()
      const callback = this.briefingContinue
      this.briefingContinue = null
      callback?.()
    }
  }

  submitClue() {
    if (this.state !== 'clue') return
    const answer = normalizeAnswer(this.clueInput.value)
    const valid = STORY_CONFIG.firstClue.answers.some((item) => normalizeAnswer(item) === answer)
    if (!valid) {
      this.clueError.textContent = STORY_CONFIG.firstClue.error
      this.clueForm.classList.remove('has-error')
      void this.clueForm.offsetWidth
      this.clueForm.classList.add('has-error')
      this.clueInput.select()
      return
    }
    this.checkpoint1Discovered = true
    this.waypoint.visible = true
    this.state = 'reveal'
    this.clueForm.hidden = true
    this.eyebrow.textContent = STORY_CONFIG.reveal.eyebrow
    this.title.textContent = STORY_CONFIG.reveal.title
    this.text.textContent = STORY_CONFIG.reveal.text
    this.continueButton.textContent = 'Start mission'
    this.drawMap()
  }

  startMission() {
    this.state = 'driving'
    this.paused = false
    this.cameraActive = false
    this.missionActive = true
    this.root.classList.remove('is-active', 'has-panel')
    this.missionHud.querySelector('span').textContent = 'FIRST MISSION'
    this.missionHud.querySelector('strong').textContent = 'Reach Signal Point'
    this.missionHud.classList.add('is-visible')
    document.documentElement.classList.remove('story-active')
    this.game.enableDriving()
  }

  arrive() {
    if (this.checkpointReached) return
    this.checkpointReached = true
    this.missionActive = false
    this.waypoint.visible = false
    this.missionHud.classList.remove('is-visible')
    const briefing = this.game.puzzles.getCheckpointBriefing()
    this.showPuzzleBriefing(briefing, () => this.game.puzzles.beginStationMission())
  }

  showPuzzleBriefing(briefing, onContinue) {
    this.state = 'arrival'
    this.briefingContinue = onContinue
    this.paused = true
    this.cameraActive = false
    this.game.pauseDriving('CHECKPOINT')
    document.documentElement.classList.add('story-active')
    this.root.classList.add('is-active', 'has-panel')
    this.panel.classList.add('is-question')
    this.skipButton.hidden = true
    this.clueForm.hidden = true
    this.eyebrow.textContent = briefing.eyebrow
    this.title.textContent = briefing.title
    this.text.textContent = briefing.text
    this.continueButton.textContent = briefing.continueLabel
  }

  closePopup() {
    this.state = 'free-drive'
    this.paused = false
    this.cameraActive = false
    this.root.classList.remove('is-active', 'has-panel')
    this.panel.classList.remove('is-question')
    document.documentElement.classList.remove('story-active')
  }

  update(delta) {
    if (this.state === 'cinematic') {
      this.cinematicTime += delta
      const progress = clamp01(this.cinematicTime / STORY_CONFIG.cinematicDuration)
      this.applyCinematicCamera(smooth(progress))
      if (progress < 0.32) this.caption.textContent = 'THREE LOCKS. ONE CHANCE.'
      else if (progress < 0.68) this.caption.textContent = 'SOMETHING WAITS IN THE DARK.'
      else this.caption.textContent = 'THE ROAD STARTS HERE.'
      if (progress >= 1) this.finishCinematic()
    } else if (this.cameraActive) {
      this.applyCarPortrait(delta)
    }

    if (this.checkpoint1Discovered && !this.checkpointReached) {
      const pulse = 1 + Math.sin(this.game.elapsed * 3.2) * 0.08
      this.waypoint.scale.setScalar(pulse)
      this.waypoint.rotation.z += delta * 0.45
    }

    if (this.missionActive) {
      const site = this.game.world.rescue.locations[0]
      const distance = Math.hypot(this.game.vehicle.position.x - site.x, this.game.vehicle.position.y - site.y)
      this.distance.textContent = `${Math.max(0, Math.round(distance))} m`
      if (distance < 4.6) this.arrive()
    }

    this.mapAccumulator += delta
    if (this.mapAccumulator > 0.08) {
      this.mapAccumulator = 0
      this.drawMap()
    }
    return this.cameraActive
  }

  applyCinematicCamera(progress) {
    this.cameraCurve.getPointAt(progress, this.game.camera.position)
    this.targetCurve.getPointAt(progress, this.game.cameraTarget)
    this.game.camera.lookAt(this.game.cameraTarget)
    this.game.camera.fov = THREE.MathUtils.lerp(43, 49, progress)
    this.game.camera.updateProjectionMatrix()
  }

  applyCarPortrait(delta) {
    const car = this.game.vehicle.position
    const desired = this.temp.set(car.x - 5.4, car.y + 5.2, car.z + 3.35)
    const follow = 1 - Math.exp(-delta * 2.8)
    this.game.camera.position.lerp(desired, follow)
    this.game.cameraTarget.lerp(this.temp.set(car.x + 0.5, car.y, car.z + 0.25), follow)
    this.game.camera.lookAt(this.game.cameraTarget)
    this.game.camera.fov = THREE.MathUtils.lerp(this.game.camera.fov, 47, follow)
    this.game.camera.updateProjectionMatrix()
  }

  resizeMap() {
    const size = Math.max(150, Math.round(this.map.clientWidth || 184))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.map.width = Math.round(size * dpr)
    this.map.height = Math.round(size * dpr)
    this.mapContext.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.mapSize = size
    this.drawMap()
  }

  mapPoint(x, y) {
    const padding = 11
    const scale = (this.mapSize - padding * 2) / 78
    return [padding + (x + 39) * scale, this.mapSize - padding - (y + 39) * scale]
  }

  drawMap() {
    if (!this.mapSize) return
    const context = this.mapContext
    const size = this.mapSize
    context.clearRect(0, 0, size, size)
    context.fillStyle = 'rgba(12, 39, 43, .94)'
    context.fillRect(0, 0, size, size)

    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#58777a'
    context.lineWidth = 8
    context.beginPath()
    for (let index = 0; index <= 80; index += 1) {
      const point = this.game.world.roadCurve.getPointAt(index / 80)
      const [x, y] = this.mapPoint(point.x, point.y)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.closePath()
    context.stroke()

    context.strokeStyle = '#809495'
    context.lineWidth = 3
    for (const site of this.game.world.rescue.locations) {
      const [x1, y1] = this.mapPoint(site.approach.x, site.approach.y)
      const [x2, y2] = this.mapPoint(site.x, site.y)
      context.beginPath()
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.stroke()
    }

    const [railLeft, railY] = this.mapPoint(-38, 9)
    const [railRight] = this.mapPoint(38, 9)
    context.setLineDash([4, 4])
    context.strokeStyle = '#d7c8a5'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(railLeft, railY)
    context.lineTo(railRight, railY)
    context.stroke()
    context.setLineDash([])

    const [tunnelX, tunnelY] = this.mapPoint(-29, 9)
    context.fillStyle = '#061417'
    context.fillRect(tunnelX - 5, tunnelY - 5, 10, 10)

    if (this.checkpoint1Discovered) {
      const site = this.game.world.rescue.locations[0]
      const [x, y] = this.mapPoint(site.x, site.y)
      context.strokeStyle = '#ffb266'
      context.lineWidth = 3
      context.beginPath()
      context.arc(x, y, 7, 0, Math.PI * 2)
      context.stroke()
      context.fillStyle = '#fff3cd'
      context.font = '900 8px system-ui'
      context.textAlign = 'center'
      context.fillText('1', x, y + 3)
    }

    this.game.puzzles?.drawMapOverlay(context, this.mapProject)

    const car = this.game.vehicle.position
    const [carX, carY] = this.mapPoint(car.x, car.y)
    const quaternion = this.game.vehicle.body.quaternion
    const yaw = Math.atan2(
      2 * (quaternion.w * quaternion.z + quaternion.x * quaternion.y),
      1 - 2 * (quaternion.y * quaternion.y + quaternion.z * quaternion.z)
    )
    context.save()
    context.translate(carX, carY)
    context.rotate(-yaw + Math.PI / 2)
    context.fillStyle = '#ff8e58'
    context.beginPath()
    context.moveTo(0, -7)
    context.lineTo(5, 6)
    context.lineTo(0, 4)
    context.lineTo(-5, 6)
    context.closePath()
    context.fill()
    context.restore()
  }

  isDrivingBlocked() {
    return this.paused
  }

  getState() {
    return {
      state: this.state,
      paused: this.paused,
      cinematicActive: this.state === 'cinematic',
      dialogueIndex: this.dialogueIndex,
      checkpoint1Discovered: this.checkpoint1Discovered,
      missionActive: this.missionActive,
      checkpointReached: this.checkpointReached
    }
  }
}
