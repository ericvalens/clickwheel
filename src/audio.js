// Every sound on this page is synthesized live with Web Audio: the songs,
// the wheel's click and the game's blips. Nothing is downloaded.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
}

// 16 steps per bar. x = hit, o = open hat / octave bass, 5 = fifth.
const DRUMS = {
  pop: { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
  four: { k: "x...x...x...x...", s: "....x.......x...", h: "..o...o...o...o." },
  lofi: { k: "x......x..x.....", s: "....x.......x...", h: "x.xxx.x.x.xxx.x." },
  drive: { k: "x...x...x...x...", s: "....x.......x...", h: "xxxxxxxxxxxxxxxx" },
  halftime: { k: "x.........x.....", s: "........x.......", h: "x.x.x.x.x.x.x.x." },
  soft: { k: "x.......x.......", s: "................", h: "....x.......x..." },
}

const SECTIONS = [
  { name: "intro", start: 0, len: 4, kick: 0, snare: 0, hat: 1, bass: 1, pad: 1, lead: null, vol: 0.85 },
  { name: "A", start: 4, len: 8, kick: 1, snare: 1, hat: 1, bass: 1, pad: 1, lead: "A", vol: 1 },
  { name: "B", start: 12, len: 8, kick: 1, snare: 1, hat: 1, bass: 1, pad: 1, lead: "B", vol: 1 },
  { name: "A2", start: 20, len: 8, kick: 1, snare: 1, hat: 1, bass: 1, pad: 1, lead: "A", vol: 1 },
  { name: "outro", start: 28, len: 4, kick: 1, snare: 0, hat: 1, bass: 1, pad: 1, lead: null, vol: 0.9 },
]

export const BARS = 32
export const STEPS = BARS * 16

const mtof = (m) => 440 * 2 ** ((m - 69) / 12)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function rngFrom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const stepDur = (song) => 60 / song.bpm / 4
export const songLength = (song) => STEPS * stepDur(song)

function degMidi(song, deg) {
  const sc = SCALES[song.scale]
  const oct = Math.floor(deg / 7)
  const i = ((deg % 7) + 7) % 7
  return song.root + 12 * oct + sc[i]
}

function nearestChordTone(deg, chord) {
  let best = deg
  let dist = Infinity
  for (const t of [chord, chord + 2, chord + 4]) {
    for (let n = -2; n <= 3; n++) {
      const c = t + 7 * n
      const d = Math.abs(c - deg)
      if (d < dist) {
        dist = d
        best = c
      }
    }
  }
  return best
}

// A four-bar phrase. The rhythm of bars 1–2 repeats in bars 3–4 so the
// melody sounds like a hook; the pitches answer the first half.
function makePhrase(song, rng, lift) {
  const grain = song.grain || 2
  const dens = song.density * (lift ? 1.12 : 1)
  const rhythm = []
  for (let s = 0; s < 32; s += grain) {
    const pos = s % 16
    let p = dens * (pos % 8 === 0 ? 1.4 : pos % 4 === 0 ? 1 : 0.65)
    if (s >= 28) p *= 0.35
    if (rng() < p) rhythm.push(s)
  }
  if (!rhythm.length || rhythm[0] !== 0) rhythm.unshift(0)
  const steps = [...rhythm, ...rhythm.map((s) => s + 32)]
  const notes = new Map()
  let deg = lift ? 9 : 7
  const moves = [-2, -1, -1, 1, 1, 2, 0, -3, 3]
  steps.forEach((s, i) => {
    const bar = s >> 4
    const chord = song.prog[bar % song.prog.length]
    deg += moves[Math.floor(rng() * moves.length)]
    deg = clamp(deg, 3, 12)
    if (s % 8 === 0 || rng() < 0.3) deg = clamp(nearestChordTone(deg, chord), 2, 13)
    if (i === steps.length - 1) deg = clamp(nearestChordTone(deg, chord), 2, 13)
    const next = steps[i + 1] ?? 64
    notes.set(s, { deg, len: Math.min(next - s, 6) })
  })
  return notes
}

function compile(song) {
  const rng = rngFrom(song.seed)
  return { A: makePhrase(song, rng, false), B: makePhrase(song, rng, true) }
}

export class Engine {
  constructor(volume = 0.75) {
    this.ctx = null
    this.volume = volume
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      try {
        // Safari 17+: play through the ringer switch like a music app.
        if (navigator.audioSession) navigator.audioSession.type = "playback"
      } catch {}
      const ctx = (this.ctx = new AC())
      this.master = ctx.createGain()
      this.master.gain.value = this.volume ** 2
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -16
      comp.knee.value = 12
      comp.ratio.value = 3.5
      comp.attack.value = 0.004
      comp.release.value = 0.2
      this.master.connect(comp)
      comp.connect(ctx.destination)
      this.fxBus = ctx.createGain()
      this.fxBus.gain.value = 0.4
      this.fxBus.connect(ctx.destination)
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this.noise = buf
    }
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {})
    return this.ctx
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1)
    if (this.master) this.master.gain.setTargetAtTime(this.volume ** 2, this.ctx.currentTime, 0.02)
  }

  // The wheel's tick: a few milliseconds of filtered noise.
  click() {
    const ctx = this.ensure()
    if (!ctx) return
    const t = ctx.currentTime
    const s = ctx.createBufferSource()
    s.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = "highpass"
    f.frequency.value = 2800
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.8, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.012)
    s.connect(f).connect(g).connect(this.fxBus)
    s.start(t, Math.random() * 0.5)
    s.stop(t + 0.02)
  }

  blip(freq = 660, dur = 0.05) {
    const ctx = this.ensure()
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = "square"
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g).connect(this.fxBus)
    o.start(t)
    o.stop(t + dur + 0.02)
  }
}

export class Player {
  constructor(engine) {
    this.e = engine
    this.song = null
    this.playing = false
    this.pos = 0 // in steps, fractional
    this.timer = 0
    this.onend = null
  }

  get sd() {
    return this.song ? stepDur(this.song) : 0.125
  }
  get duration() {
    return this.song ? songLength(this.song) : 0
  }
  get time() {
    return this.position() * this.sd
  }

  position() {
    if (!this.playing) return this.pos
    const p = this.startStep + (this.e.ctx.currentTime - this.t0) / this.sd
    return clamp(p, this.startStep, STEPS)
  }

  load(song) {
    this.halt()
    this.song = song
    this.comp = compile(song)
    this.pos = 0
  }

  play() {
    if (!this.song || this.playing) return
    const ctx = this.e.ensure()
    if (!ctx) return
    if (this.pos >= STEPS - 0.01) this.pos = 0
    const bus = (this.bus = ctx.createGain())
    bus.connect(this.e.master)
    // A dotted-eighth echo on the lead, rebuilt per play so pausing cuts it.
    const send = (this.send = ctx.createGain())
    send.gain.value = 0.26
    const dl = ctx.createDelay(2)
    dl.delayTime.value = this.sd * 3
    const fb = ctx.createGain()
    fb.gain.value = 0.3
    const lp = ctx.createBiquadFilter()
    lp.type = "lowpass"
    lp.frequency.value = 2400
    send.connect(dl)
    dl.connect(lp)
    lp.connect(fb)
    fb.connect(dl)
    lp.connect(bus)
    this.t0 = ctx.currentTime + 0.05
    this.startStep = this.pos
    this.next = Math.ceil(this.pos - 1e-6)
    this.playing = true
    this.tick()
    this.timer = setInterval(() => this.tick(), 25)
  }

  tick() {
    const ctx = this.e.ctx
    const horizon = ctx.currentTime + 0.15
    while (this.playing && this.next < STEPS) {
      const st = this.next
      const t = this.t0 + (st - this.startStep) * this.sd
      if (t > horizon) break
      this.step(st, t + (st & 1 ? this.song.swing * this.sd : 0))
      this.next++
    }
    if (this.playing && this.position() >= STEPS) {
      this.halt()
      this.pos = STEPS
      this.onend?.()
    }
  }

  halt() {
    if (this.playing) this.pos = this.position()
    this.playing = false
    clearInterval(this.timer)
    const b = this.bus
    if (b && this.e.ctx) {
      const t = this.e.ctx.currentTime
      b.gain.cancelScheduledValues(t)
      b.gain.setTargetAtTime(0, t, 0.02)
      setTimeout(() => {
        try {
          b.disconnect()
        } catch {}
      }, 300)
    }
    this.bus = null
  }

  pause() {
    this.halt()
  }

  seek(sec) {
    if (!this.song) return
    const was = this.playing
    this.halt()
    this.pos = clamp(sec / this.sd, 0, STEPS - 1)
    if (was) this.play()
  }

  // ---- instruments ----

  voice(t, midi, dur, o) {
    const ctx = this.e.ctx
    const osc = ctx.createOscillator()
    osc.type = o.wave
    osc.frequency.value = mtof(midi)
    if (o.detune) osc.detune.value = o.detune
    const f = ctx.createBiquadFilter()
    f.type = "lowpass"
    f.frequency.value = o.cutoff || 4000
    const g = ctx.createGain()
    const a = o.a ?? 0.005
    const r = o.r ?? 0.08
    const end = Math.max(a + 0.01, dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(o.gain, t + a)
    if (o.sus != null) g.gain.setTargetAtTime(o.gain * o.sus, t + a, o.dec ?? 0.1)
    g.gain.setTargetAtTime(0.0001, t + end, r / 3)
    osc.connect(f)
    f.connect(g)
    g.connect(this.bus)
    if (o.send) g.connect(this.send)
    osc.start(t)
    osc.stop(t + end + r * 1.6)
  }

  noiseHit(t, type, freq, peak, decay) {
    const ctx = this.e.ctx
    const s = ctx.createBufferSource()
    s.buffer = this.e.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(peak, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    s.connect(f).connect(g).connect(this.bus)
    s.start(t, Math.random() * 0.6)
    s.stop(t + decay + 0.02)
  }

  kick(t, v) {
    const ctx = this.e.ctx
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.9 * v, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32)
    o.connect(g).connect(this.bus)
    o.start(t)
    o.stop(t + 0.35)
  }

  snare(t, v) {
    this.noiseHit(t, "bandpass", 1900, 0.45 * v, 0.16)
    this.voice(t, 54, 0.02, { wave: "triangle", gain: 0.22 * v, r: 0.08 })
  }

  hat(t, v, open) {
    this.noiseHit(t, "highpass", 7500, (open ? 0.1 : 0.08) * v, open ? 0.18 : 0.035)
  }

  step(st, t) {
    const s = this.song
    const sd = this.sd
    const bar = st >> 4
    const pos = st & 15
    const sec = SECTIONS.find((x) => bar >= x.start && bar < x.start + x.len)
    const chord = s.prog[bar % s.prog.length]
    let v = sec.vol * (s.mix ?? 1)
    if (sec.name === "outro") v *= 1 - ((bar - sec.start) * 16 + pos) / 64 * 0.85

    const d = DRUMS[s.drums]
    if (sec.kick && d.k[pos] === "x") this.kick(t, v * (s.drums === "soft" ? 0.6 : 1))
    if (sec.snare && d.s[pos] === "x") this.snare(t, v)
    const lastBar = bar === sec.start + sec.len - 1
    if (sec.snare && lastBar && sec.name !== "A2" && pos >= 12) this.snare(t, v * 0.5 * (pos - 10) / 6)
    if (sec.hat && d.h[pos] !== ".") this.hat(t, v, d.h[pos] === "o")

    if (sec.bass && !(sec.name === "intro" && bar < 2)) {
      const b = s.bass[pos]
      if (b !== ".") {
        const deg = b === "5" ? chord + 4 : chord
        const midi = degMidi(s, deg) - 24 + (b === "o" ? 12 : 0)
        this.voice(t, midi, sd * 1.7, { wave: "square", gain: 0.15 * v, cutoff: 620, r: 0.06 })
      }
    }

    if (sec.pad) {
      if (s.texture === "pad" && pos === 0) {
        ;[0, 2, 4].forEach((x, i) =>
          this.voice(t, degMidi(s, chord + x) - 12, sd * 16, {
            wave: "sawtooth",
            gain: 0.03 * v,
            cutoff: 1400,
            a: 0.25,
            r: 0.5,
            detune: i % 2 ? 7 : -7,
          })
        )
      }
      if (s.texture === "arp") {
        const arp = [0, 2, 4, 7]
        this.voice(t, degMidi(s, chord + arp[pos % 4]), sd * 0.85, {
          wave: "triangle",
          gain: 0.06 * v,
          cutoff: 2600,
          r: 0.05,
        })
      }
    }

    if (sec.lead) {
      const phrase = this.comp[sec.lead]
      const n = phrase.get(((bar - sec.start) % 4) * 16 + pos)
      if (n) {
        this.voice(t, degMidi(s, n.deg), n.len * sd * 0.92, {
          wave: s.lead,
          gain: (s.lead === "sine" ? 0.11 : 0.065) * v,
          cutoff: s.lead === "sawtooth" ? 2600 : 3400,
          a: 0.008,
          r: 0.12,
          sus: 0.6,
          dec: 0.12,
          send: true,
        })
      }
    }
  }
}
