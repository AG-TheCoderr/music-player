# Sonic Studio Pro

A browser based music player with a real-time Web Audio processing chain, a 10-band equalizer,
audio effects, a live visualiser, a drag-and-drop playlist and YouTube playback.

> Originally scaffolded with [Lovable](https://lovable.dev). The app is a static SPA backed by
> Supabase Edge Functions for search and CORS-safe audio streaming.

---

## Features

| Area | Details |
| --- | --- |
| **Sources** | Local files (drag & drop), direct audio URLs, iTunes preview catalogue, YouTube Data API results, YouTube IFrame playback |
| **Equalizer** | 10 peaking biquad bands (32 Hz – 16 kHz) with presets and per-mode curves |
| **Effects** | Reverb (generated impulse response), chorus (LFO modulated delay), distortion (waveshaper) and a dynamics compressor — all live in the audio graph |
| **Visualiser** | Canvas based bars / wave / circular renderers driven by an `AnalyserNode` |
| **Playlist** | Drag-and-drop reordering, remove, clear, shuffle and repeat (none / one / all) |
| **Modes** | Normal, Vocal Enhance, Instrument Focus, Bass Boost — each applies its own EQ curve |
| **Shortcuts** | Full keyboard control (space, arrows, `M`, `S`, `R`, `N`, `P`, `1`–`5`, `?`) |
| **Persistence** | Volume, EQ, effects, mode, shuffle/repeat and the playlist survive a reload |
| **OS integration** | Media Session API for lock screen / notification controls |
| **Resilience** | Error boundary, real error messages, and a clean fallback when a source cannot be played |

---

## Tech stack

- **Vite 5** + **React 18** + **TypeScript**
- **Tailwind CSS** with a custom `audio-*` theme (shadcn/ui primitives)
- **Web Audio API** for all DSP (`src/components/audio/AudioEngine.ts`)
- **@dnd-kit** for playlist reordering
- **YouTube IFrame API** for YouTube playback
- **Supabase Edge Functions (Deno)** for search + CORS/Range-safe audio proxying

No runtime dependency is shipped that the app does not actually use - the Supabase SDK, React
Query and the second toast library were all removed once their usage was replaced.

---

## Getting started

```sh
npm install
npm run dev      # http://localhost:8080
npm run build    # production build into dist/
npm run preview  # serve the production build
npm run lint
npm test         # all four headless suites
```

### Environment variables (optional)

The app works without any configuration — the defaults point at the deployed Supabase project.
To use your own project, create a `.env` file:

```sh
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
```

### Backend configuration

Supabase function secrets (set them with `supabase secrets set KEY=value`):

| Secret | Used by | Required |
| --- | --- | --- |
| `YT_API_KEY` | `youtube-search` | Only for YouTube search. Without it the function returns a clear error and the rest of the app keeps working. |
| `ALLOWED_PROXY_HOSTS` | `audio-stream-proxy` | Optional comma separated allowlist. When empty, any public host may be proxied. |

Local function development:

```sh
cp supabase/functions/.env.example supabase/functions/.env
supabase functions serve
```

---

## Architecture

```
src/
├── App.tsx                     router + error boundary
├── components/
│   ├── MusicPlayer.tsx         main shell (tabs, track info, visualiser)
│   ├── ErrorBoundary.tsx       catches render errors
│   ├── audio/
│   │   ├── AudioEngine.ts      Web Audio graph
│   │   ├── AudioPlayerProvider.tsx  store provider + actions
│   │   ├── playerStore.ts      the external store and its types
│   │   └── Visualizer.tsx      canvas renderers
│   ├── player/                 PlayerControls, Equalizer, EffectsPanel, FileLoader, ModeSelector, PlaylistPanel, YouTubePane, KeyboardShortcuts
│   ├── search/MusicSearch.tsx  search UI
│   └── ui/                     shadcn/ui primitives (only the ones in use)
├── services/
│   ├── audioProxyService.ts    search / extract API
│   ├── edgeFunctions.ts        tiny Supabase edge function client
│   ├── preferences.ts          localStorage persistence
│   ├── youtubeController.ts    YouTube IFrame API wrapper
│   └── mediaSession.ts         OS media controls
└── integrations/supabase/config.ts  project URL + anon key

supabase/functions/
├── audio-proxy/               search (iTunes previews) + direct-audio URL extraction
├── audio-stream-proxy/        CORS + Range preserving audio relay (SSRF protected)
└── youtube-search/            YouTube Data API v3 search
```

### State: a subscribable store, not a context

The playback position updates ten times a second. Keeping that in a React context would
re-render every consumer on every tick, so the player state lives in a small external store
(`playerStore.ts`) and components subscribe to the slice they use:

```tsx
const currentTime = usePlayerSelector((state) => state.currentTime);  // re-renders on ticks
const { play, pause } = usePlayerActions();                           // never re-renders
```

`usePlayerSelector` caches the selected value, so a component only re-renders when the data it
actually uses changes. `usePlayerActions` returns a stable object, so action-only components
never re-render at all. `scripts/player-store-test.mjs` asserts this behaviour.

### The audio graph

```
source → EQ(10) → distortion → chorus(dry/wet) → reverb(dry/wet) → compressor → gain → analyser → destination
```

- The **chorus** is an LFO modulated delay with feedback and wet/dry mixing.
- The **reverb** is a convolver fed by a generated impulse response (regenerated on a debounce
  while the sliders move).
- The **compressor** runs last as a glue/safety stage, so the wet and dry paths summing above
  1.0 cannot clip.
- The **analyser** feeds the visualiser; the analyser data buffers are reused, so the renderer
  does not allocate 60 arrays per second.

`AudioEngine` owns the whole graph. `AudioPlayerProvider` owns the state and calls into the
engine; components never touch Web Audio directly.

### YouTube playback

YouTube streams are played by the official IFrame player (a `<div id="yt-player-root">` rendered
by the **YouTube** tab) because YouTube does not expose a CORS-friendly audio stream. That
means YouTube playback **bypasses** the equalizer, the effects and the visualiser — the UI
states this explicitly instead of silently showing stale data.

---

## Performance

| | Before | After |
| --- | --- | --- |
| Single JS bundle | 622 kB (190 kB gzip) | split into cached chunks |
| App code chunk | 622 kB | 89 kB (25 kB gzip) |
| Runtime dependencies | 49 | 20 |
| Vendored UI components | 55 | 14 |

The build is split with `manualChunks` (react / radix / dnd / icons / utils) and the heavy
panels (equalizer, effects, playlist) are loaded on demand.

---

## Tests

```sh
npm test              # all suites
npm run test:smoke    # boots the real app in jsdom and drives the UI
npm run test:audio    # asserts the Web Audio graph is wired correctly
npm run test:store    # asserts the store only re-renders what it must
npm run test:prefs    # asserts preferences round trip and survive corruption
```

`test:audio` locks down the chain that used to be broken — the reverb and chorus nodes are
created *and connected*, with the right wet/dry gains, LFO modulation and generated impulse
response. `test:smoke` renders the app, switches tabs, changes the audio mode, adds a track to
the playlist and fails on any console error.

---

## Security notes

- `audio-stream-proxy` validates every target: only `http(s)`, no loopback / private / link-local
  / CGNAT / multicast addresses, no cloud metadata endpoints, optional host allowlist and an
  upstream timeout. It is not an open relay into a private network.
- The Supabase anon key is a *publishable* credential and is expected to live in the client bundle.
  Do **not** put service-role keys or `YT_API_KEY` in `VITE_*` variables — those end up in the
  shipped JavaScript.
- All three functions are deployed with `verify_jwt = false` so that the browser can call the
  audio proxy directly from an `<audio>` element (which cannot send custom headers). If you add
  authenticated features, flip `verify_jwt` to `true` for those functions and pass the JWT
  through the edge function client.

---

## Deployment

Netlify (`netlify.toml`):

```sh
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Any static host works — the app is fully client side, the SPA fallback rule is the only
requirement.
