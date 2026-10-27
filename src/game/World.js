import * as THREE from 'three'
import CANNON from 'cannon'
import { RescueEnvironment } from './RescueEnvironment.js'

const tempObject = new THREE.Object3D()

function canvasLabel(title, subtitle, colors = ['#123b40', '#ff9b58']) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 384
  const context = canvas.getContext('2d')
  context.fillStyle = colors[0]
  context.beginPath()
  context.roundRect(14, 14, 996, 356, 48)
  context.fill()
  context.lineWidth = 10
  context.strokeStyle = '#f8f1d7'
  context.stroke()

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = colors[1]
  context.font = '900 104px system-ui, sans-serif'
  context.fillText(title.toUpperCase(), 512, 170)
  context.fillStyle = '#f8f1d7'
  context.font = '700 34px system-ui, sans-serif'
  context.letterSpacing = '8px'
  context.fillText(subtitle.toUpperCase(), 512, 264)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function roadRibbon(points, width) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0.035)), true, 'centripetal')
  const count = 240
  const positions = []
  const uvs = []
  const indices = []

  for (let i = 0; i <= count; i += 1) {
    const t = i / count
    const point = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t).normalize()
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0)
    const left = point.clone().addScaledVector(normal, width * 0.5)
    const right = point.clone().addScaledVector(normal, -width * 0.5)
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
    uvs.push(0, t * 18, 1, t * 18)
    if (i < count) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return { geometry, curve }
}

export class World {
  constructor(scene, physicsWorld) {
    this.scene = scene
    this.physics = physicsWorld
    this.dynamic = []
    this.groundMaterial = new CANNON.Material('ground')
    this.palette = {
      grass: 0xa7cbb8,
      grassDark: 0x79ad9b,
      road: 0x3f5a5d,
      cream: 0xffedc5,
      orange: 0xff9958,
      teal: 0x0a7c89,
      ink: 0x173a3f,
      pink: 0xe67f7c
    }

    this.materials = {
      road: new THREE.MeshStandardMaterial({ color: this.palette.road, roughness: 0.92, metalness: 0 }),
      grass: new THREE.MeshStandardMaterial({ color: this.palette.grass, roughness: 1, metalness: 0 }),
      cream: new THREE.MeshStandardMaterial({ color: this.palette.cream, roughness: 0.8, flatShading: true }),
      orange: new THREE.MeshStandardMaterial({ color: this.palette.orange, roughness: 0.72, flatShading: true }),
      teal: new THREE.MeshStandardMaterial({ color: this.palette.teal, roughness: 0.72, flatShading: true }),
      ink: new THREE.MeshStandardMaterial({ color: this.palette.ink, roughness: 0.86, flatShading: true }),
      pink: new THREE.MeshStandardMaterial({ color: this.palette.pink, roughness: 0.76, flatShading: true }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x8a654c, roughness: 1, flatShading: true }),
      leaves: new THREE.MeshStandardMaterial({ color: 0x3e846c, roughness: 1, flatShading: true })
    }

    this.buildGround()
    this.buildRoad()
    this.buildWelcome()
    this.buildRamp()
    this.buildObstacles()
    this.buildScenery()
    this.buildBoundaries()
    this.rescue = new RescueEnvironment({
      scene: this.scene,
      physics: this.physics,
      groundMaterial: this.groundMaterial,
      materials: this.materials,
      addStaticBox: this.addStaticBox.bind(this),
      addLabel: this.addLabel.bind(this)
    })
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

  buildGround() {
    const ground = this.mesh(new THREE.PlaneGeometry(130, 130), this.materials.grass)
    ground.receiveShadow = true

    const body = new CANNON.Body({ mass: 0, material: this.groundMaterial })
    body.addShape(new CANNON.Plane())
    body.gameType = 'ground'
    this.physics.addBody(body)

    const patchMaterial = new THREE.MeshBasicMaterial({ color: this.palette.grassDark, transparent: true, opacity: 0.18, depthWrite: false })
    const patchGeometry = new THREE.CircleGeometry(1, 24)
    const patches = [[-19, 7, 7], [24, -8, 10], [3, 29, 8], [-27, -18, 11], [27, 26, 6]]
    for (const [x, y, scale] of patches) {
      const patch = this.mesh(patchGeometry, patchMaterial, [x, y, 0.012])
      patch.scale.set(scale * 1.4, scale, 1)
    }
  }

  buildRoad() {
    const { geometry, curve } = roadRibbon([
      [0, -18], [10, -17], [19, -12], [25, -4], [27, 6],
      [24, 16], [16, 24], [6, 28], [-6, 28], [-17, 23],
      [-24, 15], [-27, 5], [-25, -6], [-19, -14], [-10, -18]
    ], 9.4)
    this.roadCurve = curve
    const road = this.mesh(geometry, this.materials.road)
    road.receiveShadow = true

    const lineMaterial = new THREE.MeshBasicMaterial({ color: this.palette.cream })
    const dashGeometry = new THREE.BoxGeometry(1.5, 0.10, 0.025)
    const dashes = new THREE.InstancedMesh(dashGeometry, lineMaterial, 48)
    for (let i = 0; i < 48; i += 1) {
      const t = i / 48
      const point = curve.getPointAt(t)
      const tangent = curve.getTangentAt(t)
      tempObject.position.set(point.x, point.y, 0.075)
      tempObject.rotation.set(0, 0, Math.atan2(tangent.y, tangent.x))
      tempObject.scale.set(1, 1, 1)
      tempObject.updateMatrix()
      dashes.setMatrixAt(i, tempObject.matrix)
    }
    dashes.instanceMatrix.needsUpdate = true
    this.scene.add(dashes)

    const curbGeometry = new THREE.BoxGeometry(0.65, 0.28, 0.10)
    const creamCurbs = new THREE.InstancedMesh(curbGeometry, this.materials.cream, 28)
    const orangeCurbs = new THREE.InstancedMesh(curbGeometry, this.materials.orange, 28)
    creamCurbs.castShadow = creamCurbs.receiveShadow = true
    orangeCurbs.castShadow = orangeCurbs.receiveShadow = true
    let creamIndex = 0
    let orangeIndex = 0
    for (let i = 0; i < 56; i += 1) {
      const t = i / 56
      const point = curve.getPointAt(t)
      const tangent = curve.getTangentAt(t).normalize()
      const normal = new THREE.Vector3(-tangent.y, tangent.x, 0)
      const side = i % 2 === 0 ? 1 : -1
      point.addScaledVector(normal, side * 4.64)
      tempObject.position.set(point.x, point.y, 0.09)
      tempObject.rotation.set(0, 0, Math.atan2(tangent.y, tangent.x))
      tempObject.scale.set(1, 1, 1)
      tempObject.updateMatrix()
      if (i % 4 < 2) creamCurbs.setMatrixAt(creamIndex++, tempObject.matrix)
      else orangeCurbs.setMatrixAt(orangeIndex++, tempObject.matrix)
    }
    creamCurbs.instanceMatrix.needsUpdate = true
    orangeCurbs.instanceMatrix.needsUpdate = true
    this.scene.add(creamCurbs, orangeCurbs)

    // Starting grid and boost chevrons.
    const gridGeometry = new THREE.BoxGeometry(0.72, 0.72, 0.022)
    const creamGrid = new THREE.InstancedMesh(gridGeometry, this.materials.cream, 10)
    const inkGrid = new THREE.InstancedMesh(gridGeometry, this.materials.ink, 10)
    let creamTile = 0
    let inkTile = 0
    for (let row = 0; row < 4; row += 1) {
      for (let side = -2; side <= 2; side += 1) {
        tempObject.position.set(-6.4 + row * 0.72, -18 + side * 0.72, 0.08)
        tempObject.rotation.set(0, 0, 0)
        tempObject.scale.set(1, 1, 1)
        tempObject.updateMatrix()
        if ((row + side) % 2) creamGrid.setMatrixAt(creamTile++, tempObject.matrix)
        else inkGrid.setMatrixAt(inkTile++, tempObject.matrix)
      }
    }
    creamGrid.instanceMatrix.needsUpdate = true
    inkGrid.instanceMatrix.needsUpdate = true
    this.scene.add(creamGrid, inkGrid)
    const boostGeometry = new THREE.BoxGeometry(0.62, 2.5, 0.025)
    const boostMarks = new THREE.InstancedMesh(boostGeometry, this.materials.orange, 3)
    for (let i = 0; i < 3; i += 1) {
      tempObject.position.set(2.7 + i * 1.0, -17.9, 0.08)
      tempObject.rotation.set(0, 0, -0.18)
      tempObject.scale.set(1, 1, 1)
      tempObject.updateMatrix()
      boostMarks.setMatrixAt(i, tempObject.matrix)
    }
    boostMarks.instanceMatrix.needsUpdate = true
    this.scene.add(boostMarks)
  }

  addStaticBox(size, position, material, { yaw = 0, pitch = 0, type = 'structure' } = {}) {
    const mesh = this.mesh(new THREE.BoxGeometry(...size), material, position)
    const qYaw = new CANNON.Quaternion()
    const qPitch = new CANNON.Quaternion()
    qYaw.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), yaw)
    qPitch.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), pitch)
    const quaternion = qYaw.mult(qPitch)
    mesh.quaternion.copy(quaternion)

    const body = new CANNON.Body({ mass: 0, material: this.groundMaterial })
    body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)))
    body.position.set(...position)
    body.quaternion.copy(quaternion)
    body.gameType = type
    this.physics.addBody(body)
    return { mesh, body }
  }

  addDynamicBox(size, position, material, mass = 2, type = 'obstacle') {
    const mesh = this.mesh(new THREE.BoxGeometry(...size), material, position)
    const body = new CANNON.Body({ mass, material: this.groundMaterial, linearDamping: 0.18, angularDamping: 0.22 })
    body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)))
    body.position.set(...position)
    body.gameType = type
    body.allowSleep = true
    body.sleepSpeedLimit = 0.15
    body.sleepTimeLimit = 0.8
    this.physics.addBody(body)
    this.dynamic.push({ mesh, body })
    return { mesh, body }
  }

  addLabel(title, subtitle, position, scale = [5.8, 2.15], colors) {
    const material = new THREE.SpriteMaterial({ map: canvasLabel(title, subtitle, colors), transparent: true, depthTest: true })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(...position)
    sprite.scale.set(scale[0], scale[1], 1)
    sprite.castShadow = true
    this.scene.add(sprite)
    return sprite
  }

  buildWelcome() {
    this.addStaticBox([0.5, 0.55, 3.6], [-7.0, -23.0, 1.8], this.materials.ink)
    this.addStaticBox([0.5, 0.55, 3.6], [-7.0, -13.0, 1.8], this.materials.ink)
    this.addStaticBox([0.55, 10.5, 0.48], [-7.0, -18.0, 3.42], this.materials.orange)
    this.addLabel('Salman & Wajeha', 'Welcome to the open road', [-7.3, -18.0, 3.92], [4.8, 1.28], ['#123b40', '#ff9b58'])

    this.addStaticBox([4.8, 3.4, 0.16], [-8.8, -7.4, 0.10], this.materials.cream, { type: 'plaza' })
    this.addLabel('Salman', 'Sunset straight', [-8.7, -7.3, 1.7], [3.5, 1.25], ['#0b7481', '#ffd687'])
    this.addLabel('Wajeha', 'Garden curve', [12.0, 14.0, 1.8], [3.5, 1.25], ['#923f51', '#ffd687'])
  }

  buildRamp() {
    this.addStaticBox([5.4, 3.2, 0.34], [14.6, 0.5, 0.56], this.materials.orange, { pitch: -0.16, type: 'ramp' })
    const rampStripe = this.mesh(new THREE.BoxGeometry(0.16, 3.5, 0.05), this.materials.cream, [17.18, 0.5, 0.45])
    rampStripe.rotation.y = -0.16
    this.addLabel('SUNSET RAMP', 'Take it with a little boost', [14.0, -3.5, 1.8], [4.1, 1.42], ['#a5484e', '#ffd687'])
  }

  buildObstacles() {
    // Movable barrier just off the racing line; easy to hit while testing steering.
    for (let i = 0; i < 4; i += 1) {
      const barrier = this.addDynamicBox([0.68, 0.68, 0.68], [3.2 + i * 0.72, 1.65, 0.38], i % 2 ? this.materials.cream : this.materials.orange, 1.6, 'barrier')
      barrier.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), 0.08)
    }

    // Crate pyramid beside the ramp.
    const crates = [[10.7, 3.0, 0.48], [11.55, 3.0, 0.48], [12.4, 3.0, 0.48], [11.12, 3.0, 1.38], [11.98, 3.0, 1.38]]
    for (let i = 0; i < crates.length; i += 1) {
      const box = this.addDynamicBox([0.78, 0.78, 0.78], crates[i], i % 2 ? this.materials.teal : this.materials.pink, 2.1, 'crate')
      const braceA = this.mesh(new THREE.BoxGeometry(0.92, 0.05, 0.05), this.materials.cream, [0, 0, 0.41], [0, Math.PI / 4, 0], box.mesh)
      const braceB = braceA.clone()
      braceB.rotation.y = -Math.PI / 4
      box.mesh.add(braceB)
    }

    // The circuit itself stays clear; playful movable props remain in the infield.
  }

  buildScenery() {
    // A tiny pit shelter.
    this.addStaticBox([6.5, 3.4, 0.28], [-10, -8.0, 2.72], this.materials.ink)
    this.addStaticBox([0.34, 3.4, 2.8], [-13.1, -8.0, 1.4], this.materials.teal)
    this.addStaticBox([0.34, 3.4, 2.8], [-6.9, -8.0, 1.4], this.materials.teal)
    this.addLabel('S & W', 'Good roads, good company', [-10, -6.15, 2.28], [4.2, 1.45], ['#123b40', '#ff9b58'])

    // Instanced trees: two meshes, no per-tree draw-call cost.
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1.5, 6), this.materials.trunk, 36)
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.0, 2.5, 7), this.materials.leaves, 36)
    trunks.castShadow = crowns.castShadow = true
    trunks.receiveShadow = crowns.receiveShadow = true
    const treePositions = []
    const treeClearings = [[-31.5, -13, 5.2], [4, 33, 5.2], [32, -5, 5.2], [-31, 9, 6.2]]
    for (let i = 0; i < 36; i += 1) {
      let angle = (i / 36) * Math.PI * 2 + (i % 4) * 0.12
      const radius = 34.0 + (i % 3) * 0.8
      let x = Math.cos(angle) * radius
      let y = Math.sin(angle) * radius
      while (treeClearings.some(([cx, cy, clearance]) => Math.hypot(x - cx, y - cy) < clearance)) {
        angle += 0.12
        x = Math.cos(angle) * radius
        y = Math.sin(angle) * radius
      }
      treePositions.push([x, y])
    }
    treePositions.forEach(([x, y], i) => {
      const scale = 0.82 + (i % 6) * 0.07
      tempObject.position.set(x, y, 0.75 * scale)
      tempObject.scale.set(scale, scale, scale)
      tempObject.rotation.set(Math.PI * 0.5, 0, i * 0.83)
      tempObject.updateMatrix()
      trunks.setMatrixAt(i, tempObject.matrix)

      tempObject.position.set(x, y, 2.15 * scale)
      tempObject.rotation.set(Math.PI * 0.5, 0, i * 0.83 + 0.2)
      tempObject.updateMatrix()
      crowns.setMatrixAt(i, tempObject.matrix)
    })
    trunks.instanceMatrix.needsUpdate = true
    crowns.instanceMatrix.needsUpdate = true
    this.scene.add(trunks, crowns)

    // Decorative wind spinners give the otherwise calm world some motion.
    this.spinners = []
    for (const [x, y, color] of [[0, 0, this.materials.orange], [15, 3, this.materials.pink], [-10, 12, this.materials.cream]]) {
      const post = this.mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 7), this.materials.ink, [x, y, 1.6])
      post.rotation.x = Math.PI * 0.5
      const spinner = new THREE.Group()
      spinner.position.set(x, y, 3.1)
      for (let i = 0; i < 4; i += 1) {
        const blade = this.mesh(new THREE.BoxGeometry(1.15, 0.17, 0.05), color, [0.57, 0, 0], [0, 0, i * Math.PI / 2], spinner)
        blade.castShadow = true
      }
      this.scene.add(spinner)
      this.spinners.push(spinner)
    }
  }

  buildBoundaries() {
    const invisible = new CANNON.Material('boundary')
    const walls = [
      [[1, 76, 3], [-37.5, 0, 1.5]], [[1, 76, 3], [37.5, 0, 1.5]],
      [[76, 1, 3], [0, -37.5, 1.5]], [[76, 1, 3], [0, 37.5, 1.5]]
    ]
    for (const [size, position] of walls) {
      const body = new CANNON.Body({ mass: 0, material: invisible })
      body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)))
      body.position.set(...position)
      body.gameType = 'boundary'
      this.physics.addBody(body)
    }
  }

  update(elapsed, delta) {
    for (const item of this.dynamic) {
      item.mesh.position.copy(item.body.position)
      item.mesh.quaternion.copy(item.body.quaternion)
    }
    for (let i = 0; i < this.spinners.length; i += 1) {
      this.spinners[i].rotation.y += delta * (0.8 + i * 0.25)
      this.spinners[i].rotation.z = Math.sin(elapsed * 0.45 + i) * 0.08
    }
    this.rescue.update(elapsed, delta)
  }
}
