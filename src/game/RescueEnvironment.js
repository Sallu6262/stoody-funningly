import * as THREE from 'three'
import CANNON from 'cannon'
import { RESCUE_CONFIG } from './rescueConfig.js'
import { TrainController } from './TrainController.js'

const dummy = new THREE.Object3D()

function faceTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  context.fillStyle = '#f2b995'
  context.fillRect(0, 0, 256, 256)
  context.fillStyle = '#173a3f'
  context.beginPath()
  context.arc(82, 105, 13, 0, Math.PI * 2)
  context.arc(174, 105, 13, 0, Math.PI * 2)
  context.fill()
  context.lineWidth = 9
  context.lineCap = 'round'
  context.beginPath()
  context.arc(128, 146, 43, 0.18, Math.PI - 0.18)
  context.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function numberTexture(number) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffd466'
  context.beginPath()
  context.arc(64, 64, 60, 0, Math.PI * 2)
  context.fill()
  context.lineWidth = 8
  context.strokeStyle = '#fff4d1'
  context.stroke()
  context.fillStyle = '#173a3f'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = '900 78px system-ui, sans-serif'
  context.fillText(String(number), 64, 68)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class RescueEnvironment {
  constructor({ scene, physics, groundMaterial, materials, addStaticBox, addLabel }) {
    this.scene = scene
    this.physics = physics
    this.groundMaterial = groundMaterial
    this.materials = materials
    this.addStaticBox = addStaticBox
    this.addLabel = addLabel
    this.locks = []
    this.consoleLights = []
    this.unlocked = Array.from({ length: RESCUE_CONFIG.lockCount }, () => false)
    this.captivePosition = Object.freeze({ x: 4.5, y: 9 })
    this.beacons = []
    this.locations = [
      { id: 1, name: 'Signal Point', x: -31.5, y: -13, approach: { x: -24.5, y: -13, yaw: Math.PI } },
      { id: 2, name: 'Water Tower', x: 4, y: 33, approach: { x: 4, y: 26, yaw: Math.PI / 2 } },
      { id: 3, name: 'Depot Yard', x: 32, y: -5, approach: { x: 25, y: -5, yaw: 0 } }
    ]

    this.railMaterial = new THREE.MeshStandardMaterial({ color: 0x4b585c, metalness: 0.58, roughness: 0.36, flatShading: true })
    this.sleeperMaterial = new THREE.MeshStandardMaterial({ color: 0x715442, roughness: 0.95, flatShading: true })
    this.ballastMaterial = new THREE.MeshStandardMaterial({ color: 0x8f9b91, roughness: 1, flatShading: true })
    this.rockMaterial = new THREE.MeshStandardMaterial({ color: 0x203b3d, roughness: 1, flatShading: true })
    this.skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf2b995, roughness: 0.82, flatShading: true })

    this.buildAccessRoads()
    this.buildTracks()
    this.buildTunnel()
    this.buildCaptive()
    this.train = new TrainController({
      scene: this.scene,
      captiveGroup: this.captiveGroup,
      captivePosition: this.captivePosition
    })
    this.buildPuzzleSites()
  }

  mesh(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], parent = this.scene) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.rotation.set(...rotation)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  addCollider(size, position, type = 'railway') {
    const body = new CANNON.Body({ mass: 0, material: this.groundMaterial })
    body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)))
    body.position.set(...position)
    body.gameType = type
    this.physics.addBody(body)
    return body
  }

  buildAccessRoads() {
    const roads = [
      { size: [11, 6.8, 0.07], position: [-28, -13, 0.045], stripe: [-28, -13, 0.09], stripeSize: [7.2, 0.12, 0.02] },
      { size: [6.8, 11, 0.07], position: [4, 29.5, 0.045], stripe: [4, 29.5, 0.09], stripeSize: [0.12, 7.2, 0.02] },
      { size: [11, 6.8, 0.07], position: [28.5, -5, 0.045], stripe: [28.5, -5, 0.09], stripeSize: [7.2, 0.12, 0.02] }
    ]
    for (const road of roads) {
      const surface = this.mesh(new THREE.BoxGeometry(...road.size), this.materials.road, road.position)
      surface.castShadow = false
      this.mesh(new THREE.BoxGeometry(...road.stripeSize), this.materials.cream, road.stripe)
    }
  }

  buildTracks() {
    const ballast = this.mesh(new THREE.BoxGeometry(74, 2.85, 0.08), this.ballastMaterial, [1, 9, 0.025])
    ballast.receiveShadow = true
    ballast.castShadow = false

    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 2.52, 0.14), this.sleeperMaterial, 72)
    sleepers.castShadow = true
    sleepers.receiveShadow = true
    for (let i = 0; i < 72; i += 1) {
      dummy.position.set(-34 + i, 9, 0.12)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      sleepers.setMatrixAt(i, dummy.matrix)
    }
    sleepers.instanceMatrix.needsUpdate = true
    this.scene.add(sleepers)

    for (const railY of [8.27, 9.73]) {
      this.mesh(new THREE.BoxGeometry(74, 0.13, 0.16), this.railMaterial, [1, railY, 0.245])
      this.addCollider([74, 0.14, 0.16], [1, railY, 0.245], 'rail')
    }

    for (const crossingX of [-26, 26]) {
      for (let i = -3; i <= 3; i += 1) {
        this.mesh(new THREE.BoxGeometry(0.72, 2.12, 0.09), this.materials.cream, [crossingX + i * 0.78, 9, 0.23])
      }
    }
  }

  buildTunnel() {
    // Dark portal planes make both tunnel mouths read as deep without extra geometry.
    this.mesh(new THREE.BoxGeometry(0.45, 4.3, 3.8), new THREE.MeshBasicMaterial({ color: 0x071416 }), [-34.1, 9, 1.9])
    this.addCollider([0.45, 4.3, 3.8], [-34.1, 9, 1.9], 'tunnel')

    this.addStaticBox([6.4, 1.35, 4.7], [-31.0, 6.65, 2.35], this.rockMaterial, { type: 'tunnel' })
    this.addStaticBox([6.4, 1.35, 4.7], [-31.0, 11.35, 2.35], this.rockMaterial, { type: 'tunnel' })
    this.addStaticBox([6.4, 6.0, 1.25], [-31.0, 9, 4.35], this.rockMaterial, { type: 'tunnel' })
    this.addStaticBox([0.75, 1.55, 4.45], [-27.65, 6.55, 2.23], this.materials.ink, { type: 'tunnel' })
    this.addStaticBox([0.75, 1.55, 4.45], [-27.65, 11.45, 2.23], this.materials.ink, { type: 'tunnel' })
    this.addStaticBox([0.78, 6.45, 0.85], [-27.65, 9, 4.15], this.materials.orange, { type: 'tunnel' })
    this.addLabel('Rail Tunnel', 'Train route • sealed', [-26.4, 14.1, 2.85], [4.25, 1.45], ['#102e34', '#ffb05f'])

    this.mesh(new THREE.BoxGeometry(0.45, 4.3, 3.8), new THREE.MeshBasicMaterial({ color: 0x071416 }), [37.1, 9, 1.9])
    this.addCollider([0.45, 4.3, 3.8], [37.1, 9, 1.9], 'tunnel')
    this.addStaticBox([6.4, 1.35, 4.7], [34.0, 6.65, 2.35], this.rockMaterial, { type: 'tunnel' })
    this.addStaticBox([6.4, 1.35, 4.7], [34.0, 11.35, 2.35], this.rockMaterial, { type: 'tunnel' })
    this.addStaticBox([6.4, 6.0, 1.25], [34.0, 9, 4.35], this.rockMaterial, { type: 'tunnel' })
    this.addStaticBox([0.75, 1.55, 4.45], [30.65, 6.55, 2.23], this.materials.ink, { type: 'tunnel' })
    this.addStaticBox([0.75, 1.55, 4.45], [30.65, 11.45, 2.23], this.materials.ink, { type: 'tunnel' })
    this.addStaticBox([0.78, 6.45, 0.85], [30.65, 9, 4.15], this.materials.teal, { type: 'tunnel' })
    this.addLabel('East Tunnel', 'Emergency exit route', [29.5, 14.0, 2.8], [4.15, 1.4], ['#102e34', '#70d6c9'])
  }

  buildCaptive() {
    const group = new THREE.Group()
    group.position.set(this.captivePosition.x, this.captivePosition.y, 0)
    this.scene.add(group)
    this.captiveGroup = group

    this.mesh(new THREE.BoxGeometry(1.05, 0.62, 0.30), this.materials.pink, [0, 0, 0.43], [0, 0, 0], group)
    this.mesh(new THREE.SphereGeometry(0.34, 12, 8), this.skinMaterial, [0.77, 0, 0.48], [0, 0, 0], group)

    const limbGeometry = new THREE.CylinderGeometry(0.10, 0.12, 1.14, 7)
    this.mesh(limbGeometry, this.skinMaterial, [0.05, -0.62, 0.40], [0, 0, 0], group)
    this.mesh(limbGeometry, this.skinMaterial, [0.05, 0.62, 0.40], [0, 0, 0], group)
    this.mesh(limbGeometry, this.materials.ink, [-0.83, -0.18, 0.38], [0, 0, Math.PI / 2], group)
    this.mesh(limbGeometry, this.materials.ink, [-0.83, 0.18, 0.38], [0, 0, Math.PI / 2], group)

    const face = this.mesh(new THREE.CircleGeometry(0.235, 24), new THREE.MeshBasicMaterial({ map: faceTexture() }), [0.77, 0, 0.755], [0, 0, 0], group)
    face.castShadow = false

    const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xefe0b5, roughness: 1 })
    for (const y of [-0.72, 0.72]) this.mesh(new THREE.TorusGeometry(0.15, 0.045, 6, 14), ropeMaterial, [0.05, y, 0.52], [Math.PI / 2, 0, 0], group)
    this.mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 16), ropeMaterial, [-1.02, 0, 0.51], [0, Math.PI / 2, 0], group)

    const lockPositions = [[0.05, -0.78, 0.73], [0.05, 0.78, 0.73], [-1.08, 0, 0.72]]
    lockPositions.forEach((position, index) => this.buildLock(group, position, index))

    this.addStaticBox([1.25, 0.85, 0.95], [7.8, 12.0, 0.48], this.materials.ink, { type: 'console' })
    for (let i = 0; i < 3; i += 1) {
      const lightMaterial = this.materials.orange.clone()
      this.mesh(new THREE.SphereGeometry(0.11, 8, 6), lightMaterial, [7.45 + i * 0.35, 11.55, 0.92])
      this.consoleLights.push(lightMaterial)
    }
    this.addLabel('Lock Console', 'Stop nearby • press E', [7.8, 12.0, 2.0], [3.8, 1.3], ['#173a3f', '#ffc857'])
  }

  buildLock(parent, position, index) {
    const lock = new THREE.Group()
    lock.position.set(...position)
    const material = new THREE.MeshStandardMaterial({ color: 0xffc857, metalness: 0.45, roughness: 0.32, flatShading: true })
    const shackle = this.mesh(new THREE.TorusGeometry(0.16, 0.042, 6, 14, Math.PI), material, [0, 0, 0.13], [0, 0, 0], lock)
    this.mesh(new THREE.BoxGeometry(0.38, 0.13, 0.30), material, [0, 0, -0.04], [0, 0, 0], lock)
    const number = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTexture(index + 1), transparent: true, depthTest: true }))
    number.position.set(0, 0, 0.34)
    number.scale.set(0.44, 0.44, 1)
    lock.add(number)
    lock.userData = { material, shackle, index }
    parent.add(lock)
    this.locks.push(lock)
  }

  buildPuzzleSites() {
    this.buildSitePad(this.locations[0], this.materials.orange)
    this.buildSignalPoint(this.locations[0])
    this.buildSitePad(this.locations[1], this.materials.pink)
    this.buildWaterTower(this.locations[1])
    this.buildSitePad(this.locations[2], this.materials.teal)
    this.buildDepot(this.locations[2])
  }

  buildSitePad(location, material) {
    const disc = this.mesh(new THREE.CylinderGeometry(2.35, 2.35, 0.10, 24), material, [location.x, location.y, 0.07], [Math.PI / 2, 0, 0])
    disc.receiveShadow = true
    const ring = this.mesh(new THREE.RingGeometry(1.72, 2.05, 28), this.materials.cream, [location.x, location.y, 0.145])
    ring.castShadow = false
    const beacon = this.mesh(new THREE.TorusGeometry(0.38, 0.075, 6, 18), material, [location.x, location.y, 2.8], [Math.PI / 2, 0, 0])
    this.beacons.push(beacon)
    this.addLabel(`Site 0${location.id}`, location.name, [location.x, location.y - 3.0, 2.0], [3.6, 1.26], ['#173a3f', location.id === 1 ? '#ff9958' : location.id === 2 ? '#e67f7c' : '#70d6c9'])
  }

  buildSignalPoint({ x, y }) {
    this.addStaticBox([0.55, 0.55, 4.8], [x, y, 2.4], this.materials.ink, { type: 'landmark' })
    this.addStaticBox([0.25, 2.5, 0.30], [x, y, 4.25], this.materials.orange, { type: 'landmark' })
    this.mesh(new THREE.SphereGeometry(0.28, 10, 7), this.materials.orange, [x, y - 1.17, 4.25])
    this.mesh(new THREE.SphereGeometry(0.28, 10, 7), this.materials.teal, [x, y + 1.17, 4.25])
  }

  buildWaterTower({ x, y }) {
    for (const dx of [-0.72, 0.72]) {
      for (const dy of [-0.72, 0.72]) this.addStaticBox([0.22, 0.22, 2.7], [x + dx, y + dy, 1.42], this.materials.ink, { type: 'landmark' })
    }
    this.mesh(new THREE.CylinderGeometry(1.25, 1.08, 1.65, 12), this.materials.teal, [x, y, 3.38], [Math.PI / 2, 0, 0])
    this.mesh(new THREE.ConeGeometry(1.42, 0.65, 12), this.materials.pink, [x, y, 4.52], [Math.PI / 2, 0, 0])
    this.addCollider([2.4, 2.4, 1.7], [x, y, 3.38], 'landmark')
  }

  buildDepot({ x, y }) {
    this.addStaticBox([0.75, 0.62, 3.8], [x, y - 1.75, 1.9], this.materials.ink, { type: 'landmark' })
    this.addStaticBox([0.75, 0.62, 3.8], [x, y + 1.75, 1.9], this.materials.ink, { type: 'landmark' })
    this.addStaticBox([0.8, 4.15, 0.48], [x, y, 3.62], this.materials.orange, { type: 'landmark' })
    this.mesh(new THREE.ConeGeometry(0.62, 1.2, 4), this.materials.cream, [x, y, 4.45], [Math.PI / 2, 0, Math.PI / 4])
  }

  unlock(index) {
    if (index < 0 || index >= this.unlocked.length) return { ok: false, reason: 'invalid-lock' }
    if (this.unlocked[index]) return { ok: true, alreadyUnlocked: true }
    this.unlocked[index] = true
    const lock = this.locks[index]
    lock.userData.material.color.setHex(0x59c994)
    lock.userData.material.metalness = 0.15
    lock.userData.shackle.rotation.z = -0.55
    lock.position.z += 0.08
    this.consoleLights[index].color.setHex(0x59c994)
    return { ok: true, alreadyUnlocked: false }
  }

  update(elapsed, delta) {
    for (let i = 0; i < this.beacons.length; i += 1) {
      this.beacons[i].rotation.z += delta * (0.75 + i * 0.18)
      this.beacons[i].position.z = 2.8 + Math.sin(elapsed * 1.4 + i) * 0.10
    }
    this.train.update(delta)
  }

  getState() {
    return {
      tunnel: { x: -28, y: 9, secondX: 31, sealed: true, trainVisible: this.train.group.visible },
      captive: { ...this.captivePosition, lockCount: 3, unlocked: [...this.unlocked], placeholderFace: true },
      locations: this.locations.map((location) => ({ ...location })),
      train: this.train.getState()
    }
  }
}
