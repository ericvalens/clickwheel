# Clickwheel

Plain web components on Vercel's UI SDK (`@ui-sdk/web` + `@ui-sdk/core`), bundled with esbuild.

Before using ui-sdk, follow the `ui-sdk` skill (`.agents/skills/ui-sdk`) and read
`node_modules/@ui-sdk/web/docs/llms.txt`. To build a new component, also search
`node_modules/@ui-sdk/web/docs/core.md` by heading, and read `rendering.md` next to it.

For visual or accessibility passes, run the `web-design-guidelines` skill over
`public/index.html`, `public/styles.css` and `src/`.

- `npm run dev` serves http://localhost:4321. `npm test` runs the agent and wheel tests.
- The player is scaled with `--s`, set by the inline script in `public/index.html`.
  Check any visual change at a fractional scale, not only at 1.
