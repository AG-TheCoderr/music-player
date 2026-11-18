# Sonic Studio Pro

A browser music player with a 10-band equalizer, audio effects, a live visualiser, a playlist,
and YouTube playback. Built with Vite, React and the Web Audio API. Originally scaffolded with
[Lovable](https://lovable.dev).

## Features

| Area | Details |
| --- | --- |
| Sources | Local files (drag and drop), direct audio URLs, iTunes previews, YouTube search and playback |
| Equalizer | 10 peaking bands (32 Hz to 16 kHz), presets, one curve per mode |
| Effects | Reverb, chorus, distortion and compressor, all in the Web Audio graph |
| Visualiser | Bars, wave and circular, driven by an `AnalyserNode` |
| Playlist | Drag to reorder, remove, clear, shuffle, repeat (none / one / all) |
| Shortcuts | Space, arrows, `M`, `S`, `R`, `N`, `P`, `1`-`5`, `?` |
| Persistence | Volume, EQ, effects, mode, shuffle, repeat and playlist survive a reload |
| OS controls | Media Session API |

## Getting started

```sh
npm install
npm run dev       # http://localhost:8080
npm run build     # production build into dist/
npm run preview   # serve the production build
npm run lint
npm test          # all six suites
```

### Configuration (optional)

The defaults point at the deployed Supabase project. To use your own, create `.env`:

```sh
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
```

Set function secrets with `supabase secrets set KEY=value`:

| Secret | Used by | Notes |
| --- | --- | --- |
| `YT_API_KEY` | `youtube-search` | Required for YouTube search. Without it, that search returns an error and iTunes results still work. |
| `ALLOWED_PROXY_HOSTS` | `audio-stream-proxy` | Optional comma-separated host allowlist. Empty means any public host. |

Local function development: `cp supabase/functions/.env.example supabase/functions/.env`, then
`supabase functions serve`.

## Architecture

```
src/
├── App.tsx                          router and error boundary
├── components/
│   ├── MusicPlayer.tsx              page layout, track info, visualiser
│   ├── audio/
│   │   ├── AudioEngine.ts           Web Audio graph
│   │   ├── AudioPlayerProvider.tsx  store provider and actions
│   │   ├── playerStore.ts           external store and types
│   │   └── Visualizer.tsx           canvas renderers
│   ├── player/                      controls, EQ, effects, playlist, YouTube pane, shortcuts
│   └── search/MusicSearch.tsx
├── services/
│   ├── audioProxyService.ts         search and extraction API
│   ├── edgeFunctions.ts             Supabase edge function client
│   ├── preferences.ts               localStorage persistence
│   ├── youtubeController.ts         YouTube IFrame API wrapper
│   └── mediaSession.ts
supabase/functions/
├── audio-proxy/                     iTunes search, direct-audio extraction
├── audio-stream-proxy/              CORS and Range-preserving audio relay
└── youtube-search/                  YouTube Data API v3 search
```

### State

Playback position updates ten times a second, so state lives in an external store
(`playerStore.ts`) rather than a React context. Components subscribe to the slice they use:

```tsx
const currentTime = usePlayerSelector((state) => state.currentTime); // re-renders on ticks
const { play, pause } = usePlayerActions();                          // never re-renders
```

### Audio graph

```
source → EQ(10) → distortion → chorus → reverb → compressor → gain → analyser → destination
```

- Chorus: LFO-modulated delay with feedback and wet/dry mix.
- Reverb: convolver with a generated impulse response, rebuilt on a debounce while sliders move.
- Compressor: last stage, so summed wet and dry signal cannot clip.
- Analyser: feeds the visualiser. Its buffers are reused, so nothing is allocated per frame.

### YouTube

YouTube streams play through the official IFrame player. YouTube does not expose a
CORS-friendly audio stream, so the equalizer, effects and visualiser do not apply to YouTube.

## Tests

| Command | Checks |
| --- | --- |
| `npm run test:smoke` | Boots the app in jsdom, switches tabs, changes mode, adds a track |
| `npm run test:audio` | Graph wiring, ramps, impulse response, analyser buffer sizes |
| `npm run test:store` | Selectors re-render only when their data changes |
| `npm run test:prefs` | Preferences round trip and survive corrupt storage |
| `npm run test:edge` | Edge function client error mapping |
| `npm run test:color` | Colour parsing and fallbacks |

## Security

- `audio-stream-proxy` accepts only `http(s)` targets and rejects loopback, private, link-local,
  CGNAT, multicast and cloud metadata addresses. It has an optional host allowlist and an
  upstream timeout.
- The Supabase anon key is publishable and ships in the bundle. Never put a service-role key or
  `YT_API_KEY` in a `VITE_*` variable.
- All functions use `verify_jwt = false`, because an `<audio>` element cannot send auth headers.
  If you add authenticated features, enable JWT verification for those functions.

## Deployment

GitHub Pages: `.github/workflows/deploy-pages.yml` builds with `GITHUB_PAGES=true` (base path
`/music-player/`) and publishes `dist/` on every push to `main`.

Any static host works. The only requirement is an SPA fallback that serves `index.html` for
unknown paths. `netlify.toml` provides this for Netlify.
