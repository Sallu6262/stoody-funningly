import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const clamp01 = (value) => Math.max(0, Math.min(1, value))
const easeIn = (value) => value * value

function driverFaceTexture(skin, accent) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  context.fillStyle = skin
  context.fillRect(0, 0, 128, 128)
  context.fillStyle = accent
  context.fillRect(0, 0, 128, 24)
  context.fillStyle = '#173a3f'
  context.beginPath()
  context.arc(42, 57, 7, 0, Math.PI * 2)
  context.arc(86, 57, 7, 0, Math.PI * 2)
  context.fill()
  context.lineWidth = 6
  context.lineCap = 'round'
  context.beginPath()
  context.arc(64, 74, 24, 0.2, Math.PI - 0.2)
  context.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class TrainController {
  constructor({ scene, captiveGroup, captivePosition }) {
    this.scene = scene
    this.captiveGroup = captiveGroup
    this.captivePosition = captivePosition
    this.trackY = captivePosition.y
    this.startX = -39
    this.impactX = captivePosition.x - 3.25
    this.exitX = 40
    this.progress = 0
    this.remainingSeconds = 0
    this.timerState = 'idle'
    this.phase = 'idle'
    this.crashTime = 0
    this.crashDuration = 4.5
    this.burstTriggered = false
    this.rescueTime = 0
    this.onCrashComplete = null
    this.cameraPosition = new THREE.Vector3()
    this.cameraTarget = new THREE.Vector3()
    this.dummy = new THREE.Object3D()

    this.group = new THREE.Group()
    this.group.name = 'countdown-locomotive'
    this.group.position.set(this.startX, this.trackY, 0.3)
    this.scene.add(this.group)

    this.visual = new THREE.Group()
    this.group.add(this.visual)
    this.placeholder = this.buildPlaceholder()
    this.buildDrivers()
    this.buildBurstPieces()
    this.loadLocomotive()
  }

  buildPlaceholder() {
    const placeholder = new THREE.Group()
    const body = new THREE.MeshStandardMaterial({ color: 0x294c52, roughness: 0.58, metalness: 0.24, flatShading: true })
    const trim = new THREE.MeshStandardMaterial({ color: 0xffa05f, roughness: 0.48, metalness: 0.2, flatShading: true })
    const dark = new THREE.MeshStandardMaterial({ color: 0x102e34, roughness: 0.7, flatShading: true })
    const add = (geometry, material, position) => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(...position)
      mesh.castShadow = true
      mesh.receiveShadow = true
      placeholder.add(mesh)
      return mesh
    }
    add(new THREE.BoxGeometry(5.5, 1.7, 0.8), body, [0, 0, 0.7])
    add(new THREE.BoxGeometry(2.15, 1.65, 1.55), body, [-1.4, 0, 1.65])
    add(new THREE.CylinderGeometry(0.72, 0.72, 2.65, 12), trim, [0.75, 0, 1.35]).rotation.z = Math.PI / 2
    add(new THREE.CylinderGeometry(0.18, 0.28, 0.85, 8), dark, [1.25, 0, 2.25])
    for (const x of [-1.8, -0.45, 1.1, 2.15]) {
      for (const y of [-0.88, 0.88]) add(new THREE.CylinderGeometry(0.45, 0.45, 0.20, 12), dark, [x, y, 0.45]).rotation.x = Math.PI / 2
    }
    this.visual.add(placeholder)
    return placeholder
  }

  buildDrivers() {
    const glass = new THREE.MeshStandardMaterial({ color: 0x8bd9df, transparent: true, opacity: 0.36, roughness: 0.18, metalness: 0.1, side: THREE.DoubleSide })
    const frame = new THREE.MeshStandardMaterial({ color: 0x102e34, roughness: 0.62 })
    const cabin = new THREE.Group()
    cabin.name = 'placeholder-train-drivers'
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.72, 0.16), frame)
    roof.position.set(3.02, 0, 3.02)
    cabin.add(roof)
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.90), glass)
    window.position.set(3.23, 0, 2.47)
    cabin.add(window)
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.92), frame)
    divider.position.set(3.28, 0, 2.47)
    cabin.add(divider)
    const faces = [
      { y: -0.38, texture: driverFaceTexture('#d9a078', '#ffb05f') },
      { y: 0.38, texture: driverFaceTexture('#edba91', '#70d6c9') }
    ]
    for (const driver of faces) {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe7ad83, roughness: 0.8 }))
      head.position.set(3.00, driver.y, 2.47)
      cabin.add(head)
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), new THREE.MeshBasicMaterial({ map: driver.texture, depthTest: false }))
      face.rotation.y = Math.PI / 2
      face.position.set(3.285, driver.y, 2.47)
      face.renderOrder = 20
      cabin.add(face)
    }
    this.visual.add(cabin)
  }

  buildBurstPieces() {
    const count = 42
    const geometry = new THREE.BoxGeometry(0.18, 0.18, 0.18)
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, flatShading: true })
    this.pieces = new THREE.InstancedMesh(geometry, material, count)
    this.pieces.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.pieces.castShadow = true
    this.pieces.visible = false
    this.pieceState = []
    const colors = [0xe44f4f, 0xf05a5a, 0xc73545, 0xff7a62, 0xffc857, 0x70d6c9]
    for (let index = 0; index < count; index += 1) {
      this.pieces.setColorAt(index, new THREE.Color(colors[index < 30 ? index % 3 : 3 + (index % 3)]))
      this.pieceState.push({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), spin: new THREE.Vector3(), rotation: new THREE.Euler() })
    }
    this.pieces.instanceColor.needsUpdate = true
    this.scene.add(this.pieces)
  }

  async loadLocomotive() {
    try {
      const gltf = await new GLTFLoader().loadAsync('/assets/locomotive.glb')
      const asset = gltf.scene
      asset.updateMatrixWorld(true)
      this.rawAssetSize = new THREE.Box3().setFromObject(asset).getSize(new THREE.Vector3()).toArray()
      // The asset is X-forward/Y-up. Rotate only its up axis into this Z-up world.
      asset.rotation.set(Math.PI / 2, 0, 0)
      asset.updateMatrixWorld(true)
      let box = new THREE.Box3().setFromObject(asset)
      const size = box.getSize(new THREE.Vector3())
      const scale = 6.4 / Math.max(size.x, 0.001)
      asset.scale.multiplyScalar(scale)
      // The licensed model's nose points toward -X; mirror it so it travels eastward nose-first.
      asset.scale.x *= -1
      asset.updateMatrixWorld(true)
      box = new THREE.Box3().setFromObject(asset)
      const center = box.getCenter(new THREE.Vector3())
      asset.position.x -= center.x
      asset.position.y -= center.y
      asset.position.z -= box.min.z
      asset.updateMatrixWorld(true)
      this.finalAssetSize = new THREE.Box3().setFromObject(asset).getSize(new THREE.Vector3()).toArray()
      asset.traverse((child) => {
        if (!child.isMesh) return
        child.castShadow = true
        child.receiveShadow = true
      })
      this.visual.add(asset)
      this.placeholder.visible = false
      this.assetLoaded = true
    } catch (error) {
      this.assetLoaded = false
      console.warn(`Locomotive asset could not load; using the lightweight fallback: ${error.message}`)
    }
  }

  setTimerProgress(progress, remainingSeconds, timerState = 'running') {
    if (this.phase === 'crashing' || this.phase === 'failed' || this.phase === 'rescue') return
    this.phase = 'tracking'
    this.progress = clamp01(progress)
    this.remainingSeconds = Math.max(0, remainingSeconds || 0)
    this.timerState = timerState
    const eased = 0.18 * this.progress + 0.82 * easeIn(this.progress)
    this.group.position.x = THREE.MathUtils.lerp(this.startX, this.impactX, eased)
    this.group.visible = true
  }

  resetForPaper() {
    this.phase = 'tracking'
    this.progress = 0
    this.timerState = 'running'
    this.crashTime = 0
    this.burstTriggered = false
    this.group.visible = true
    this.group.position.set(this.startX, this.trackY, 0.3)
    this.pieces.visible = false
    this.captiveGroup.visible = true
    this.captiveGroup.position.set(this.captivePosition.x, this.captivePosition.y, 0)
    this.captiveGroup.rotation.set(0, 0, 0)
  }

  resetToTunnel() {
    this.phase = 'idle'
    this.progress = 0
    this.timerState = 'idle'
    this.group.position.set(this.startX, this.trackY, 0.3)
    this.group.visible = true
    this.pieces.visible = false
    this.captiveGroup.visible = true
    this.captiveGroup.position.set(this.captivePosition.x, this.captivePosition.y, 0)
    this.captiveGroup.rotation.set(0, 0, 0)
  }

  timeout(onComplete) {
    if (this.phase === 'crashing' || this.phase === 'failed' || this.phase === 'rescue') return
    this.phase = 'crashing'
    this.crashTime = 0
    this.burstTriggered = false
    this.onCrashComplete = onComplete
    this.group.position.x = Math.max(this.group.position.x, this.impactX)
    this.group.visible = true
  }

  burstCaptive() {
    if (this.burstTriggered) return
    this.burstTriggered = true
    this.captiveGroup.visible = false
    this.pieces.visible = true
    for (let index = 0; index < this.pieceState.length; index += 1) {
      const piece = this.pieceState[index]
      const angle = (index / this.pieceState.length) * Math.PI * 2 + (index % 5) * 0.17
      const speed = 2.2 + (index % 7) * 0.28
      piece.position.set(this.captivePosition.x, this.captivePosition.y, 0.65 + (index % 4) * 0.08)
      piece.velocity.set(Math.cos(angle) * speed + 1.8, Math.sin(angle) * speed, 2.8 + (index % 6) * 0.42)
      piece.spin.set(2 + index % 5, 3 + index % 4, 4 + index % 3)
      piece.rotation.set(0, 0, 0)
    }
  }

  beginRescue() {
    this.phase = 'rescue'
    this.rescueTime = 0
    this.group.visible = false
    this.pieces.visible = false
    this.captiveGroup.visible = true
    this.captiveGroup.position.set(this.captivePosition.x, this.captivePosition.y, 0)
  }

  update(delta) {
    if (this.phase === 'crashing') {
      this.crashTime += delta
      const progress = clamp01(this.crashTime / this.crashDuration)
      this.group.position.x = THREE.MathUtils.lerp(this.impactX, this.exitX, progress * progress * (3 - 2 * progress))
      if (!this.burstTriggered && this.crashTime >= 0.18) this.burstCaptive()
      if (progress >= 1) {
        this.phase = 'failed'
        this.group.visible = false
        const callback = this.onCrashComplete
        this.onCrashComplete = null
        callback?.()
      }
    }

    if (this.pieces.visible) {
      for (let index = 0; index < this.pieceState.length; index += 1) {
        const piece = this.pieceState[index]
        piece.velocity.z -= 7.8 * delta
        piece.velocity.multiplyScalar(Math.max(0, 1 - delta * 0.14))
        piece.position.addScaledVector(piece.velocity, delta)
        if (piece.position.z < 0.12) {
          piece.position.z = 0.12
          piece.velocity.z *= -0.26
          piece.velocity.x *= 0.78
          piece.velocity.y *= 0.78
        }
        piece.rotation.x += piece.spin.x * delta
        piece.rotation.y += piece.spin.y * delta
        piece.rotation.z += piece.spin.z * delta
        this.dummy.position.copy(piece.position)
        this.dummy.rotation.copy(piece.rotation)
        this.dummy.scale.setScalar(0.75 + (index % 4) * 0.18)
        this.dummy.updateMatrix()
        this.pieces.setMatrixAt(index, this.dummy.matrix)
      }
      this.pieces.instanceMatrix.needsUpdate = true
    }

    if (this.phase === 'rescue') {
      this.rescueTime += delta
      const lift = clamp01(this.rescueTime / 2.2)
      this.captiveGroup.position.z = Math.sin(lift * Math.PI) * 1.35 + lift * 0.35
      this.captiveGroup.rotation.x = -lift * Math.PI * 0.5
      this.captiveGroup.rotation.z = Math.sin(lift * Math.PI * 2) * 0.08
    }
  }

  applyCinematicCamera(camera, target, delta) {
    const trainX = this.group.visible ? this.group.position.x : this.exitX
    this.cameraPosition.set(Math.min(trainX + 12.5, this.captivePosition.x + 14), this.trackY - 3.0, 4.35)
    this.cameraTarget.set(trainX + 3.0, this.trackY, 2.12)
    const follow = 1 - Math.exp(-delta * 8.5)
    camera.position.lerp(this.cameraPosition, follow)
    target.lerp(this.cameraTarget, follow)
    camera.lookAt(target)
    camera.fov = THREE.MathUtils.lerp(camera.fov, 43, follow)
    camera.updateProjectionMatrix()
  }

  getState() {
    return {
      phase: this.phase,
      timerState: this.timerState,
      progress: this.progress,
      remainingSeconds: this.remainingSeconds,
      x: this.group.position.x,
      assetLoaded: Boolean(this.assetLoaded),
      rawAssetSize: this.rawAssetSize,
      finalAssetSize: this.finalAssetSize,
      burst: this.burstTriggered
    }
  }
}
