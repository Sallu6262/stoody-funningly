import * as THREE from 'three'

const clamp = THREE.MathUtils.clamp
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))

// Adapted from Bruno Simon's MIT-licensed Folio 2025 Nipple.js / Player.js.
// The 270-degree forward sector, 2–4.5m dead zone/range and cubic throttle
// deliberately follow the reference. This world uses Z-up instead of Y-up.
export function getJoystickInput(carAngle, targetAngle, progress) {
  const forward = Math.abs(wrapAngle(targetAngle - carAngle)) < Math.PI * 0.75
  const angle = wrapAngle(targetAngle - carAngle - (forward ? 0 : Math.PI))
  const throttle = Math.pow(clamp(progress, 0, 1), 3) * (forward ? 1 : -1)
  return {
    throttle,
    steer: -clamp(angle / (Math.PI * 0.25), -1, 1) * (forward ? 1 : -1),
    forward: throttle > 0,
    backward: throttle < 0,
    brake: false,
    boost: false,
    angle,
    isForward: forward
  }
}

export class TouchControls {
  constructor(game) {
    this.game = game
    this.canvas = game.canvas
    this.pointers = new Map()
    this.active = false
    this.progress = 0
    this.input = getJoystickInput(0, 0, 0)
    this.raycaster = new THREE.Raycaster()
    this.ndc = new THREE.Vector2()
    this.point = new THREE.Vector3()
    this.position = new THREE.Vector3()
    this.forward = new THREE.Vector3()
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.12)
    this.gesture = null
    this.tapCandidate = false
    this.touchMode = matchMedia('(pointer: coarse)').matches
    this.hint = document.querySelector('#touch-drive-hint')
    document.documentElement.classList.toggle('touch-mode', this.touchMode)
    this.buildRing()
    this.bindEvents()
  }

  buildRing() {
    this.uniforms = {
      progress: { value: 0 },
      forward: { value: 1 },
      startAngle: { value: 0 },
      endAngle: { value: 0 }
    }
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: this.uniforms,
      vertexShader: `
        varying vec2 radialPosition;
        void main() {
          radialPosition = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 radialPosition;
        uniform float progress;
        uniform float forward;
        uniform float startAngle;
        uniform float endAngle;
        void main() {
          float radius = length(radialPosition);
          float angle = atan(radialPosition.y, radialPosition.x);
          float directionSDF = abs(angle) - 2.35619449;
          if (forward < 0.5) directionSDF = -directionSDF;
          float direction = step(directionSDF, 0.0);
          float innerEdge = abs(radius - 2.0);
          float outerEdge = abs(radius - 4.5);
          float edgesFill = max(step(innerEdge, 0.05), step(outerEdge, 0.05) * direction);
          float edgesOutline = max(step(innerEdge, 0.1), step(outerEdge, 0.1));
          float progressSDF = max(radius - 2.0 - progress * 2.4, 2.1 - radius);
          float inAngle = step(startAngle, angle) * step(angle, endAngle);
          float progressFill = step(progressSDF, 0.0) * inAngle;
          float outline = max(edgesOutline, step(progressSDF, 0.05) * direction);
          if (outline < 0.001) discard;
          float fill = max(edgesFill, progressFill);
          gl_FragColor = vec4(vec3(fill * (progress >= 0.999 ? 1.5 : 1.0)), outline * 0.35 + fill * 0.65);
        }
      `
    })
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 4.8, 20), material)
    this.ring.name = 'touch-drive-joystick'
    this.ring.renderOrder = 10
    this.ring.visible = false
    this.game.scene.add(this.ring)
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!['touch', 'pen'].includes(event.pointerType) || !this.game.started || this.game.isDrivingBlocked()) return
      event.preventDefault()
      this.touchMode = true
      document.documentElement.classList.add('touch-mode')
      this.canvas.setPointerCapture(event.pointerId)
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      this.game.audio.unlock()
      if (this.pointers.size === 1) {
        this.active = true
        this.update()
        this.tapCandidate = this.progress === 0
      } else {
        this.active = false
        this.tapCandidate = false
        this.progress = 0
        this.input = getJoystickInput(0, 0, 0)
        this.ring.visible = false
        this.gesture = this.getGesture()
      }
    })
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.pointers.has(event.pointerId)) return
      event.preventDefault()
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (this.pointers.size >= 2) {
        const next = this.getGesture()
        if (this.gesture) {
          this.game.cameraOrbitOffset -= (next.x - this.gesture.x) * 0.008
          this.game.cameraElevation = clamp(this.game.cameraElevation + (next.y - this.gesture.y) * 0.012, 1.6, 8)
          this.game.cameraZoom = clamp(this.game.cameraZoom * this.gesture.distance / Math.max(next.distance, 1), 0.7, 1.8)
        }
        this.gesture = next
      } else if (this.active) {
        this.update()
        if (this.progress > 0) this.tapCandidate = false
      }
    })
    const end = (event) => {
      if (!this.pointers.has(event.pointerId)) return
      if (event.type === 'pointerup' && this.active && this.tapCandidate && this.game.vehicle.hop()) this.game.audio.playHop()
      this.pointers.delete(event.pointerId)
      this.active = false
      this.progress = 0
      this.input = getJoystickInput(0, 0, 0)
      this.tapCandidate = false
      this.gesture = this.pointers.size >= 2 ? this.getGesture() : null
      this.ring.visible = false
    }
    this.canvas.addEventListener('pointerup', end)
    this.canvas.addEventListener('pointercancel', end)
    this.canvas.addEventListener('lostpointercapture', end)
    window.addEventListener('blur', () => this.reset())
    window.addEventListener('resize', () => this.reset())
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset() })
  }

  getGesture() {
    const [a, b] = [...this.pointers.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
  }

  update() {
    if (!this.active || this.game.isDrivingBlocked()) {
      this.ring.visible = false
      return
    }
    const pointer = this.pointers.values().next().value
    if (!pointer) return
    this.position.copy(this.game.vehicle.position)
    this.position.z = clamp(this.position.z - 0.25, 0.1, 0.65)
    this.plane.constant = -this.position.z
    this.ndc.set(pointer.x / innerWidth * 2 - 1, 1 - pointer.y / innerHeight * 2)
    this.raycaster.setFromCamera(this.ndc, this.game.camera)
    if (!this.raycaster.ray.intersectPlane(this.plane, this.point)) {
      this.progress = 0
      this.input = getJoystickInput(0, 0, 0)
      return
    }
    const distance = this.position.distanceTo(this.point)
    this.progress = clamp((distance - 2) / 2.5, 0, 1)
    this.forward.set(1, 0, 0).applyQuaternion(this.game.vehicle.quaternion)
    const angle = Math.atan2(this.forward.y, this.forward.x)
    this.input = getJoystickInput(angle, Math.atan2(this.point.y - this.position.y, this.point.x - this.position.x), this.progress)
    this.ring.position.copy(this.position)
    this.ring.rotation.z = angle
    this.ring.visible = true
    this.uniforms.progress.value = this.progress
    this.uniforms.forward.value = this.input.isForward ? 1 : 0
    const a = this.input.angle
    this.uniforms.startAngle.value = this.input.isForward ? Math.min(0, a) : a > 0 ? -Math.PI : Math.PI + a
    this.uniforms.endAngle.value = this.input.isForward ? Math.max(0, a) : a > 0 ? -Math.PI + a : Math.PI
    this.hint.classList.add('is-used')
  }

  reset() {
    const pointerIds = [...this.pointers.keys()]
    this.pointers.clear()
    this.active = false
    this.progress = 0
    this.tapCandidate = false
    this.gesture = null
    this.input = getJoystickInput(0, 0, 0)
    this.ring.visible = false
    for (const id of pointerIds) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
  }

  getState() {
    return { active: this.active, pointers: this.pointers.size, progress: this.progress, throttle: this.input.throttle, steer: this.input.steer, ringVisible: this.ring.visible }
  }
}
