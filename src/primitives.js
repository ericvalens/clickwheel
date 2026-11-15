// Two UI SDK primitives: the click wheel, and the player an agent can drive.
import { bindDrag, bindHold, definePrimitive } from "@ui-sdk/core"
import { sectorOf } from "@ui-sdk/core/gesture"
import { createParts, wrappedButton } from "@ui-sdk/web"

// sectorOf numbers four wedges from the top, clockwise.
const SECTORS = ["menu", "next", "play", "prev"]
const BUTTONS = [...SECTORS, "select"]
const TAP_DEGREES = 8

// ---------------------------------------------------------------------------
// <click-wheel>: turn it to scroll, tap a quadrant, hold play / skip / menu.
// ---------------------------------------------------------------------------

export const clickwheel = definePrimitive({
  name: "clickwheel",
  options: {
    step: "number",
    locked: "boolean",
    onTurn: "callback",
    onPress: "callback",
    onHold: "callback",
    onBlocked: "callback",
  },
  state: () => ({ pressed: null, turning: false }),
  api: (context) => {
    let stop
    let held = false
    context.onDestroy(() => stop?.())
    const opts = () => context.options()

    const api = {
      /** Turn the wheel by a number of clicks. Positive is clockwise (down a list). */
      turn(clicks = 1) {
        const n = Math.trunc(Number(clicks))
        if (!n) return false
        if (opts().locked) {
          opts().onBlocked?.("turn")
          return false
        }
        opts().onTurn?.(n)
        return true
      },
      /** Press a button: menu, next, play, prev or select (the center). */
      press(button) {
        const name = String(button).toLowerCase()
        if (!BUTTONS.includes(name)) throw new Error(`No ${button} button. Buttons: ${BUTTONS.join(", ")}.`)
        if (opts().locked) {
          opts().onBlocked?.(name)
          return false
        }
        opts().onPress?.(name)
        return true
      },
      held(name, count) {
        held = true
        if (opts().locked) return false
        opts().onHold?.(name, { reason: "hold", count })
      },
      ringDown(event, el) {
        if (event.button !== 0) return
        stop?.()
        held = false
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const angle = (x, y) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI
        // bindDrag captures the pointer on the ring, so the center's own click
        // never arrives: the ring reads a tap on the center too.
        const onCenter = !!event.target.closest?.("click-wheel-center")
        const sector = onCenter ? -1 : sectorOf(event.clientX - cx, event.clientY - cy, 4, { deadZone: r.width * 0.21 })
        let last = angle(event.clientX, event.clientY)
        let acc = 0
        let travel = 0
        context.store.set({ pressed: onCenter ? "select" : SECTORS[sector] ?? null })
        stop = bindDrag(el, event, {
          onMove: ({ x, y }) => {
            const a = angle(x, y)
            let d = a - last
            if (d > 180) d -= 360
            if (d < -180) d += 360
            last = a
            acc += d
            travel += Math.abs(d)
            if (travel > TAP_DEGREES && !context.store.get().turning) context.store.set({ pressed: null, turning: true })
            const step = opts().step || 15
            let n = 0
            while (acc >= step) (acc -= step), n++
            while (acc <= -step) (acc += step), n--
            if (n) api.turn(n)
          },
          onEnd: (_event, canceled) => {
            stop = undefined
            context.store.set({ pressed: null, turning: false })
            if (canceled || held || travel > TAP_DEGREES) return
            if (onCenter) api.press("select")
            else if (sector >= 0) api.press(SECTORS[sector])
          },
        })
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-pressed": state.pressed ?? undefined,
        "data-turning": state.turning ? "" : undefined,
      }),
    }),
    ring: slot({
      on: { pointerdown: (event, { el, api }) => api.ringDown(event, el) },
    }),
    // The four labels are real buttons for the keyboard and screen readers.
    // A pointer tap is read from the ring's wedge instead, so a click that
    // follows a pointer (event.detail > 0) is ignored here.
    button: slot({
      props: { name: "string" },
      role: "button",
      focus: "native",
      press: ({ api, props }, event) => {
        if (event && event.detail > 0) return
        api.press(props.name)
      },
      bind: (el, part) => {
        const name = part.props.name
        if (name === "menu" || name === "play") {
          return bindHold(el, { delay: 900, onHold: () => part.api.held(name, 1) })
        }
        // Hold ⏭ / ⏮ to scrub, like the real thing.
        return bindHold(el, { delay: 450, repeat: 140, onHold: ({ count }) => part.api.held(name, count) })
      },
    }),
    center: slot({
      role: "button",
      focus: "native",
      press: ({ api }, event) => {
        if (event && event.detail > 0) return
        api.press("select")
      },
    }),
  }),
  agent: { actions: ["turn"] },
})

createParts(clickwheel, {
  root: { tag: "click-wheel", api: ["turn", "press"] },
  ring: "click-wheel-ring",
  button: { tag: "click-wheel-button", target: wrappedButton, display: "contents" },
  center: { tag: "click-wheel-center", target: wrappedButton, display: "contents" },
})

// ---------------------------------------------------------------------------
// <music-player>: what an agent sees. Its value is the song that's loaded,
// and its actions play music without going through the menus.
// ---------------------------------------------------------------------------

export const musicPlayer = definePrimitive({
  name: "music-player",
  options: { controller: "value" },
  state: () => ({ value: "", playing: false, volume: 0.75, items: [] }),
  api: (context) => {
    const c = () => {
      const controller = context.options().controller
      if (!controller) throw new Error("The player isn't ready yet.")
      return controller
    }
    return {
      /** Play a song, by its title or id. */
      setValue: (song) => c().playSong(song),
      play: () => c().play(),
      pause: () => c().pause(),
      next: () => c().skip(1),
      previous: () => c().skip(-1),
      /** Volume from 0 to 1. */
      setVolume: (v) => c().setVolume(Number(v)),
      shuffleAll: () => c().shuffleAll(),
      sync: (s) => context.store.set(s),
      isPlaying: () => context.store.get().playing,
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-playing": state.playing ? "" : undefined }),
    }),
  }),
  agent: {
    actions: ["setValue", "play", "pause", "next", "previous", "setVolume", "shuffleAll"],
    closed: true,
  },
})

createParts(musicPlayer, {
  root: { tag: "music-player", api: ["sync", "isPlaying", "setValue", "play", "pause", "next", "previous", "setVolume", "shuffleAll"] },
})
