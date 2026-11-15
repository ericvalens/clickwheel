import { readFileSync } from "node:fs"
import { beforeAll, expect, test } from "vitest"
import { createAgent } from "@ui-sdk/web/agent"

const tick = () => new Promise((r) => setTimeout(r, 0))
let agent
let app
let wheel

beforeAll(async () => {
  const html = readFileSync("public/index.html", "utf8")
  document.body.innerHTML = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7)
  agent = createAgent()
  await import("../src/primitives.js")
  const { App } = await import("../src/app.js")
  const root = document.querySelector("music-player")
  app = new App(root)
  root.controller = app.controller()
  app.sync()
  wheel = document.querySelector("click-wheel")
  await tick()
})

const row = () => document.querySelector(".list [aria-current]")?.textContent.replace("›", "").trim()
const title = () => document.querySelector(".st-title").textContent

test("an agent can find every control by name", () => {
  const entries = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more")
  for (const entry of entries) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const labels = entries.map((entry) => entry.label)
  for (const label of ["Clickwheel", "Click wheel", "Hold", "Battery"]) expect(labels, `${label} is missing`).toContain(label)
  const player = entries.find((entry) => entry.label === "Clickwheel")
  expect(player.actions).toEqual(expect.arrayContaining(["setValue", "play", "pause", "next", "previous", "setVolume", "shuffleAll"]))
})

test("the wheel scrolls the menu and the center opens a row", async () => {
  expect(row()).toBe("Music")
  wheel.api.turn(1)
  expect(row()).toBe("Extras")
  wheel.api.press("select")
  expect(title()).toBe("Extras")
  expect(row()).toBe("Clock")
  wheel.api.press("menu")
  expect(title()).toBe("Clickwheel")
  expect(() => wheel.api.press("eject")).toThrow(/No eject button/)
})

test("an agent turns the wheel and plays a song by title", async () => {
  const result = await agent.act({
    steps: [
      { ref: "Click wheel", action: "turn", args: [1] },
      { ref: "Clickwheel", action: "setValue", args: ["Pier Pressure"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(row() ?? title()).toBeTruthy()
  expect(title()).toBe("Now Playing")
  expect(document.querySelector(".np-meta .t").textContent).toBe("Pier Pressure")
  expect(agent.snapshot().find((entry) => entry.label === "Clickwheel").value).toBe("Pier Pressure")

  const missing = await agent.act({ steps: [{ ref: "Clickwheel", action: "setValue", args: ["Free Bird"] }] })
  expect(missing.ok).toBe(false)
})

test("the song position is a named progress bar", async () => {
  await tick()
  const bar = document.querySelector("ui-progress")
  expect(bar.getAttribute("role")).toBe("progressbar")
  expect(bar.getAttribute("aria-label")).toBe("Song position")
  expect(bar.getAttribute("aria-valuetext")).toMatch(/^0:00 of \d:\d\d$/)
})

test("Hold locks the wheel, for a person or an agent", async () => {
  wheel.api.press("menu")
  expect(title()).toBe("Clickwheel")
  const before = row()

  const result = await agent.act({ steps: [{ ref: "Hold", action: "setChecked", args: [true] }] })
  expect(result.ok, result.error?.message).toBe(true)
  await tick()
  expect(app.held).toBe(true)
  expect(wheel.api.turn(1)).toBe(false)
  expect(wheel.api.press("select")).toBe(false)
  expect(row()).toBe(before)
  expect(document.querySelector(".screen").classList.contains("flash-lock")).toBe(true)

  document.querySelector(".hold").click()
  await tick()
  expect(app.held).toBe(false)
  expect(wheel.api.turn(1)).toBe(true)
  expect(row()).not.toBe(before)
})
