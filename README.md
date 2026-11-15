# Clickwheel

A pocket music player with a working click wheel, built with Web Components and
[Vercel's UI SDK](https://ui-sdk.dev) — no framework. Every song is synthesized
live in the browser with Web Audio, so there are no audio files at all.

- **The wheel** is a UI SDK primitive (`src/primitives.js`): `bindDrag` follows
  the finger around the ring, `sectorOf` turns a tap into MENU / ⏭ / ⏯ / ⏮, and
  `bindHold` adds hold-⏯-to-sleep, hold-⏭⏮-to-scrub and hold-MENU for the backlight.
- **Menus** use `createTypeahead` (type to jump) and `announce` for screen readers.
- **Agents** can drive it: both primitives join UI SDK's agent bridge, and
  browsers with WebMCP get `snapshot` / `query` / `act` tools. From the console:

  ```js
  await agent.act({ steps: [{ ref: "Clickwheel", action: "setValue", args: ["Pier Pressure"] }] })
  ```

## Develop

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # bundles src/ into public/app.js
```
