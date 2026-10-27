import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/*
 * The lofted body construction is adapted from the MIT-licensed procedural
 * F1 geometry in AirsupHQ/airsup-lab (commit e21864b). The racing silhouette,
 * dimensions, materials and low-detail topology here are original to this game.
 */

const up = new THREE.Vector3(0, 1, 0)

function loftGeometry(sections, sides = 10) {
  const positions = []
  const indices = []

  for (const section of sections) {
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      const power = 2 / (section.roundness ?? 2.6)
      const y = Math.sign(c) * Math.pow(Math.abs(c), power) * section.width
      const z = Math.sign(s) * Math.pow(Math.abs(s), power) * section.height + section.z
      positions.push(section.x, y, z)
    }
  }

  for (let section = 0; section < sections.length - 1; section += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides
      const a = section * sides + side
      const b = section * sides + next
      const c = (section + 1) * sides + side
      const d = (section + 1) * sides + next
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addMesh(parent, geometry, material, position, rotation) {
  const mesh = new THREE.Mesh(geometry, material)
  if (position) mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function beam(parent, start, end, radius, material) {
  const a = new THREE.Vector3(...start)
  const b = new THREE.Vector3(...end)
  const direction = b.clone().sub(a)
  const mesh = addMesh(parent, new THREE.CylinderGeometry(radius, radius, direction.length(), 6), material)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(up, direction.normalize())
  return mesh
}

function makeWheel(materials, side) {
  const wheel = new THREE.Group()
  const tyre = addMesh(wheel, new THREE.CylinderGeometry(0.355, 0.355, 0.27, 16, 1), materials.tyre)
  const rim = addMesh(wheel, new THREE.CylinderGeometry(0.205, 0.205, 0.285, 12, 1), materials.rim)
  const hub = addMesh(wheel, new THREE.CylinderGeometry(0.07, 0.07, 0.31, 10, 1), materials.accent)
  rim.name = 'wheel-rim'
  hub.name = 'wheel-hub'

  const ring = addMesh(wheel, new THREE.TorusGeometry(0.296, 0.014, 5, 20), materials.stripe)
  ring.rotation.x = Math.PI * 0.5
  ring.position.y = side * 0.146

  wheel.userData.tyre = tyre
  wheel.userData.side = side
  return wheel
}

function mergeChassisMeshes(root) {
  root.updateMatrixWorld(true)
  const groups = new Map()
  const candidates = root.children.filter((child) => child.isMesh && !child.userData.keepSeparate)

  for (const mesh of candidates) {
    mesh.updateMatrix()
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix)
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute)
    }
    if (!groups.has(mesh.material)) groups.set(mesh.material, [])
    groups.get(mesh.material).push(geometry)
    root.remove(mesh)
  }

  for (const [material, geometries] of groups) {
    const geometry = mergeGeometries(geometries, false)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    for (const source of geometries) source.dispose()
  }
}

export function createF1Model() {
  const root = new THREE.Group()
  root.name = 'salman-wajeha-f1'

  const materials = {
    paint: new THREE.MeshStandardMaterial({ color: 0x087f91, roughness: 0.42, metalness: 0.08, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: 0xff963f, roughness: 0.5, metalness: 0.04, flatShading: true }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x17292d, roughness: 0.72, metalness: 0.08, flatShading: true }),
    cockpit: new THREE.MeshStandardMaterial({ color: 0x07181c, roughness: 0.32, metalness: 0.18 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: 0.94, metalness: 0, flatShading: true }),
    rim: new THREE.MeshStandardMaterial({ color: 0x334249, roughness: 0.48, metalness: 0.66, flatShading: true }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xff5c56, roughness: 0.55, emissive: 0x44100c, emissiveIntensity: 0.12 }),
    helmet: new THREE.MeshStandardMaterial({ color: 0xffe3a3, roughness: 0.38, metalness: 0.05, flatShading: true }),
    visor: new THREE.MeshStandardMaterial({ color: 0x13242b, roughness: 0.12, metalness: 0.72 })
  }

  const floor = addMesh(root, new THREE.BoxGeometry(3.45, 1.35, 0.07), materials.carbon, [-0.12, 0, -0.15])
  floor.geometry.translate(0, 0, 0)

  addMesh(root, loftGeometry([
    { x: 2.22, z: 0.04, width: 0.055, height: 0.055 },
    { x: 1.82, z: 0.10, width: 0.13, height: 0.10 },
    { x: 1.22, z: 0.18, width: 0.22, height: 0.16 },
    { x: 0.62, z: 0.27, width: 0.33, height: 0.25 },
    { x: 0.02, z: 0.30, width: 0.37, height: 0.28 },
    { x: -0.62, z: 0.31, width: 0.33, height: 0.29 },
    { x: -1.22, z: 0.30, width: 0.24, height: 0.26 },
    { x: -1.63, z: 0.28, width: 0.11, height: 0.20 }
  ]), materials.paint)

  for (const side of [-1, 1]) {
    const pod = addMesh(root, loftGeometry([
      { x: 0.58, z: 0.07, width: 0.06, height: 0.10 },
      { x: 0.28, z: 0.10, width: 0.22, height: 0.16 },
      { x: -0.34, z: 0.11, width: 0.27, height: 0.18 },
      { x: -0.96, z: 0.12, width: 0.18, height: 0.15 },
      { x: -1.35, z: 0.13, width: 0.07, height: 0.10 }
    ], 8), materials.paint)
    pod.scale.y = 0.78
    pod.position.y = side * 0.49

    addMesh(root, new THREE.BoxGeometry(1.34, 0.065, 0.055), materials.accent, [-0.36, side * 0.70, 0.15], [0, 0, -0.045 * side])
  }

  // Front wing: broad, layered and intentionally angular like the supplied reference.
  addMesh(root, new THREE.BoxGeometry(0.34, 2.02, 0.065), materials.paint, [2.12, 0, -0.13])
  addMesh(root, new THREE.BoxGeometry(0.26, 1.58, 0.052), materials.accent, [2.00, 0, -0.03], [0, 0.12, 0])
  for (const side of [-1, 1]) {
    addMesh(root, new THREE.BoxGeometry(0.48, 0.07, 0.22), materials.paint, [2.08, side * 0.99, -0.02], [0, 0, side * 0.05])
    addMesh(root, new THREE.BoxGeometry(0.32, 0.55, 0.045), materials.accent, [2.02, side * 0.58, 0.03], [0, side * -0.08, side * 0.02])
  }

  // Rear wing and supports.
  addMesh(root, new THREE.BoxGeometry(0.25, 1.38, 0.16), materials.accent, [-1.62, 0, 0.82], [0, -0.08, 0])
  addMesh(root, new THREE.BoxGeometry(0.38, 1.45, 0.07), materials.carbon, [-1.55, 0, 0.56], [0, 0.12, 0])
  for (const side of [-1, 1]) {
    addMesh(root, new THREE.BoxGeometry(0.50, 0.055, 0.72), materials.paint, [-1.60, side * 0.70, 0.50])
    beam(root, [-1.25, side * 0.25, 0.18], [-1.56, side * 0.50, 0.72], 0.025, materials.carbon)
  }

  // Suspension wishbones, deliberately low-segment geometry.
  const wheelPoints = [[1.08, 0.78, 0], [1.08, -0.78, 0], [-1.05, 0.78, 0], [-1.05, -0.78, 0]]
  for (const [x, y] of wheelPoints) {
    const side = Math.sign(y)
    beam(root, [x + (x > 0 ? -0.18 : 0.18), side * 0.28, 0.08], [x, y, -0.02], 0.024, materials.carbon)
    beam(root, [x + (x > 0 ? 0.16 : -0.16), side * 0.31, 0.26], [x, y, 0.06], 0.021, materials.carbon)
  }

  // Driver, air intake and halo.
  addMesh(root, new THREE.SphereGeometry(0.175, 12, 8), materials.helmet, [-0.16, 0, 0.60])
  const visor = addMesh(root, new THREE.SphereGeometry(0.18, 12, 6, -1.1, 2.2, 0.45, 0.8), materials.visor, [-0.11, 0, 0.61])
  visor.rotation.y = Math.PI * 0.5
  addMesh(root, new THREE.BoxGeometry(0.42, 0.16, 0.26), materials.paint, [-0.70, 0, 0.59], [0, -0.10, 0])
  beam(root, [0.30, 0, 0.43], [0.16, 0, 0.75], 0.025, materials.carbon)
  for (const side of [-1, 1]) {
    beam(root, [0.16, 0, 0.75], [-0.36, side * 0.30, 0.70], 0.026, materials.carbon)
    beam(root, [-0.36, side * 0.30, 0.70], [-0.50, side * 0.26, 0.42], 0.026, materials.carbon)
  }

  const brakeLight = addMesh(root, new THREE.BoxGeometry(0.045, 0.19, 0.08), materials.stripe, [-1.79, 0, 0.21])
  brakeLight.material = materials.stripe.clone()
  brakeLight.userData.keepSeparate = true

  mergeChassisMeshes(root)

  const wheels = [makeWheel(materials, 1), makeWheel(materials, -1), makeWheel(materials, 1), makeWheel(materials, -1)]
  for (const wheel of wheels) wheel.castShadow = true

  return { root, wheels, brakeLight, materials }
}
