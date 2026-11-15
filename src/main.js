import "./primitives.js"
import { createAgent, registerTools } from "@ui-sdk/web/agent"
import { App } from "./app.js"

const root = document.querySelector("music-player")
const app = new App(root)
root.controller = app.controller()
app.sync()
Object.assign(window, { clickwheel: app })

// Agents: the wheel and the player both join UI SDK's agent bridge. Browsers
// with WebMCP get snapshot / query / act tools; anyone can try it from the
// console:
//   await agent.act({ steps: [{ ref: "Clickwheel", action: "setValue", args: ["Pier Pressure"] }] })
const agent = createAgent()
Object.assign(window, { agent })

// Some WebMCP builds return nothing from registerTool, where UI SDK 0.1 beta
// expects a promise. Normalize it so every tool registers.
const mc = document.modelContext
if (mc?.registerTool) {
  const register = mc.registerTool.bind(mc)
  try {
    mc.registerTool = (...args) => {
      try {
        return Promise.resolve(register(...args))
      } catch (error) {
        return Promise.reject(error)
      }
    }
  } catch {}
}
try {
  registerTools(agent, { allow: () => true })
} catch (error) {
  console.warn("WebMCP tools weren't registered:", error)
}
