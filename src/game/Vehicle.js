import * as THREE from 'three'
import CANNON from 'cannon'
import { createF1Model } from './F1Model.js'

const tempForward = new CANNON.Vec3()
const tempWorldUp = new CANNON.Vec3()
const tempDownforce = new CANNON.Vec3()
const localForward = new CANNON.Vec3(1, 0, 0)
const localUp = new CANNON.Vec3(0, 0, 1)

export class Vehicle {
  constructor({ scene, world, groundMaterial, onCollision }) {
    this.scene = scene
    this.world = world
    this.onCollision = onCollision
    this.speed = 0
    this.forwardSpeed = 0
    this.steering = 0
    this.boosting = false
    this.upsideDownTime = 0

    this.vehicleMaterial = new CANNON.Material('f1-vehicle')
    world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, this.vehicleMaterial, {
      friction: 0.30,
      restitution: 0,
      contactEquationStiffness: 1e7
    }))

    this.body = new CANNON.Body({
      mass: 56,
      material: this.vehicleMaterial,
      linearDamping: 0.11,
      angularDamping: 0.52
    })
    this.body.allowSleep = false
    this.body.addShape(
      new CANNON.Box(new CANNON.Vec3(1.46, 0.55, 0.22)),
      new CANNON.Vec3(-0.04, 0, 0.22)
    )
    this.body.position.set(-9, -18, 0.55)
    this.body.gameType = 'player'

    this.raycast = new CANNON.RaycastVehicle({
      chassisBody: this.body,
      indexForwardAxis: 0,
      indexRightAxis: 1,
      indexUpAxis: 2
    })

    const wheel = {
      radius: 0.355,
      directionLocal: new CANNON.Vec3(0, 0, -1),
      axleLocal: new CANNON.Vec3(0, 1, 0),
      suspensionStiffness: 42,
      suspensionRestLength: 0.20,
      frictionSlip: 9.5,
      dampingRelaxation: 3.6,
      dampingCompression: 2.6,
      maxSuspensionForce: 6000,
      rollInfluence: 0.015,
      maxSuspensionTravel: 0.16,
      customSlidingRotationalSpeed: -28,
      useCustomSlidingRotationalSpeed: true
    }

    const positions = [
      [1.06, 0.76, 0.06],
      [1.06, -0.76, 0.06],
      [-1.03, 0.76, 0.06],
      [-1.03, -0.76, 0.06]
    ]

    for (let i = 0; i < positions.length; i += 1) {
      wheel.chassisConnectionPointLocal = new CANNON.Vec3(...positions[i])
      wheel.isFrontWheel = i < 2
      this.raycast.addWheel(wheel)
    }
    this.raycast.addToWorld(world)

    const model = createF1Model()
    this.model = model.root
    this.wheelMeshes = model.wheels
    this.brakeLight = model.brakeLight
    scene.add(this.model, ...this.wheelMeshes)

    this.body.addEventListener('collide', (event) => {
      if (event.body?.gameType === 'ground') return
      const impact = Math.abs(event.contact?.getImpactVelocityAlongNormal?.() ?? 0)
      if (impact > 0.7) this.onCollision?.(impact, event.body?.gameType ?? 'object')
    })

    this.syncVisuals()
  }

  updateControls(input, delta) {
    this.body.vectorToWorldFrame(localForward, tempForward)
    this.forwardSpeed = this.body.velocity.dot(tempForward)
    this.speed = this.body.velocity.length()

    const speedRatio = Math.min(Math.abs(this.forwardSpeed) / 24, 1)
    const steerLimit = THREE.MathUtils.lerp(0.48, 0.27, speedRatio)
    const targetSteer = (input.left ? -1 : 0) + (input.right ? 1 : 0)
    const desiredSteer = targetSteer * steerLimit
    const steerStep = delta * (targetSteer === 0 ? 3.7 : 2.45)
    this.steering += THREE.MathUtils.clamp(desiredSteer - this.steering, -steerStep, steerStep)
    this.raycast.setSteeringValue(-this.steering, 0)
    this.raycast.setSteeringValue(-this.steering, 1)

    const maxForward = input.boost ? 29 : 22
    const forwardForce = input.boost ? 820 : 540
    let engine = 0

    if (input.forward && (this.forwardSpeed < maxForward || this.forwardSpeed < 0)) {
      engine = -forwardForce
    } else if (input.backward && (this.forwardSpeed > -9 || this.forwardSpeed > 0)) {
      engine = this.forwardSpeed > 1.4 ? 0 : 310
    }

    this.raycast.applyEngineForce(engine, 2)
    this.raycast.applyEngineForce(engine, 3)
    this.boosting = Boolean(input.forward && input.boost && engine)

    const braking = input.brake || (input.backward && this.forwardSpeed > 1.4)
    const brakeForce = braking ? 18 : 0
    for (let i = 0; i < 4; i += 1) this.raycast.setBrake(brakeForce, i)
    this.brakeLight.material.emissiveIntensity = braking ? 2.4 : 0.15

    const downforce = Math.min(this.speed * this.speed * 0.30, 110)
    tempDownforce.set(0, 0, -downforce)
    this.body.applyForce(tempDownforce, this.body.position)

    // Gentle coast drag keeps the original's precise stop/start character.
    if (!input.forward && !input.backward && !input.brake && Math.abs(this.forwardSpeed) > 0.08) {
      const drag = tempForward.scale(-this.forwardSpeed * 0.32)
      this.body.applyImpulse(drag, this.body.position)
    }

    this.body.vectorToWorldFrame(localUp, tempWorldUp)
    if (tempWorldUp.z < 0.28 && this.speed < 3.5) this.upsideDownTime += delta
    else this.upsideDownTime = 0

    if (this.upsideDownTime > 2.2 || this.body.position.z < -4) this.reset()
  }

  syncVisuals() {
    this.model.position.copy(this.body.position)
    this.model.quaternion.copy(this.body.quaternion)

    for (let i = 0; i < this.raycast.wheelInfos.length; i += 1) {
      this.raycast.updateWheelTransform(i)
      const transform = this.raycast.wheelInfos[i].worldTransform
      const visual = this.wheelMeshes[i]
      visual.position.copy(transform.position)
      visual.quaternion.copy(transform.quaternion)
      if (i === 1 || i === 3) visual.rotateZ(Math.PI)
    }
  }

  reset(position = { x: -9, y: -18, z: 0.55 }, yaw = 0) {
    this.body.position.set(position.x, position.y, position.z)
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), yaw)
    this.body.velocity.setZero()
    this.body.angularVelocity.setZero()
    this.body.force.setZero()
    this.body.torque.setZero()
    this.body.wakeUp()
    this.forwardSpeed = 0
    this.speed = 0
    this.boosting = false
    this.steering = 0
    this.upsideDownTime = 0
    for (let i = 0; i < 4; i += 1) {
      this.raycast.applyEngineForce(0, i)
      this.raycast.setBrake(0, i)
    }
    this.raycast.setSteeringValue(0, 0)
    this.raycast.setSteeringValue(0, 1)
  }

  get position() {
    return this.body.position
  }

  get quaternion() {
    return this.body.quaternion
  }
}
