import { announce, createLocalStorage, createTypeahead, isTypeaheadKey } from "@ui-sdk/core"
import "@ui-sdk/web/meter"
import "@ui-sdk/web/progress"
import "@ui-sdk/web/switch"
import { Engine, Player, STEPS } from "./audio.js"
import { ALBUMS, PLAYLISTS, SONGS, albumOf, art, artistOf, genreOf, playlistSongs } from "./library.js"

const ROWS = 8
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
const h = (html) => {
  const t = document.createElement("template")
  t.innerHTML = html.trim()
  return t.content.firstElementChild
}
const fmt = (s) => {
  s = Math.max(0, Math.floor(s))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
const shuffled = (a) => {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
const byTitle = (a, b) => a.title.localeCompare(b.title)
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)")
const SLIDE = { duration: 260, easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" }

const BODIES = { silver: "Silver", black: "Black", white: "White", red: "Red" }
const REPEAT = { off: "Off", one: "One", all: "All" }
const DEFAULTS = { shuffle: false, repeat: "off", clicker: true, backlight: "10s", body: "silver", volume: 0.7 }

const ICON = {
  play: `<svg viewBox="0 0 10 10" width="9" height="9"><path d="M1.5 1v8l7-4z" fill="currentColor"/></svg>`,
  pause: `<svg viewBox="0 0 10 10" width="9" height="9"><path d="M1.5 1h2.6v8H1.5zM5.9 1h2.6v8H5.9z" fill="currentColor"/></svg>`,
  lock: `<svg viewBox="0 0 10 12" width="9" height="11"><path d="M2 5V3.6a3 3 0 0 1 6 0V5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="1" y="5" width="8" height="6.4" rx="1" fill="currentColor"/></svg>`,
  spkLo: `<svg viewBox="0 0 12 12" width="11" height="11"><path d="M1 4.2h2.4L6.5 1.5v9L3.4 7.8H1z" fill="currentColor"/></svg>`,
  spkHi: `<svg viewBox="0 0 16 12" width="15" height="11"><path d="M1 4.2h2.4L6.5 1.5v9L3.4 7.8H1z" fill="currentColor"/><path d="M8.6 3.6a3.3 3.3 0 0 1 0 4.8M10.6 1.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
}

// ---------------------------------------------------------------------------
// Views. Each one owns an element in the screen and answers the wheel.
// ---------------------------------------------------------------------------

class MenuView {
  constructor(app, title, items, opts = {}) {
    this.app = app
    this.title = title
    this.itemsFn = typeof items === "function" ? items : () => items
    this.opts = opts
    this.i = 0
    this.top = 0
    this.typeahead = createTypeahead()
    this.el = h(`<div class="pane menu${opts.preview ? " split" : ""}">
      <ul class="list" aria-label="${esc(title)}"></ul>
      ${opts.preview ? `<div class="preview" aria-hidden="true"><div class="pv"></div><div class="pv"></div></div>` : ""}
      <div class="sb" aria-hidden="true"><i></i></div>
    </div>`)
    this.ul = this.el.querySelector(".list")
    this.sb = this.el.querySelector(".sb")
  }

  refresh() {
    this.items = this.itemsFn()
    this.i = clamp(this.i, 0, Math.max(0, this.items.length - 1))
    this.top = clamp(this.top, Math.max(0, this.i - ROWS + 1), this.i)
    this.render()
  }

  render() {
    const rows = this.items.slice(this.top, this.top + ROWS)
    this.ul.innerHTML = rows.length
      ? rows
          .map((it, k) => {
            const on = this.top + k === this.i
            const value = typeof it.value === "function" ? it.value() : it.value
            const tail = value != null ? `<span class="v">${esc(value)}</span>` : it.arrow === false ? "" : `<span class="arr">›</span>`
            return `<li${on ? ` class="on" aria-current="true"` : ""}><span class="l">${esc(it.label)}</span>${tail}</li>`
          })
          .join("")
      : `<li class="empty">No items</li>`
    const n = this.items.length
    this.sb.hidden = n <= ROWS
    if (n > ROWS) {
      const thumb = this.sb.firstElementChild
      thumb.style.height = `${(ROWS / n) * 100}%`
      thumb.style.top = `${(this.top / n) * 100}%`
    }
  }

  moveTo(i) {
    const n = clamp(i, 0, this.items.length - 1)
    if (n === this.i) return false
    this.i = n
    if (this.i < this.top) this.top = this.i
    if (this.i >= this.top + ROWS) this.top = this.i - ROWS + 1
    this.render()
    announce(this.items[this.i].label)
    return true
  }

  scroll(d) {
    return this.moveTo(this.i + d)
  }

  select() {
    const it = this.items[this.i]
    if (!it?.action) return
    it.action()
    if (this.app.top === this) this.render()
  }

  key(event) {
    if (!isTypeaheadKey(event)) return false
    const idx = this.typeahead(event.key, this.items.map((it) => it.label), this.i)
    if (idx !== -1) this.moveTo(idx)
    return true
  }

  show() {
    if (!this.opts.preview) return
    const layers = [...this.el.querySelectorAll(".pv")]
    let k = 0
    let a = 0
    const flip = () => {
      const song = this.app.player.song
      const album = song && k === 0 ? albumOf(song) : ALBUMS[a++ % ALBUMS.length]
      const layer = layers[k % 2]
      const cover = art(album.id)
      layer.innerHTML = `<div class="pv-bg">${cover}</div><div class="pv-cover">${cover}</div>`
      layers.forEach((l) => l.classList.toggle("show", l === layer))
      k++
    }
    flip()
    if (!reduceMotion.matches) this.slideshow = setInterval(flip, 5200)
  }

  hide() {
    clearInterval(this.slideshow)
  }
}

class NowPlayingView {
  constructor(app) {
    this.app = app
    this.title = "Now Playing"
    this.mode = "progress"
    this.volUntil = 0
    this.scrubUntil = 0
    this.el = h(`<div class="pane now">
      <div class="np-count"></div>
      <div class="np-main">
        <div class="np-art"><div class="cover"></div><div class="refl"></div></div>
        <div class="np-meta"><b class="t"></b><span class="ar"></span><span class="al"></span></div>
      </div>
      <div class="np-bar">
        <ui-progress class="bar" aria-label="Song position" value="0">
          <ui-progress-track><ui-progress-indicator></ui-progress-indicator><i class="knob"></i></ui-progress-track>
        </ui-progress>
        <div class="times" aria-hidden="true"><span class="el"></span><span class="rem"></span></div>
      </div>
      <div class="np-vol">
        ${ICON.spkLo}
        <ui-meter class="bar" aria-label="Volume" value="0">
          <ui-meter-track><ui-meter-indicator></ui-meter-indicator></ui-meter-track>
        </ui-meter>
        ${ICON.spkHi}
      </div>
    </div>`)
    this.$ = (s) => this.el.querySelector(s)
    this.bar = this.$("ui-progress")
    this.volume = this.$("ui-meter")
  }

  show() {
    this.bar.getValueLabel = (t) => `${fmt(t ?? 0)} of ${fmt(this.app.player.duration || 0)}`
  }

  refresh() {
    const { player, queue, qi } = this.app
    const song = player.song
    const now = performance.now()
    if (song !== this.shown) {
      this.shown = song
      const album = song && albumOf(song)
      this.$(".cover").innerHTML = song ? art(album.id, `${album.title} cover`) : ""
      this.$(".refl").innerHTML = song ? art(album.id) : ""
      this.$(".t").textContent = song ? song.title : "Nothing playing"
      this.$(".ar").textContent = song ? album.artist : ""
      this.$(".al").textContent = song ? album.title : ""
    }
    this.$(".np-count").textContent = song ? `${qi + 1} of ${queue.length}` : ""
    if (this.mode === "scrub" && now > this.scrubUntil) this.mode = "progress"
    const vol = now < this.volUntil
    this.el.classList.toggle("vol", vol)
    this.el.classList.toggle("scrub", this.mode === "scrub")
    if (vol) {
      this.volume.setAttribute("value", Math.round(this.app.settings.volume * 100))
    } else if (song) {
      const t = player.time
      const d = player.duration
      this.bar.setAttribute("max", d.toFixed(2))
      this.bar.setAttribute("value", t.toFixed(2))
      this.$(".el").textContent = fmt(t)
      this.$(".rem").textContent = `-${fmt(d - t)}`
    }
  }

  tick() {
    this.refresh()
  }

  scroll(d) {
    const { player } = this.app
    if (this.mode === "scrub" && player.song) {
      player.seek(clamp(player.time + d * 2, 0, player.duration - 0.5))
      this.scrubUntil = performance.now() + 3000
      this.refresh()
      return true
    }
    const before = this.app.settings.volume
    this.app.setVolume(before + d * 0.04)
    this.volUntil = performance.now() + 1500
    this.refresh()
    return this.app.settings.volume !== before
  }

  select() {
    if (!this.app.player.song) return
    this.mode = this.mode === "scrub" ? "progress" : "scrub"
    this.scrubUntil = performance.now() + 3000
    this.volUntil = 0
    this.refresh()
  }
}

class ClockView {
  constructor(app) {
    this.title = "Clock"
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    const city = zone.split("/").pop().replace(/_/g, " ")
    this.el = h(`<div class="pane clock"><div class="city">${esc(city)}</div><div class="time"></div><div class="date"></div></div>`)
  }
  refresh() {
    const d = new Date()
    this.el.querySelector(".time").innerHTML = d
      .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .replace(/\s?([AP]M)$/i, '<small>$1</small>')
    this.el.querySelector(".date").textContent = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
  }
  tick() {
    this.refresh()
  }
}

class StopwatchView {
  constructor(app) {
    this.title = "Stopwatch"
    this.elapsed = 0
    this.started = 0
    this.laps = []
    this.el = h(`<div class="pane stopwatch">
      <div class="sw-time">0:00.00</div>
      <ol class="laps"></ol>
      <div class="hint">center: start / stop · ⏯ lap / reset</div>
    </div>`)
  }
  now() {
    return this.elapsed + (this.started ? performance.now() - this.started : 0)
  }
  static fmt(ms) {
    const cs = Math.floor(ms / 10)
    return `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`
  }
  refresh() {
    this.el.querySelector(".sw-time").textContent = StopwatchView.fmt(this.now())
    this.el.querySelector(".laps").innerHTML = this.laps
      .slice(-4)
      .map((l, i, a) => `<li><span>Lap ${this.laps.length - a.length + i + 1}</span><span>${StopwatchView.fmt(l)}</span></li>`)
      .join("")
  }
  select() {
    if (this.started) {
      this.elapsed += performance.now() - this.started
      this.started = 0
    } else this.started = performance.now()
    this.refresh()
  }
  button(name) {
    if (name !== "play") return false
    if (this.started) this.laps.push(this.now())
    else {
      this.elapsed = 0
      this.laps = []
    }
    this.refresh()
    return true
  }
  show() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      if (this.started) this.el.querySelector(".sw-time").textContent = StopwatchView.fmt(this.now())
    }
    loop()
  }
  hide() {
    cancelAnimationFrame(this.raf)
  }
}

class PaddleView {
  constructor(app) {
    this.app = app
    this.title = "Paddle"
    this.W = 284
    this.H = 192
    this.el = h(`<div class="pane game"><canvas aria-label="Paddle game: turn the wheel to move, center to launch"></canvas></div>`)
    this.cv = this.el.querySelector("canvas")
    const dpr = 3
    this.cv.width = this.W * dpr
    this.cv.height = this.H * dpr
    this.ctx = this.cv.getContext("2d")
    this.ctx.scale(dpr, dpr)
    this.reset()
  }
  reset() {
    this.lives = 3
    this.score = 0
    this.level = 1
    this.over = false
    this.paused = false
    this.px = (this.W - 46) / 2
    this.build()
    this.serve()
  }
  build() {
    const cols = 8
    const gap = 2
    const bw = (this.W - 12 - gap * (cols - 1)) / cols
    this.bricks = []
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < cols; c++) this.bricks.push({ x: 6 + c * (bw + gap), y: 24 + r * 11, w: bw, h: 9, r })
  }
  serve() {
    this.pw = 46
    this.py = this.H - 12
    this.stuck = true
    this.ball = { x: this.px + this.pw / 2, y: this.py - 4, vx: 0, vy: 0, r: 3.5 }
  }
  speed() {
    return 150 + this.level * 22
  }
  scroll(d) {
    this.px = clamp(this.px + d * 14, 0, this.W - this.pw)
    if (this.stuck) this.ball.x = this.px + this.pw / 2
    this.draw()
    return true
  }
  select() {
    if (this.over) this.reset()
    else if (this.stuck) {
      this.stuck = false
      const a = ((-90 + (Math.random() * 50 - 25)) * Math.PI) / 180
      this.ball.vx = Math.cos(a) * this.speed()
      this.ball.vy = Math.sin(a) * this.speed()
    } else this.paused = !this.paused
    this.draw()
  }
  button(name) {
    return name === "play" || name === "next" || name === "prev"
  }
  show() {
    let last = performance.now()
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop)
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      if (!this.paused && !this.stuck && !this.over) {
        const n = Math.ceil((Math.hypot(this.ball.vx, this.ball.vy) * dt) / 3)
        for (let i = 0; i < n; i++) this.step(dt / n)
      }
      this.draw()
    }
    this.raf = requestAnimationFrame(loop)
  }
  hide() {
    cancelAnimationFrame(this.raf)
    if (!this.stuck && !this.over) this.paused = true
  }
  step(dt) {
    const b = this.ball
    const e = this.app.engine
    b.x += b.vx * dt
    b.y += b.vy * dt
    if (b.x < b.r) (b.x = b.r), (b.vx = Math.abs(b.vx))
    if (b.x > this.W - b.r) (b.x = this.W - b.r), (b.vx = -Math.abs(b.vx))
    if (b.y < 16 + b.r) (b.y = 16 + b.r), (b.vy = Math.abs(b.vy))
    if (b.vy > 0 && b.y + b.r >= this.py && b.y + b.r <= this.py + 7 && b.x >= this.px - b.r && b.x <= this.px + this.pw + b.r) {
      const off = clamp((b.x - (this.px + this.pw / 2)) / (this.pw / 2), -1, 1)
      const ang = ((-90 + off * 60) * Math.PI) / 180
      b.vx = Math.cos(ang) * this.speed()
      b.vy = Math.sin(ang) * this.speed()
      b.y = this.py - b.r
      e.blip(440, 0.04)
    }
    for (let k = 0; k < this.bricks.length; k++) {
      const br = this.bricks[k]
      if (b.x + b.r > br.x && b.x - b.r < br.x + br.w && b.y + b.r > br.y && b.y - b.r < br.y + br.h) {
        const ox = Math.min(b.x + b.r - br.x, br.x + br.w - (b.x - b.r))
        const oy = Math.min(b.y + b.r - br.y, br.y + br.h - (b.y - b.r))
        if (ox < oy) b.vx = -b.vx
        else b.vy = -b.vy
        this.bricks.splice(k, 1)
        this.score += (5 - br.r) * 10
        e.blip(660 + (4 - br.r) * 110, 0.05)
        break
      }
    }
    if (!this.bricks.length) {
      this.level++
      this.build()
      this.serve()
      e.blip(990, 0.15)
    }
    if (b.y > this.H + 8) {
      this.lives--
      e.blip(160, 0.25)
      if (this.lives <= 0) this.over = true
      else this.serve()
    }
  }
  draw() {
    const c = this.ctx
    const { W, H } = this
    c.fillStyle = "#fff"
    c.fillRect(0, 0, W, H)
    c.font = "600 10px -apple-system, Helvetica Neue, Helvetica, Arial, sans-serif"
    c.fillStyle = "#222"
    c.textBaseline = "middle"
    c.textAlign = "left"
    c.fillText(`Score ${this.score}`, 6, 8)
    c.textAlign = "right"
    c.fillText(`Level ${this.level}  ${"●".repeat(Math.max(0, this.lives))}`, W - 6, 8)
    c.fillStyle = "#c8ccd2"
    c.fillRect(0, 15, W, 1)
    const colors = ["#e2463f", "#f08c2e", "#f2c230", "#48b356", "#3a7fd8"]
    for (const br of this.bricks) {
      c.fillStyle = colors[br.r]
      c.fillRect(br.x, br.y, br.w, br.h)
      c.fillStyle = "rgba(255,255,255,.35)"
      c.fillRect(br.x, br.y, br.w, 2)
    }
    const g = c.createLinearGradient(0, this.py, 0, this.py + 6)
    g.addColorStop(0, "#5aa0f0")
    g.addColorStop(1, "#1c63c4")
    c.fillStyle = g
    c.beginPath()
    c.roundRect(this.px, this.py, this.pw, 6, 3)
    c.fill()
    c.fillStyle = "#111"
    c.beginPath()
    c.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2)
    c.fill()
    const msg = this.over ? ["Game Over", "Press center to play again"] : this.paused ? ["Paused", "Press center"] : this.stuck ? ["", "Turn to aim · center to launch"] : null
    if (msg) {
      c.textAlign = "center"
      c.fillStyle = "#111"
      if (msg[0]) {
        c.font = "700 16px -apple-system, Helvetica Neue, Helvetica, Arial, sans-serif"
        c.fillText(msg[0], W / 2, H / 2 + 14)
      }
      c.font = "500 10px -apple-system, Helvetica Neue, Helvetica, Arial, sans-serif"
      c.fillStyle = "#555"
      c.fillText(msg[1], W / 2, H / 2 + 32)
    }
  }
}

class AboutView {
  constructor(app) {
    this.title = "About"
    const rows = [
      ["Songs", SONGS.length],
      ["Albums", ALBUMS.length],
      ["Capacity", "∞ (all synthesized)"],
      ["Built with", "UI SDK + Web Audio"],
      ["Version", "1.0"],
    ]
    this.el = h(`<div class="pane about">
      <div class="about-name">Clickwheel</div>
      <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      <div class="about-foot">A toy by <img src="chimpipi-wordmark.webp" alt="Chimpipi" width="200" height="78" /></div>
    </div>`)
  }
  refresh() {}
}

// ---------------------------------------------------------------------------
// The device.
// ---------------------------------------------------------------------------

export class App {
  constructor(root) {
    this.root = root
    this.device = root.querySelector(".device")
    this.screen = root.querySelector(".screen")
    this.panes = root.querySelector(".panes")
    this.statusTitle = root.querySelector(".st-title")
    this.statusLeft = root.querySelector(".st-left")
    this.batt = root.querySelector(".batt")
    this.wheel = root.querySelector("click-wheel")
    this.holdSwitch = root.querySelector(".hold")

    this.saved = createLocalStorage("clickwheel:settings")
    let stored = {}
    try {
      stored = JSON.parse(this.saved.get() || "{}") || {}
    } catch {}
    this.settings = { ...DEFAULTS, ...stored }

    this.engine = new Engine(this.settings.volume)
    this.player = new Player(this.engine)
    this.player.onend = () => this.advance()
    this.queue = []
    this.qi = -1
    this.stack = []
    this.held = false
    this.asleep = false
    this.battery = 0.82
    this.lastInput = performance.now()

    this.applyBody()
    this.push(new MenuView(this, "Clickwheel", () => this.rootItems(), { preview: true }), false)

    // The wheel is a UI SDK primitive; its callbacks arrive as DOM events.
    this.wheel.addEventListener("turn", (e) => this.input(() => this.turn(e.detail.value)))
    this.wheel.addEventListener("press", (e) => this.input(() => this.press(e.detail.value)))
    this.wheel.addEventListener("hold", (e) => this.input(() => this.hold(e.detail.value, e.detail.count)))
    this.wheel.addEventListener("blocked", () => this.flashLock())
    this.wheel.addEventListener("pointerdown", () => this.engine.ensure())
    // A mouse press shouldn't focus the wheel's buttons, or the next Space
    // or Enter would go to that button instead of the player.
    this.wheel.addEventListener("mousedown", (e) => e.preventDefault())
    this.wheel.addEventListener("pointerup", () => this.engine.ensure())

    this.holdSwitch.addEventListener("checkedchange", (e) => this.setHold(e.detail.value))
    this.holdSwitch.addEventListener("mousedown", (e) => e.preventDefault())
    addEventListener("keydown", (e) => this.onKey(e))
    this.wheelAcc = 0
    addEventListener("wheel", (e) => this.onScrollWheel(e), { passive: false })

    navigator.getBattery?.()
      .then((b) => {
        const upd = () => {
          this.battery = b.level
          this.charging = b.charging
          this.updateStatus()
        }
        upd()
        b.addEventListener("levelchange", upd)
        b.addEventListener("chargingchange", upd)
      })
      .catch(() => {})

    setInterval(() => this.frame(), 200)
    this.updateStatus()
  }

  get top() {
    return this.stack[this.stack.length - 1]
  }

  // ---- settings ----

  set(key, value) {
    this.settings[key] = value
    this.saved.set(JSON.stringify(this.settings))
    if (key === "body") this.applyBody()
  }

  applyBody() {
    this.device.dataset.body = this.settings.body
  }

  setVolume(v) {
    const vol = Math.round(clamp(v, 0, 1) * 100) / 100
    this.engine.setVolume(vol)
    this.set("volume", vol)
    this.sync()
  }

  setHold(on) {
    this.held = on
    this.wheel.locked = on
    this.updateStatus()
    announce(on ? "Hold on" : "Hold off")
  }

  flashLock() {
    this.screen.classList.remove("flash-lock")
    void this.screen.offsetWidth
    this.screen.classList.add("flash-lock")
    this.wake()
  }

  // ---- navigation ----

  push(view, animate = true) {
    const prev = this.top
    this.stack.push(view)
    this.panes.append(view.el)
    view.refresh?.()
    this.slide(prev?.el, view.el, 1, animate)
    prev?.hide?.()
    view.show?.()
    this.updateStatus()
  }

  pop() {
    if (this.stack.length < 2) return false
    const cur = this.stack.pop()
    const prev = this.top
    this.panes.append(prev.el)
    prev.refresh?.()
    this.slide(cur.el, prev.el, -1, true)
    cur.hide?.()
    prev.show?.()
    this.updateStatus()
    return true
  }

  slide(outEl, inEl, dir, animate) {
    if (!outEl) return
    for (const el of [outEl, inEl]) el.getAnimations?.().forEach((a) => a.cancel())
    if (!animate || reduceMotion.matches || !inEl.animate) {
      outEl.remove()
      return
    }
    inEl.animate({ transform: [`translateX(${dir * 100}%)`, "translateX(0)"] }, SLIDE)
    // A pane that comes back before it finishes leaving is canceled, and stays.
    outEl
      .animate({ transform: ["translateX(0)", `translateX(${-dir * 100}%)`] }, { ...SLIDE, fill: "forwards" })
      .finished.then(
        () => {
          if (this.top?.el !== outEl) outEl.remove()
        },
        () => {}
      )
  }

  // ---- input ----

  input(fn) {
    if (this.asleep) {
      this.asleep = false
      this.screen.classList.remove("off")
      this.wake()
      return
    }
    this.wake()
    fn()
  }

  wake() {
    this.lastInput = performance.now()
    this.screen.classList.remove("dim")
  }

  click() {
    if (!this.settings.clicker) return
    this.engine.click()
  }

  turn(d) {
    const moved = this.top.scroll?.(d)
    if (moved) this.click()
  }

  press(name) {
    this.click()
    if (this.top.button?.(name)) return
    if (name === "select") return this.top.select?.()
    if (name === "menu") return this.pop()
    if (name === "play") return this.togglePlay()
    if (name === "next") return this.skip(1)
    if (name === "prev") return this.skip(-1)
  }

  hold(name, count) {
    if (name === "play") return this.sleep()
    if (name === "menu") {
      this.screen.classList.toggle("dim")
      return
    }
    if ((name === "next" || name === "prev") && this.player.song) {
      const p = this.player
      p.seek(clamp(p.time + (name === "next" ? 3 : -3), 0, p.duration - 0.5))
      if (count === 1) this.click()
    }
  }

  sleep() {
    this.player.pause()
    this.asleep = true
    this.screen.classList.add("off")
    this.sync()
    announce("Sleeping. Press any button to wake.")
  }

  onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const onButton = e.target instanceof HTMLElement && e.target.closest("button, ui-switch")
    const map = {
      ArrowDown: () => this.turn(1),
      ArrowUp: () => this.turn(-1),
      ArrowRight: () => this.press("next"),
      ArrowLeft: () => this.press("prev"),
      Enter: () => this.press("select"),
      Escape: () => this.press("menu"),
      Backspace: () => this.press("menu"),
      " ": () => this.press("play"),
    }
    let fn = map[e.key]
    if ((e.key === "Enter" || e.key === " ") && onButton) return // the focused button handles it
    if (!fn && this.top.key && this.held === false) {
      if (this.top.key(e)) e.preventDefault()
      return
    }
    if (!fn) return
    e.preventDefault()
    this.engine.ensure()
    if (this.held) return this.flashLock()
    this.input(fn)
  }

  onScrollWheel(e) {
    if (e.ctrlKey) return
    e.preventDefault()
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    this.wheelAcc += px
    const step = 36
    while (Math.abs(this.wheelAcc) >= step) {
      const d = Math.sign(this.wheelAcc)
      this.wheelAcc -= d * step
      if (this.held) return this.flashLock()
      this.input(() => this.turn(d))
    }
  }

  // ---- playback ----

  playList(list, i, shuffle = this.settings.shuffle) {
    let q = list.slice()
    if (shuffle) {
      const first = q[i]
      q = [first, ...shuffled(q.filter((s) => s !== first))]
      i = 0
    }
    this.queue = q
    this.qi = i
    this.player.load(q[i])
    this.player.play()
    this.updateStatus()
  }

  showNowPlaying() {
    if (this.top instanceof NowPlayingView) this.top.refresh()
    else this.push(new NowPlayingView(this))
  }

  togglePlay() {
    if (!this.player.song) {
      this.playList(SONGS, 0)
      this.showNowPlaying()
      return
    }
    if (this.player.playing) this.player.pause()
    else this.player.play()
    this.updateStatus()
  }

  skip(d) {
    const p = this.player
    if (!p.song) return
    if (d < 0 && p.time > 3) {
      p.seek(0)
      return
    }
    const was = p.playing || p.pos >= STEPS
    this.qi = (this.qi + d + this.queue.length) % this.queue.length
    p.load(this.queue[this.qi])
    if (was) p.play()
    this.updateStatus()
  }

  advance() {
    const { repeat } = this.settings
    if (repeat === "one") {
      this.player.seek(0)
      this.player.play()
    } else if (this.qi + 1 < this.queue.length || repeat === "all") {
      this.qi = (this.qi + 1) % this.queue.length
      this.player.load(this.queue[this.qi])
      this.player.play()
    }
    this.updateStatus()
  }

  // Called by the <music-player> primitive, for agents.
  controller() {
    const find = (q) => {
      const s = String(q).toLowerCase().trim()
      return SONGS.find((x) => x.id === s || x.title.toLowerCase() === s) || SONGS.find((x) => x.title.toLowerCase().includes(s))
    }
    return {
      playSong: (q) => {
        const song = find(q)
        if (!song) throw new Error(`No song "${q}". Songs: ${SONGS.map((s) => s.title).join(", ")}.`)
        const list = SONGS.filter((s) => s.album === song.album)
        this.playList(list, list.indexOf(song), false)
        this.showNowPlaying()
        this.wake()
        return song.title
      },
      play: () => {
        if (!this.player.playing) this.togglePlay()
      },
      pause: () => {
        if (this.player.playing) this.togglePlay()
      },
      skip: (d) => this.skip(d),
      setVolume: (v) => {
        this.setVolume(v)
        if (this.top instanceof NowPlayingView) {
          this.top.volUntil = performance.now() + 1500
          this.top.refresh()
        }
      },
      shuffleAll: () => {
        this.playList(SONGS, Math.floor(Math.random() * SONGS.length), true)
        this.showNowPlaying()
      },
    }
  }

  sync() {
    const s = this.player.song
    this.root.api?.sync({
      value: s ? s.title : "",
      playing: this.player.playing,
      volume: this.settings.volume,
      items: SONGS.map((x) => ({ value: x.title, label: x.title })),
    })
  }

  // ---- status bar & timers ----

  updateStatus() {
    const s = this.player.song
    this.statusTitle.textContent = this.top?.title ?? ""
    this.statusLeft.innerHTML = this.held ? ICON.lock : s ? (this.player.playing ? ICON.play : ICON.pause) : ""
    this.batt.setAttribute("value", Math.round(this.battery * 100))
    this.batt.toggleAttribute("data-low", this.battery < 0.2)
    this.batt.toggleAttribute("data-charging", !!this.charging)
    this.sync()
  }

  frame() {
    this.top.tick?.()
    if (this.settings.backlight === "10s" && performance.now() - this.lastInput > 10000) this.screen.classList.add("dim")
    const playing = this.player.playing
    if (playing !== this.wasPlaying) {
      this.wasPlaying = playing
      this.updateStatus()
    }
  }

  // ---- menus ----

  songList(title, songs) {
    return new MenuView(
      this,
      title,
      songs.map((s, i) => ({
        label: s.title,
        arrow: false,
        action: () => {
          this.playList(songs, i)
          this.showNowPlaying()
        },
      }))
    )
  }

  rootItems() {
    const items = [
      { label: "Music", action: () => this.push(new MenuView(this, "Music", this.musicItems())) },
      { label: "Extras", action: () => this.push(new MenuView(this, "Extras", this.extrasItems())) },
      { label: "Settings", action: () => this.push(new MenuView(this, "Settings", () => this.settingsItems())) },
      {
        label: "Shuffle Songs",
        arrow: false,
        action: () => {
          this.playList(SONGS, Math.floor(Math.random() * SONGS.length), true)
          this.showNowPlaying()
        },
      },
    ]
    if (this.player.song) items.push({ label: "Now Playing", action: () => this.showNowPlaying() })
    return items
  }

  musicItems() {
    const artists = [...new Set(ALBUMS.map((a) => a.artist))].sort()
    const genres = [...new Set(ALBUMS.map((a) => a.genre))].sort()
    return [
      {
        label: "Playlists",
        action: () =>
          this.push(new MenuView(this, "Playlists", PLAYLISTS.map((p) => ({ label: p.title, action: () => this.push(this.songList(p.title, playlistSongs(p))) })))),
      },
      {
        label: "Artists",
        action: () =>
          this.push(
            new MenuView(
              this,
              "Artists",
              artists.map((name) => ({
                label: name,
                action: () => {
                  const albums = ALBUMS.filter((a) => a.artist === name)
                  const all = SONGS.filter((s) => artistOf(s) === name)
                  this.push(
                    new MenuView(this, name, [
                      { label: "All Songs", action: () => this.push(this.songList(name, all)) },
                      ...albums.map((a) => ({ label: a.title, action: () => this.push(this.songList(a.title, SONGS.filter((s) => s.album === a.id))) })),
                    ])
                  )
                },
              }))
            )
          ),
      },
      {
        label: "Albums",
        action: () =>
          this.push(new MenuView(this, "Albums", ALBUMS.map((a) => ({ label: a.title, action: () => this.push(this.songList(a.title, SONGS.filter((s) => s.album === a.id))) })))),
      },
      { label: "Songs", action: () => this.push(this.songList("Songs", SONGS.slice().sort(byTitle))) },
      {
        label: "Genres",
        action: () =>
          this.push(new MenuView(this, "Genres", genres.map((g) => ({ label: g, action: () => this.push(this.songList(g, SONGS.filter((s) => genreOf(s) === g))) })))),
      },
    ]
  }

  extrasItems() {
    return [
      { label: "Clock", action: () => this.push(new ClockView(this)) },
      { label: "Stopwatch", action: () => this.push(new StopwatchView(this)) },
      { label: "Games", action: () => this.push(new MenuView(this, "Games", [{ label: "Paddle", action: () => this.push(new PaddleView(this)) }])) },
    ]
  }

  settingsItems() {
    const s = this.settings
    const cycle = (key, list) => () => this.set(key, list[(list.indexOf(s[key]) + 1) % list.length])
    return [
      { label: "About", action: () => this.push(new AboutView(this)) },
      { label: "Shuffle", value: () => (s.shuffle ? "Songs" : "Off"), action: () => this.set("shuffle", !s.shuffle) },
      { label: "Repeat", value: () => REPEAT[s.repeat], action: cycle("repeat", Object.keys(REPEAT)) },
      { label: "Clicker", value: () => (s.clicker ? "On" : "Off"), action: () => this.set("clicker", !s.clicker) },
      { label: "Backlight", value: () => (s.backlight === "10s" ? "10 Seconds" : "Always On"), action: cycle("backlight", ["10s", "always"]) },
      { label: "Finish", value: () => BODIES[s.body], action: cycle("body", Object.keys(BODIES)) },
      {
        label: "Reset Settings",
        arrow: false,
        action: () =>
          this.push(
            new MenuView(this, "Reset Settings", [
              { label: "Cancel", arrow: false, action: () => this.pop() },
              {
                label: "Reset",
                arrow: false,
                action: () => {
                  Object.keys(DEFAULTS).forEach((k) => this.set(k, DEFAULTS[k]))
                  this.engine.setVolume(DEFAULTS.volume)
                  this.pop()
                },
              },
            ])
          ),
      },
    ]
  }
}
