# Sonic Studio Pro

A browser music player with a 31-band equalizer, audio effects, a live visualiser and a playlist.
Built with Vite, React and the Web Audio API.

## Features

| Area | Details |
| --- | --- |
| Sources | Local files (drag and drop), direct audio URLs, catalogue search (iTunes previews) |
| Equalizer | 31 third-octave bands (20 Hz to 20 kHz), 13 presets, gain range of ±6, ±12 or ±24 dB, bandwidth (Q) control |
| Effects | Reverb, chorus, distortion and compressor, all in the Web Audio graph |
| Visualiser | Bars, wave and circular, driven by an `AnalyserNode` |
| Playlist | Reorder, remove, clear, shuffle, repeat (none / one / all) |
| Shortcuts | Space, arrows, `J`/`L`, `M`, `S`, `R`, `N`, `P`, `1`-`4`, `?` |
| Persistence | Volume, equalizer, effects, mode, shuffle, repeat and playlist survive a reload |
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

Function secrets are set with `supabase secrets set KEY=value`:

| Secret | Used by | Notes |
| --- | --- | --- |
| `ALLOWED_PROXY_HOSTS` | `audio-stream-proxy` | Optional comma-separated host allowlist. Empty means any public host. |

## Architecture

```
src/
├── App.tsx                          router and error boundary
├── components/
│   ├── MusicPlayer.tsx              layout, track info, visualiser
│   ├── audio/
│   │   ├── AudioEngine.ts           Web Audio graph
│   │   ├── AudioPlayerProvider.tsx  store provider and actions
│   │   ├── equalizer.ts             bands, presets and gain helpers
│   │   ├── playerStore.ts           external store and types
│   │   └── Visualizer.tsx           canvas renderers
│   ├── player/                      controls, equalizer, effects, playlist, shortcuts
│   └── search/MusicSearch.tsx
├── services/
│   ├── audioProxyService.ts         search API
│   ├── edgeFunctions.ts             Supabase edge function client
│   ├── preferences.ts               localStorage persistence
│   └── mediaSession.ts
supabase/functions/
├── audio-proxy/                     iTunes search
└── audio-stream-proxy/              CORS and Range-preserving audio relay
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
source → EQ(31) → distortion → chorus → reverb → compressor → gain → analyser → destination
```

- Equalizer: peaking filters at the ISO third-octave centres. Gains are clamped to the selected
  range and to ±24 dB in the engine. Bandwidth changes ramp every band's Q.
- Chorus: LFO-modulated delay with feedback and wet/dry mix.
- Reverb: convolver with a generated impulse response, rebuilt on a debounce while sliders move.
- Compressor: last stage, so summed wet and dry signal cannot clip.
- Analyser: feeds the visualiser. Its buffers are reused, so nothing is allocated per frame.

## Tests

| Command | Checks |
| --- | --- |
| `npm run test:smoke` | Boots the app in jsdom, switches tabs, changes mode, adds a track, counts equalizer bands |
| `npm run test:audio` | Graph wiring, ramps, band layout, impulse response, analyser buffer sizes |
| `npm run test:store` | Selectors re-render only when their data changes |
| `npm run test:prefs` | Preferences round trip, band layout checks, corrupt storage |
| `npm run test:edge` | Edge function client error mapping and search |
| `npm run test:color` | Colour parsing and fallbacks |

## Security

- `audio-stream-proxy` accepts only `http(s)` targets and rejects loopback, private, link-local,
  CGNAT, multicast and cloud metadata addresses. It has an optional host allowlist and an
  upstream timeout.
- The Supabase anon key is publishable and ships in the bundle. Never put a service-role key in a
  `VITE_*` variable.
- Functions use `verify_jwt = false`, because an `<audio>` element cannot send auth headers.
  If you add authenticated features, enable JWT verification for those functions.

## Deployment

GitHub Pages: `.github/workflows/deploy-pages.yml` builds with `GITHUB_PAGES=true` (base path
`/music-player/`) and publishes `dist/` on every push to `main`.

Any static host works, as long as unknown paths serve `index.html`. `netlify.toml` provides this
for Netlify.
