const clamp01 = (value) => Math.max(0, Math.min(1, value))
const SOUND_FILES = {
  engine: 'engine.mp3', road: 'road.mp3',
  stone1: 'hit-stone-1.mp3', stone2: 'hit-stone-2.mp3', metal: 'hit-metal.mp3', click: 'click.mp3'
}

export class SoundManager {
  constructor() {
    this.button = document.querySelector('#sound-toggle')
    this.label = document.querySelector('#sound-label')
    this.music = document.querySelector('#background-music')
    this.video = document.querySelector('#train-video')
    this.buffers = {}
    this.loops = {}
    this.started = false
    this.muted = false
    this.videoOpen = false
    this.hidden = document.hidden
    this.lastHit = -1
    this.hitCount = 0
    this.lastSecond = 0
    this.lastTrainPhase = 'idle'
    this.lastPuzzleState = 'idle'
    this.musicPending = false
    this.musicBlocked = false
    this.failedFiles = []
    try { this.muted = localStorage.getItem('sw-racing-muted') === 'true' } catch {}
    this.button.addEventListener('click', () => this.toggleMute())
    document.addEventListener('pointerdown', (event) => {
      if (!this.started) return
      this.unlock()
      if (event.target.closest('button') && !event.target.closest('#sound-toggle')) this.playSample('click', 0.13, 0.95 + Math.random() * 0.1)
    }, { passive: true })
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden
      if (this.hidden) {
        this.music.pause()
        this.context?.suspend().catch(() => {})
      } else if (this.started) this.unlock()
    })
    this.updateButton()
  }

  start() {
    this.started = true
    this.unlock()
  }

  // Called directly within the start/touch gesture so Safari can unlock both
  // Web Audio effects and the streaming music element without autoplay hacks.
  unlock() {
    if (!this.started || this.muted || this.hidden) return
    if (!this.context) this.initialize()
    if (!this.context) return
    if (this.context.state !== 'running') this.context.resume().catch(() => {})
    this.playMusic()
  }

  initialize() {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    try {
      this.context = new AudioContext()
      const context = this.context
      this.master = context.createGain()
      this.master.gain.value = 0.8
      this.compressor = context.createDynamicsCompressor()
      this.compressor.threshold.value = -12
      this.compressor.knee.value = 16
      this.compressor.ratio.value = 5
      this.compressor.connect(this.master)
      this.master.connect(context.destination)
      this.effects = context.createGain()
      this.effects.gain.value = 0.75
      this.effects.connect(this.compressor)
      this.musicGain = context.createGain()
      this.musicGain.gain.value = 0.19
      this.musicSource = context.createMediaElementSource(this.music)
      this.musicSource.connect(this.musicGain)
      this.musicGain.connect(this.compressor)
      this.makeNoiseLoops()
      this.loading = Promise.allSettled(Object.entries(SOUND_FILES).map(async ([key, file]) => {
        try {
          const response = await fetch(`/audio/${file}`)
          if (!response.ok) throw new Error(response.status)
          this.buffers[key] = await context.decodeAudioData(await response.arrayBuffer())
          if (key === 'engine' || key === 'road') this.makeLoop(key)
        } catch {
          this.failedFiles.push(file)
        }
      }))
    } catch {
      this.context?.close().catch(() => {})
      this.context = null
    }
  }

  playMusic() {
    if (!this.context || this.muted || this.hidden || this.videoOpen || this.musicPending || !this.music.paused) return
    if (!this.music.getAttribute('src')) this.music.src = this.music.dataset.src
    this.musicPending = true
    this.music.play().then(() => {
      this.musicBlocked = false
    }).catch((error) => {
      this.musicBlocked = error.name === 'NotAllowedError'
    }).finally(() => {
      this.musicPending = false
      // Opening a video / backgrounding the page during loading must not
      // let a late play() promise restart the music behind it.
      if (this.muted || this.hidden || this.videoOpen) this.music.pause()
      this.updateButton()
    })
  }

  makeLoop(key) {
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    source.buffer = this.buffers[key]
    source.loop = true
    gain.gain.value = 0
    source.connect(gain)
    gain.connect(this.effects)
    source.start()
    this.loops[key] = { source, gain }
  }

  makeNoiseLoops() {
    const context = this.context
    this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const channel = this.noise.getChannelData(0)
    for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1
    for (const [name, frequency, type] of [['skid', 1800, 'bandpass'], ['train', 160, 'lowpass']]) {
      const source = context.createBufferSource()
      source.buffer = this.noise
      source.loop = true
      const filter = context.createBiquadFilter()
      filter.type = type
      filter.frequency.value = frequency
      filter.Q.value = 0.8
      const gain = context.createGain()
      gain.gain.value = 0
      source.connect(filter)
      filter.connect(gain)
      gain.connect(this.effects)
      source.start()
      this.loops[name] = { source, gain }
    }
  }

  setLoop(key, volume, rate = 1) {
    const loop = this.loops[key]
    if (!loop) return
    const now = this.context.currentTime
    loop.gain.gain.setTargetAtTime(volume, now, 0.1)
    loop.source.playbackRate.setTargetAtTime(rate, now, 0.12)
  }

  playSample(key, volume = 0.4, rate = 1) {
    if (!this.context || this.context.state !== 'running' || this.muted || this.hidden || this.videoOpen || !this.buffers[key]) return
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    source.buffer = this.buffers[key]
    source.playbackRate.value = rate
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(this.effects)
    source.onended = () => { source.disconnect(); gain.disconnect() }
    source.start()
  }

  collision(impact, type) {
    if (!this.context || this.context.currentTime - this.lastHit < 0.09) return
    this.lastHit = this.context.currentTime
    const material = /barrier|boundary|metal/.test(type) ? 'metal' : Math.random() > 0.5 ? 'stone1' : 'stone2'
    this.playSample(material, Math.min(0.85, 0.12 + impact * 0.065), 0.86 + Math.random() * 0.26)
    this.hitCount += 1
  }

  tone(frequency, duration = 0.15, volume = 0.1, delay = 0, endFrequency = frequency, type = 'sine') {
    if (!this.context || this.muted || this.hidden || this.videoOpen) return
    const now = this.context.currentTime + delay
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(volume, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    oscillator.connect(gain)
    gain.connect(this.effects)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
  }

  playHop() { this.tone(190, 0.22, 0.14, 0, 570, 'triangle') }

  honk() {
    this.unlock()
    this.tone(370, 0.34, 0.09, 0, 350, 'sawtooth')
    this.tone(466, 0.34, 0.07, 0, 440, 'sawtooth')
  }

  setVideoOpen(open) {
    this.videoOpen = open
    this.master?.gain.setTargetAtTime(open || this.muted || this.hidden ? 0 : 0.8, this.context.currentTime, 0.03)
    if (open) this.music.pause()
    else if (this.started) this.playMusic()
  }

  toggleMute() {
    // If an iOS autoplay prompt needs another tap, that tap enables audio.
    this.muted = this.musicBlocked ? false : !this.muted
    this.musicBlocked = false
    this.video.muted = this.muted
    this.master?.gain.setTargetAtTime(this.muted || this.hidden || this.videoOpen ? 0 : 0.8, this.context.currentTime, 0.03)
    try { localStorage.setItem('sw-racing-muted', String(this.muted)) } catch {}
    if (this.muted) this.music.pause()
    else this.unlock()
    this.updateButton()
  }

  updateButton() {
    this.button.setAttribute('aria-pressed', String(!this.muted))
    this.button.setAttribute('aria-label', this.muted ? 'Unmute music and sound effects' : 'Mute music and sound effects')
    this.button.classList.toggle('is-muted', this.muted)
    this.label.textContent = this.musicBlocked ? 'Tap for sound' : this.muted ? 'Sound off' : 'Sound on'
  }

  update(game) {
    if (!this.context) return
    const now = this.context.currentTime
    const quiet = this.muted || this.hidden || this.videoOpen
    this.master.gain.setTargetAtTime(quiet ? 0 : 0.8, now, 0.06)
    const driving = game.started && !game.isDrivingBlocked()
    const vehicle = game.vehicle
    const speed = clamp01(Math.abs(vehicle.forwardSpeed) / 24)
    const throttle = Math.abs(vehicle.throttle || 0)
    const engineVolume = driving ? 0.04 + throttle * 0.24 + speed * 0.07 : 0
    const gear = Math.floor(speed * 4)
    const rev = (speed * 4 - gear) * 0.45
    this.setLoop('engine', engineVolume, 0.65 + speed * 0.7 + rev + throttle * 0.25 + (vehicle.boosting ? 0.3 : 0))
    this.setLoop('road', driving ? speed * 0.14 : 0, 0.65 + speed * 1.1)
    const skid = vehicle.braking ? speed * 0.16 : Math.max(0, Math.abs(vehicle.steering) - 0.16) * speed * 0.25
    this.setLoop('skid', driving ? skid : 0, 0.8 + speed * 0.5)
    this.musicGain.gain.setTargetAtTime(game.isDrivingBlocked() ? 0.105 : 0.19, now, 0.2)
    if (vehicle.boosting && !this.wasBoosting) this.tone(180, 0.36, 0.08, 0, 950, 'triangle')
    this.wasBoosting = vehicle.boosting

    const train = game.world.rescue.train
    const approaching = train.timerState === 'running' && train.phase === 'tracking'
    this.setLoop('train', approaching ? Math.pow(train.progress, 3) * 0.18 : train.phase === 'crashing' ? 0.25 : 0)
    if (train.phase === 'crashing' && this.lastTrainPhase !== 'crashing') {
      this.tone(392, 0.9, 0.16)
      this.tone(494, 0.9, 0.1)
      this.collision(12, 'metal')
    }
    if (train.phase === 'failed' && this.lastTrainPhase !== 'failed') {
      for (const [index, frequency] of [220, 174, 130].entries()) this.tone(frequency, 0.3, 0.1, index * 0.18, frequency * 0.8, 'triangle')
    }
    this.lastTrainPhase = train.phase
    const second = Math.ceil(train.remainingSeconds)
    if (approaching && second <= 10 && second > 0 && second !== this.lastSecond) this.tone(880, 0.08, 0.07)
    this.lastSecond = second
    const puzzleState = game.puzzles.state
    if (puzzleState !== this.lastPuzzleState) {
      if (puzzleState === 'approved') [523, 659, 784].forEach((note, i) => this.tone(note, 0.24, 0.08, i * 0.12))
      if (puzzleState === 'rejected') this.tone(330, 0.24, 0.09, 0, 220)
      this.lastPuzzleState = puzzleState
    }
    if (game.puzzles.completed && !this.wasCompleted) [523, 659, 784, 1046].forEach((note, i) => this.tone(note, 0.5, 0.1, i * 0.15))
    this.wasCompleted = game.puzzles.completed
  }

  getState() {
    return {
      started: this.started, muted: this.muted, contextState: this.context?.state || 'not-started',
      loaded: Object.keys(this.buffers), failedFiles: [...this.failedFiles],
      musicPlaying: !this.music.paused, musicTime: this.music.currentTime, musicBlocked: this.musicBlocked,
      videoOpen: this.videoOpen, hitCount: this.hitCount,
      engineRate: this.loops.engine?.source.playbackRate.value || 0,
      engineGain: this.loops.engine?.gain.gain.value || 0,
      masterGain: this.master?.gain.value || 0
    }
  }
}
