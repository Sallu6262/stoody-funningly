import * as THREE from 'three'
import CANNON from 'cannon'
import { World } from './World.js'
import { Vehicle } from './Vehicle.js'
import { RESCUE_CONFIG } from './rescueConfig.js'
import { StoryController } from './Story.js'
import { PuzzleSystem } from './PuzzleSystem.js'

export class Game {
  constructor(canvas) {
    this.canvas = canvas
    this.started = false
    this.collisions = 0
    this.lastCollisionAt = 0
    this.lastFrame = performance.now()
    this.elapsed = 0
    this.fps = 60
    this.frameSamples = []
    this.transientStatusUntil = 0
    this.input = { forward: false, backward: false, left: false, right: false, brake: false, boost: false }
    this.touchActive = new Set()
    this.cameraCarPosition = new THREE.Vector3()
    this.cameraCarQuaternion = new THREE.Quaternion()
    this.cameraForward = new THREE.Vector3()
    this.cameraUp = new THREE.Vector3(0, 0, 1)
    this.cameraDesiredPosition = new THREE.Vector3()
    this.cameraDesiredTarget = new THREE.Vector3()

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xbadcd6)
    this.scene.fog = new THREE.Fog(0xbadcd6, 34, 82)

    this.camera = new THREE.PerspectiveCamera(47, 1, 0.1, 145)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(-13, -11, 6.2)
    this.cameraTarget = new THREE.Vector3(-4, -1, 0.7)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.compactDevice = window.innerWidth <= 720 || window.matchMedia('(pointer: coarse)').matches
    this.renderer.shadowMap.type = this.compactDevice ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0xbadcd6)

    this.physics = new CANNON.World()
    this.physics.gravity.set(0, 0, -13)
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics)
    this.physics.solver.iterations = 10
    this.physics.allowSleep = true
    this.physics.defaultContactMaterial.friction = 0.28
    this.physics.defaultContactMaterial.restitution = 0.12

    this.addLights()
    this.world = new World(this.scene, this.physics)
    this.vehicle = new Vehicle({
      scene: this.scene,
      world: this.physics,
      groundMaterial: this.world.groundMaterial,
      onCollision: (impact, type) => this.handleCollision(impact, type)
    })

    this.speedElement = document.querySelector('#speed')
    this.statusElement = document.querySelector('#status')
    this.hintElement = document.querySelector('#hint')
    this.setupRescueUI()
    this.story = new StoryController(this)
    this.puzzles = new PuzzleSystem(this)
    this.setupTrainUI()
    this.setupInput()
    this.resize()
    window.addEventListener('resize', () => this.resize())
    document.addEventListener('visibilitychange', () => { this.lastFrame = performance.now() })

    this.debugApi = {
      ready: true,
      getState: () => this.getDebugState(),
      reset: () => this.vehicle.reset(),
      setInput: (name, value) => { if (name in this.input) this.input[name] = Boolean(value) },
      teleport: (x, y, z = 0.55, yaw = 0) => this.vehicle.reset({ x, y, z }, yaw),
      start: () => this.start(),
      skipCinematic: () => this.story.finishCinematic(),
      setPuzzleMockStatus: (status, feedback, checkpointId) => this.puzzles.setMockStatus(status, feedback, checkpointId),
      checkPuzzleStatus: () => this.puzzles.checkApproval(true),
      endTimer: () => this.puzzles.forceTimeout(),
      showTrain: () => this.openTrainView(),
      closeTrain: () => this.closeTrainView()
    }

    requestAnimationFrame((time) => this.tick(time))
  }

  addLights() {
    const hemisphere = new THREE.HemisphereLight(0xf4fbf4, 0x507a70, 2.15)
    this.scene.add(hemisphere)

    const sun = new THREE.DirectionalLight(0xfff0d0, 3.0)
    sun.position.set(-14, -19, 30)
    sun.castShadow = true
    const shadowSize = this.compactDevice ? 512 : 1024
    sun.shadow.mapSize.set(shadowSize, shadowSize)
    sun.shadow.camera.left = -36
    sun.shadow.camera.right = 36
    sun.shadow.camera.top = 36
    sun.shadow.camera.bottom = -36
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 72
    sun.shadow.bias = -0.00045
    sun.shadow.normalBias = 0.025
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(0x67bfc5, 0.52)
    fill.position.set(18, 12, 10)
    this.scene.add(fill)
  }

  setupInput() {
    const keyMap = {
      ArrowUp: 'forward', KeyW: 'forward',
      ArrowDown: 'backward', KeyS: 'backward',
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      Space: 'brake', ShiftLeft: 'boost', ShiftRight: 'boost'
    }

    window.addEventListener('keydown', (event) => {
      const isTyping = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      if (this.isDrivingBlocked() && !isTyping) return
      if (event.code === 'KeyE' && !isTyping) {
        if (event.repeat) return
        if (this.puzzles.canInteract()) this.puzzles.openForm()
        else if (this.rescueNear) this.toggleRescuePanel()
        return
      }
      if (isTyping) return
      if (event.code === 'KeyR') {
        this.vehicle.reset()
        this.setTransientStatus('RESET', 700)
        return
      }
      const action = keyMap[event.code]
      if (!action) return
      event.preventDefault()
      this.input[action] = true
    })

    window.addEventListener('keyup', (event) => {
      const action = keyMap[event.code]
      if (!action) return
      event.preventDefault()
      this.input[action] = false
    })

    window.addEventListener('blur', () => {
      for (const key of Object.keys(this.input)) this.input[key] = false
    })

    for (const button of document.querySelectorAll('[data-control]')) {
      const control = button.dataset.control
      const action = control === 'left' || control === 'right' ? control
        : control === 'forward' ? 'forward'
          : control === 'boost' ? 'boost' : 'backward'
      const begin = (event) => {
        event.preventDefault()
        if (this.isDrivingBlocked()) return
        button.setPointerCapture?.(event.pointerId)
        this.touchActive.add(action)
        this.input[action] = true
        if (action === 'boost') this.input.forward = true
        button.classList.add('is-active')
      }
      const end = (event) => {
        event.preventDefault()
        this.touchActive.delete(action)
        this.input[action] = false
        if (action === 'boost' || action === 'forward') {
          this.input.forward = this.touchActive.has('forward') || this.touchActive.has('boost')
        }
        button.classList.remove('is-active')
      }
      button.addEventListener('pointerdown', begin)
      button.addEventListener('pointerup', end)
      button.addEventListener('pointercancel', end)
      button.addEventListener('pointerleave', (event) => { if (event.buttons) end(event) })
    }
  }

  setupRescueUI() {
    this.rescueControls = document.querySelector('#rescue-controls')
    this.rescueToggle = document.querySelector('#rescue-toggle')
    this.rescueDetail = this.rescueToggle.querySelector('small')
    this.rescueConsole = document.querySelector('#lock-console')
    this.rescueClose = document.querySelector('#rescue-close')
    this.rescueNear = false
    this.rescuePanelOpen = false
    this.rescueForms = [...document.querySelectorAll('[data-lock-form]')]

    this.rescueToggle.addEventListener('click', () => this.toggleRescuePanel())
    this.rescueClose.addEventListener('click', () => this.toggleRescuePanel(false))
    for (const form of this.rescueForms) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        const index = Number(form.dataset.lockForm)
        const input = form.querySelector('input')
        const output = form.querySelector('output')
        const enteredCode = String(input.value).trim().toUpperCase()
        const button = form.querySelector('button')
        button.disabled = true
        output.textContent = 'Verifying approval…'
        const result = await this.puzzles.tryUnlock(index, enteredCode)
        if (result.ok) {
          form.classList.add('is-unlocked')
          input.disabled = true
          button.disabled = true
          output.textContent = result.alreadyUnlocked ? 'Already open' : 'Unlocked'
          this.setTransientStatus(`LOCK ${index + 1} OPEN`, 1100)
        } else {
          button.disabled = false
          form.classList.add('has-error')
          output.textContent = result.reason === 'not-awarded'
            ? 'Complete its approved paper first'
            : result.reason === 'verification-failed' ? 'Could not verify — try again' : 'Code not recognized'
          input.select()
          window.setTimeout(() => form.classList.remove('has-error'), 650)
        }
      })
    }
  }

  setupTrainUI() {
    this.trainViewButton = document.querySelector('#train-view-open')
    this.trainViewLayer = document.querySelector('#train-view')
    this.trainViewClose = document.querySelector('#train-view-close')
    this.trainViewStatus = document.querySelector('#train-view-status')
    this.trainViewOpen = false
    this.trainViewLocked = false
    this.trainViewButton.addEventListener('click', () => this.openTrainView())
    this.trainViewClose.addEventListener('click', () => this.closeTrainView())
  }

  openTrainView({ locked = false } = {}) {
    if (this.puzzles?.completed) return
    this.trainViewOpen = true
    this.trainViewLocked = locked
    this.trainViewLayer.classList.add('is-active')
    this.trainViewLayer.classList.toggle('is-impact', locked)
    this.trainViewClose.hidden = locked
    document.documentElement.classList.add('train-view-active')
    this.pauseDriving(locked ? 'IMPACT' : 'TRAIN VIEW')
  }

  closeTrainView({ force = false, resume = true } = {}) {
    if (this.trainViewLocked && !force) return
    this.trainViewOpen = false
    this.trainViewLocked = false
    this.trainViewLayer.classList.remove('is-active', 'is-impact')
    this.trainViewClose.hidden = false
    document.documentElement.classList.remove('train-view-active')
    if (resume && !this.isDrivingBlocked()) this.enableDriving()
  }

  toggleRescuePanel(force) {
    if (!this.rescueNear && force !== false) return
    const wasOpen = this.rescuePanelOpen
    this.rescuePanelOpen = typeof force === 'boolean' ? force : !this.rescuePanelOpen
    this.rescueControls.classList.toggle('is-open', this.rescuePanelOpen)
    this.rescueConsole.setAttribute('aria-hidden', String(!this.rescuePanelOpen))
    if (this.rescuePanelOpen) {
      const firstAvailable = this.rescueForms.find((form) => !form.classList.contains('is-unlocked'))
      firstAvailable?.querySelector('input')?.focus()
    } else if (wasOpen && !this.isDrivingBlocked()) {
      this.canvas.focus()
    }
  }

  updateRescueInteraction() {
    if (this.isDrivingBlocked()) {
      this.rescueNear = false
      this.rescueControls.classList.remove('is-near')
      this.toggleRescuePanel(false)
      return
    }
    const rescue = this.world.rescue
    const distance = Math.hypot(this.vehicle.position.x - rescue.captivePosition.x, this.vehicle.position.y - rescue.captivePosition.y)
    const near = distance <= RESCUE_CONFIG.interactionRadius
    if (near !== this.rescueNear) {
      this.rescueNear = near
      this.rescueControls.classList.toggle('is-near', near)
      if (!near) this.toggleRescuePanel(false)
    }
    const unlockedCount = rescue.unlocked.filter(Boolean).length
    this.rescueDetail.textContent = unlockedCount === rescue.unlocked.length ? 'ALL LOCKS OPEN' : `PRESS E • ${unlockedCount}/${rescue.unlocked.length} OPEN`
  }

  async start() {
    await this.puzzles.prepare()
    if (this.puzzles.resumeSession()) {
      this.story.resumeFreeDrive()
      this.enableDriving()
      return
    }
    this.story.begin()
  }

  isDrivingBlocked() {
    return this.story?.isDrivingBlocked() || this.puzzles?.isDrivingBlocked() || this.trainViewOpen || false
  }

  enableDriving() {
    this.started = true
    this.vehicle.body.wakeUp()
    this.statusElement.textContent = 'DRIVE'
    window.setTimeout(() => { this.hintElement.style.opacity = '0' }, 9000)
    this.canvas.focus()
  }

  pauseDriving(status = 'PAUSED') {
    for (const key of Object.keys(this.input)) this.input[key] = false
    this.touchActive.clear()
    for (const button of document.querySelectorAll('[data-control].is-active')) button.classList.remove('is-active')
    this.vehicle.body.velocity.setZero()
    this.vehicle.body.angularVelocity.setZero()
    this.vehicle.body.force.setZero()
    this.vehicle.body.torque.setZero()
    this.vehicle.forwardSpeed = 0
    this.vehicle.speed = 0
    this.vehicle.boosting = false
    for (let i = 0; i < 4; i += 1) {
      this.vehicle.raycast.applyEngineForce(0, i)
      this.vehicle.raycast.setBrake(0, i)
    }
    this.transientStatusUntil = 0
    this.statusElement.textContent = status
  }

  setTransientStatus(status, duration = 800) {
    this.statusElement.textContent = status
    this.transientStatusUntil = performance.now() + duration
  }

  handleCollision(impact, type) {
    const now = performance.now()
    if (now - this.lastCollisionAt < 180) return
    this.lastCollisionAt = now
    this.collisions += 1
    this.setTransientStatus(impact > 6 ? 'BIG HIT!' : type === 'ramp' ? 'AIRTIME' : 'BUMP!', 720)
  }

  updateCamera(delta) {
    const carPosition = this.cameraCarPosition.copy(this.vehicle.position)
    const carQuaternion = this.cameraCarQuaternion.copy(this.vehicle.quaternion)
    const forward = this.cameraForward.set(1, 0, 0).applyQuaternion(carQuaternion).normalize()
    const up = this.cameraUp
    const speed = Math.abs(this.vehicle.forwardSpeed)

    const desiredPosition = this.cameraDesiredPosition.copy(carPosition)
    const desiredTarget = this.cameraDesiredTarget.copy(carPosition)
    if (!this.started) {
      const drift = Math.sin(this.elapsed * 0.18) * 0.8
      desiredPosition.add(this.cameraForward.set(-5.2, 5.5 + drift, 3.6))
      desiredTarget.add(this.cameraForward.set(0.7, 0, 0.25))
    } else {
      forward.z = 0
      if (forward.lengthSq() < 0.001) forward.set(1, 0, 0)
      else forward.normalize()
      const chaseDistance = 5.4 + Math.min(speed * 0.055, 1.3)
      desiredPosition.addScaledVector(forward, -chaseDistance).addScaledVector(up, 2.8 + Math.min(speed * 0.025, 0.6))
      desiredTarget.addScaledVector(forward, 2.0 + Math.min(speed * 0.11, 2.2)).addScaledVector(up, 0.38)
    }

    const follow = 1 - Math.exp(-delta * (this.started ? 5.6 : 2.1))
    this.camera.position.lerp(desiredPosition, follow)
    this.cameraTarget.lerp(desiredTarget, follow * 1.15)
    this.camera.lookAt(this.cameraTarget)

    const targetFov = this.started ? 47 + Math.min(speed * 0.36, 9) + (this.vehicle.boosting ? 3 : 0) : 47
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-delta * 4))
    this.camera.updateProjectionMatrix()
  }

  updateHud() {
    const kmh = Math.round(Math.abs(this.vehicle.forwardSpeed) * 3.6)
    this.speedElement.textContent = String(Math.min(kmh, 999)).padStart(3, '0')
    if (this.isDrivingBlocked()) return
    if (performance.now() < this.transientStatusUntil) return
    if (this.vehicle.boosting) this.statusElement.textContent = 'BOOST'
    else if (this.input.brake) this.statusElement.textContent = 'BRAKING'
    else if (this.input.backward && this.vehicle.forwardSpeed < 0) this.statusElement.textContent = 'REVERSE'
    else this.statusElement.textContent = 'DRIVE'
  }

  resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    const compact = width <= 720 || window.matchMedia('(pointer: coarse)').matches
    const maxDpr = compact ? 1.25 : 1.75
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.story?.resizeMap()
  }

  tick(time) {
    const delta = Math.min((time - this.lastFrame) / 1000, 0.08)
    this.lastFrame = time
    this.elapsed += delta

    if (this.started && !this.isDrivingBlocked()) {
      this.vehicle.updateControls(this.input, delta)
      this.physics.step(1 / 60, delta, 4)
    }
    this.vehicle.syncVisuals()
    this.world.update(this.elapsed, delta)
    this.puzzles.update(delta)
    this.updateRescueInteraction()
    const storyCameraActive = this.story.update(delta)
    if (this.trainViewOpen) {
      this.world.rescue.train.applyCinematicCamera(this.camera, this.cameraTarget, delta)
      const train = this.world.rescue.train.getState()
      this.trainViewStatus.textContent = train.phase === 'crashing'
        ? 'TIME EXPIRED · IMPACT SEQUENCE'
        : train.timerState === 'paused' ? 'COUNTDOWN PAUSED FOR REVIEW'
          : train.timerState === 'idle' ? 'TRAIN WAITING IN THE DARK'
            : `${Math.ceil(train.remainingSeconds)} SECONDS REMAINING`
    } else if (!storyCameraActive) this.updateCamera(delta)
    this.updateHud()
    this.renderer.render(this.scene, this.camera)

    if (delta > 0) {
      this.frameSamples.push(1 / delta)
      if (this.frameSamples.length > 90) this.frameSamples.shift()
      this.fps = this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length
    }
    requestAnimationFrame((next) => this.tick(next))
  }

  getDebugState() {
    return {
      ready: true,
      started: this.started,
      position: { x: this.vehicle.position.x, y: this.vehicle.position.y, z: this.vehicle.position.z },
      velocity: { x: this.vehicle.body.velocity.x, y: this.vehicle.body.velocity.y, z: this.vehicle.body.velocity.z },
      speedKmh: Math.abs(this.vehicle.forwardSpeed) * 3.6,
      steering: this.vehicle.steering,
      boosting: this.vehicle.boosting,
      collisions: this.collisions,
      camera: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, fov: this.camera.fov },
      fps: this.fps,
      render: { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles },
      bodies: this.physics.bodies.length,
      dynamicObjects: this.world.dynamic.length,
      phase2: this.world.rescue.getState(),
      phase3: this.story.getState(),
      phase4: this.puzzles.getState(),
      phase5: {
        ...this.puzzles.getState(),
        trainViewOpen: this.trainViewOpen,
        train: this.world.rescue.train.getState()
      },
      wheelContact: this.vehicle.raycast.wheelInfos.map((wheel) => ({
        contact: wheel.isInContact,
        suspension: wheel.suspensionLength,
        engine: wheel.engineForce,
        steer: wheel.steering
      })),
      sleepState: this.vehicle.body.sleepState,
      input: { ...this.input }
    }
  }
}
