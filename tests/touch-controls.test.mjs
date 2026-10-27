import test from 'node:test'
import assert from 'node:assert/strict'
import { getJoystickInput } from '../src/game/TouchControls.js'

test('joystick dead zone produces no engine input; throttle rises cubically', () => {
  assert.equal(getJoystickInput(0, 0, 0).throttle, 0)
  assert.equal(getJoystickInput(0, 0, 0.5).throttle, 0.125)
  assert.equal(getJoystickInput(0, 0, 1).throttle, 1)
  assert.equal(getJoystickInput(0, 0, 2).throttle, 1)
})

test('car-relative joystick steering wraps smoothly across the angle seam', () => {
  const left = getJoystickInput(Math.PI - 0.1, -Math.PI + 0.1, 1)
  assert.equal(left.forward, true)
  assert.ok(left.steer < 0 && left.steer > -1)
  assert.ok(Math.abs(left.angle - 0.2) < 1e-10)
})

test('the 270-degree forward sector changes to reverse behind the car', () => {
  assert.equal(getJoystickInput(0, Math.PI * 0.74, 1).forward, true)
  const reverse = getJoystickInput(0, Math.PI, 1)
  assert.equal(reverse.backward, true)
  assert.equal(reverse.throttle, -1)
  assert.ok(Math.abs(reverse.steer) < 1e-10)
})

test('reverse steering is inverted and steering saturates without changing throttle', () => {
  const reverseLeft = getJoystickInput(0, Math.PI - 0.2, 0.8)
  assert.ok(reverseLeft.steer < 0)
  assert.ok(Math.abs(reverseLeft.throttle + 0.512) < 1e-10)
  assert.equal(getJoystickInput(0, Math.PI / 2, 0.5).steer, -1)
})
