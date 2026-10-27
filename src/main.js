import './style.css'
import { Game } from './game/Game.js'

const canvas = document.querySelector('#game-canvas')
const game = new Game(canvas)

window.__SW_RACING__ = game.debugApi

document.querySelector('#start-button').addEventListener('click', () => {
  document.querySelector('#intro').classList.add('is-hidden')
  game.start()
})

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('reduced-motion')
}
