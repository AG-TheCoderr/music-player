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
| **OS integration** | Media Session API for lock screen / notification controls |
| **PWA friendly** | Responsive layout, no server-side rendering, no build-time backend requirement |

---

## Tech stack

- **Vite 5** + **React 18** + **TypeScript**
- **Tailwind CSS** with a custom `audio-*` theme (shadcn/ui primitives)
- **Web Audio API** for all DSP (`src/components/audio/AudioEngine.ts`)
- **@dnd-kit** for playlist reordering
- **YouTube IFrame API** for YouTube playback
- **Supabase Edge Functions (Deno)** for search + CORS/Range-safe audio proxying

---

## Getting started

```sh
npm install
npm run dev      # http://localhost:8080
npm run build    # production build into dist/
npm run preview  # serve the production build
npm run lint
npm test         # headless smoke test + audio graph assertions
```

### Tests

```sh
npm test              # both suites
npm run test:smoke    # boots the real app in jsdom and drives the UI
npm run test:audio    # asserts the Web Audio graph is wired correctly
```

`test:audio` locks down the chain that used to be broken — the reverb and chorus nodes are
created *and connected*, with the right wet/dry gains, LFO modulation and generated impulse
response. `test:smoke` renders the app, switches tabs, changes the audio mode, adds a track to
the playlist and fails on any console error.

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
├── App.tsx                     router + providers + error boundary
├── components/
│   ├── MusicPlayer.tsx         main shell (tabs, track info, visualiser)
│   ├── ErrorBoundary.tsx       catches render errors
│   ├── audio/
│   │   ├── AudioEngine.ts      Web Audio graph (EQ → compressor → distortion → chorus → reverb → gain → analyser)
│   │   ├── AudioPlayerProvider.tsx  single source of truth for player state
│   │   └── Visualizer.tsx      canvas renderers
│   ├── player/                 PlayerControls, Equalizer, EffectsPanel, FileLoader, ModeSelector, PlaylistPanel, YouTubePane
│   ├── search/MusicSearch.tsx  search UI
│   └── ui/                     shadcn/ui primitives
├── services/
│   ├── audioProxyService.ts    Supabase function client
│   ├── youtubeController.ts    YouTube IFrame API wrapper
│   └── mediaSession.ts         OS media controls
└── integrations/supabase/      Supabase client + generated types

supabase/functions/
├── audio-proxy/               search (iTunes previews) + direct-audio URL extraction
├── audio-stream-proxy/        CORS + Range preserving audio relay (SSRF protected)
└── youtube-search/            YouTube Data API v3 search
```

### The audio graph

```
source → EQ(10) → compressor → distortion → chorus(dry/wet) → reverb(dry/wet) → master gain → analyser → destination
```

`AudioEngine` owns the whole graph. `AudioPlayerProvider` owns the React state and calls into
the engine; components never touch Web Audio directly.

### YouTube playback

YouTube streams are played by the official IFrame player (a hidden `<div id="yt-player-root">`
rendered by the **YouTube** tab) because YouTube does not expose a CORS-friendly audio stream.
That means YouTube playback **bypasses** the equalizer, the effects and the visualiser — the UI
states this explicitly instead of silently showing stale data.

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
  through `supabase.functions.invoke`.

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
