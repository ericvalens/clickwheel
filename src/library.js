// Original songs. Each one is a recipe the synth in audio.js plays live.

export const ALBUMS = [
  { id: "first-click", title: "First Click", artist: "Pocket Orchestra", genre: "Chiptune" },
  { id: "coastline", title: "Coastline FM", artist: "Ventura Night Drive", genre: "Synthwave" },
  { id: "small-biz", title: "Small Biz Beats", artist: "Main Street Sound System", genre: "Lo-fi" },
  { id: "low-battery", title: "Low Battery Lullabies", artist: "Pocket Orchestra", genre: "Ambient" },
]

const B = {
  eighths: "x.x.x.x.x.x.x.x.",
  drive: "xxxxxxxxxxxxxxxx",
  synco: "x..x..x...x..x..",
  halves: "x.......x.......",
  quarters: "x...x...x...x...",
  walk: "x..x..5.x..o..5.",
}

export const SONGS = [
  { id: "hello-wheel", title: "Hello, Wheel", album: "first-click", bpm: 116, root: 60, scale: "major", prog: [0, 4, 5, 3], lead: "square", texture: "arp", drums: "pop", bass: B.eighths, seed: 11, swing: 0, density: 0.62 },
  { id: "thousand-songs", title: "A Thousand Songs", album: "first-click", bpm: 124, root: 55, scale: "mixolydian", prog: [0, 6, 3, 0], lead: "sawtooth", texture: "pad", drums: "four", bass: B.synco, seed: 23, swing: 0, density: 0.55 },
  { id: "click-track", title: "Click Track", album: "first-click", bpm: 132, root: 64, scale: "minor", prog: [0, 5, 2, 6], lead: "square", texture: "arp", drums: "pop", bass: B.drive, seed: 37, swing: 0, density: 0.5, grain: 1 },
  { id: "harbor-lights", title: "Harbor Lights at 2AM", album: "coastline", bpm: 92, root: 57, scale: "minor", prog: [0, 5, 3, 4], lead: "sawtooth", texture: "pad", drums: "drive", bass: B.eighths, seed: 41, swing: 0, density: 0.5 },
  { id: "pier-pressure", title: "Pier Pressure", album: "coastline", bpm: 104, root: 62, scale: "dorian", prog: [0, 3], lead: "sawtooth", texture: "arp", drums: "drive", bass: B.drive, seed: 53, swing: 0, density: 0.58 },
  { id: "backlight", title: "Backlight", album: "coastline", bpm: 100, root: 59, scale: "minor", prog: [0, 2, 6, 5], lead: "triangle", texture: "pad", drums: "four", bass: B.synco, seed: 67, swing: 0, density: 0.55 },
  { id: "matcha-sunrise", title: "Matcha Sunrise", album: "small-biz", bpm: 84, root: 60, scale: "major", prog: [0, 3, 2, 5], lead: "triangle", texture: "pad", drums: "lofi", bass: B.walk, seed: 71, swing: 0.2, density: 0.55 },
  { id: "fresh-cutz", title: "Fresh Cutz", album: "small-biz", bpm: 96, root: 58, scale: "dorian", prog: [0, 3], lead: "square", texture: "arp", drums: "lofi", bass: B.synco, seed: 83, swing: 0.14, density: 0.6 },
  { id: "taco-tuesday", title: "Taco Tuesday Shuffle", album: "small-biz", bpm: 128, root: 62, scale: "major", prog: [0, 3, 4, 3], lead: "square", texture: "arp", drums: "pop", bass: B.walk, seed: 97, swing: 0.1, density: 0.6 },
  { id: "sleep-mode", title: "Sleep Mode", album: "low-battery", bpm: 72, root: 63, scale: "major", prog: [0, 5, 3, 4], lead: "sine", texture: "pad", drums: "soft", bass: B.halves, seed: 101, swing: 0, density: 0.42, mix: 0.9 },
  { id: "ten-percent", title: "Ten Percent", album: "low-battery", bpm: 80, root: 61, scale: "minor", prog: [0, 5, 6, 4], lead: "triangle", texture: "arp", drums: "halftime", bass: B.quarters, seed: 113, swing: 0, density: 0.45 },
  { id: "charging", title: "Charging…", album: "low-battery", bpm: 90, root: 56, scale: "major", prog: [0, 4, 5, 3], lead: "sine", texture: "pad", drums: "soft", bass: B.quarters, seed: 127, swing: 0.08, density: 0.5 },
]

export const albumOf = (song) => ALBUMS.find((a) => a.id === song.album)
export const artistOf = (song) => albumOf(song).artist
export const genreOf = (song) => albumOf(song).genre

export const PLAYLISTS = [
  { title: "Late Night Drive", songs: ["harbor-lights", "backlight", "pier-pressure", "ten-percent", "sleep-mode"] },
  { title: "Morning Shift", songs: ["matcha-sunrise", "hello-wheel", "fresh-cutz", "taco-tuesday", "charging"] },
  { title: "Upbeat", filter: (s) => s.bpm >= 110 },
]

export function playlistSongs(p) {
  if (p.filter) return SONGS.filter(p.filter)
  return p.songs.map((id) => SONGS.find((s) => s.id === id))
}

// ---- album art, drawn as SVG ----

let uid = 0
const ART = {
  "first-click": (u) => `
    <rect width="100" height="100" fill="#f6ead7"/>
    <circle cx="50" cy="58" r="31" fill="#ff6a4d"/>
    <circle cx="50" cy="58" r="11.5" fill="#f6ead7"/>
    <text x="50" y="35.5" fill="#f6ead7" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="5.6" text-anchor="middle" letter-spacing=".6">MENU</text>
    <path d="M71.5 55l4 3-4 3zM75.5 55l4 3-4 3z" fill="#f6ead7"/>
    <path d="M28.5 55l-4 3 4 3zM24.5 55l-4 3 4 3z" fill="#f6ead7"/>
    <path d="M45 78.5l4 2.5-4 2.5zM51 78.5h1.6v5H51zM54 78.5h1.6v5H54z" fill="#f6ead7"/>
    <text x="8" y="13" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="8" fill="#2b2b2b">FIRST CLICK</text>
    <text x="8" y="19.5" font-family="Helvetica,Arial,sans-serif" font-size="4" fill="#2b2b2b" opacity=".65" letter-spacing=".4">POCKET ORCHESTRA</text>`,
  coastline: (u) => `
    <defs>
      <linearGradient id="sky${u}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1d1442"/><stop offset=".5" stop-color="#b43f7c"/><stop offset=".7" stop-color="#ff9a5c"/>
      </linearGradient>
      <linearGradient id="sun${u}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe66b"/><stop offset="1" stop-color="#ff4f86"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#sky${u})"/>
    <circle cx="50" cy="66" r="24" fill="url(#sun${u})"/>
    <g fill="#c94d7a"><rect y="62" width="100" height="1.4"/><rect y="66" width="100" height="2"/><rect y="70.2" width="100" height="2.6"/></g>
    <rect y="74" width="100" height="26" fill="#140d33"/>
    <g stroke="#ff7aa8" stroke-width=".6" opacity=".8">
      <path d="M0 78h100M0 83h100M0 89.5h100M0 97h100"/>
      <path d="M50 74L10 100M50 74L30 100M50 74L50 100M50 74L70 100M50 74L90 100"/>
    </g>
    <text x="50" y="15" fill="#fff" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="8.5" text-anchor="middle" letter-spacing="1.2">COASTLINE FM</text>
    <text x="50" y="21.5" fill="#ffd2e4" font-family="Helvetica,Arial,sans-serif" font-size="3.8" text-anchor="middle" letter-spacing="1">VENTURA NIGHT DRIVE</text>`,
  "small-biz": (u) => `
    <rect width="100" height="100" fill="#fff4e0"/>
    <g>${Array.from({ length: 7 }, (_, i) => `<rect x="${i * 14.3}" y="0" width="14.3" height="22" fill="${i % 2 ? "#fff" : "#e8483f"}"/><circle cx="${i * 14.3 + 7.15}" cy="22" r="7.15" fill="${i % 2 ? "#fff" : "#e8483f"}"/>`).join("")}</g>
    <rect x="14" y="38" width="72" height="44" rx="2" fill="#2e6f73"/>
    <rect x="18" y="42" width="38" height="36" fill="#9fd6d2"/>
    <rect x="60" y="42" width="22" height="40" fill="#24585b"/>
    <circle cx="64" cy="63" r="1.2" fill="#f2c230"/>
    <rect x="23" y="47" width="20" height="8" rx="1.5" fill="#e8483f"/>
    <text x="33" y="52.8" fill="#fff" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="5" text-anchor="middle">OPEN</text>
    <path d="M27 70h22" stroke="#2e6f73" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M30 70c0-6 3-9 8-9s8 3 8 9" fill="#f2c230"/>
    <text x="50" y="93" fill="#2b2b2b" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="7.4" text-anchor="middle">SMALL BIZ BEATS</text>`,
  "low-battery": (u) => `
    <rect width="100" height="100" fill="#121a3a"/>
    <g fill="#e9edf7">${[[12, 14], [24, 30], [40, 10], [86, 50], [16, 60], [90, 14], [8, 40], [60, 8], [78, 70], [30, 82]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 0.6 : 1}" opacity="${i % 2 ? 0.6 : 0.95}"/>`).join("")}</g>
    <circle cx="70" cy="28" r="13" fill="#f3e6b5"/><circle cx="76" cy="23" r="12" fill="#121a3a"/>
    <rect x="27" y="47" width="44" height="22" rx="3.5" fill="none" stroke="#e9edf7" stroke-width="2.4"/>
    <rect x="71.5" y="54" width="4" height="8" rx="1" fill="#e9edf7"/>
    <rect x="30.5" y="50.5" width="8" height="15" rx="1.2" fill="#ff4d4d"/>
    <text x="50" y="87" fill="#e9edf7" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="6.2" text-anchor="middle" letter-spacing=".5">LOW BATTERY</text>
    <text x="50" y="93.5" fill="#9aa6d6" font-family="Helvetica,Arial,sans-serif" font-size="4.4" text-anchor="middle" letter-spacing="1.2">LULLABIES</text>`,
}

export function art(albumId, label = "") {
  const u = `a${++uid}`
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">${ART[albumId](u)}</svg>`
}
