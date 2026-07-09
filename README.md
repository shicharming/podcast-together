# Sunny Together

Sunny Together is a listen-together web app for podcasts and public audio links.
It creates a shared room where listeners can play, pause, react, add timestamps,
switch episodes, and optionally view public captions in sync.

Production:

- Frontend: https://listen.jiaminshi.com
- Backend API: https://podcast-together-api.sjm2000411.workers.dev

## What It Supports

- Xiaoyuzhou episode links
- Apple Podcasts links, including JP / CA / CN / US regions
- Public podcast pages that expose audio or RSS metadata
- WeChat audio article links
- SSPAI / podcast pages
- Direct public `mp3` / `m4a` URLs
- Public RSS transcripts via Podcasting 2.0 `<podcast:transcript>`

Spotify and Pocket Casts app-only transcripts are not read unless the creator
publishes them into a public RSS feed.

## Current Features

- No account required
- Shared playback rooms
- Cloudflare Workers + Durable Objects backend
- Live WebSocket playback sync
- Mobile recovery after browser background / inactive state
- Listener inactive status hints
- Pause reasons, including waiting for someone to return
- Emoji reactions, also saved as timestamp notes
- Timestamp notes that can be clicked to jump
- Replace the current audio inside a room
- Optional captions per listener
- Chinese / Japanese / English UI based on browser language
- Local nickname memory
- A Pomodoro-style room interface that keeps all listening controls available

## Captions

Sunny Together only uses public transcripts for now. It does not generate AI
transcripts.

Supported transcript formats:

- `text/vtt`
- `application/x-subrip` / SRT
- `application/json`
- `text/plain` as untimed transcript metadata

Captions are loaded only when a listener enables them. The setting is local to
that browser and is not synchronized to other listeners.

## Architecture

The frontend is a Vite + Vue app. The production build uses:

```env
VITE_API_URL=https://podcast-together-api.sjm2000411.workers.dev
VITE_WEBSOCKET_URL=wss://podcast-together-api.sjm2000411.workers.dev/ws
```

The backend runs on Cloudflare Workers. Each room is coordinated by a Durable
Object, which stores room state, participants, playback status, timestamp notes,
and public transcript references.

## Development

Install dependencies from the repo root:

```sh
pnpm install
```

Run the frontend:

```sh
pnpm dev
```

Run the backend locally:

```sh
cd workers
npm install
npx wrangler dev --port 8787 --local-protocol http
```

Build frontend:

```sh
pnpm build
```

Typecheck backend:

```sh
cd workers
npm run typecheck
```

## Deployment

Deploy backend:

```sh
cd workers
npx wrangler deploy
```

Deploy frontend:

```sh
pnpm build
npx wrangler pages deploy dist --project-name podcast-together
```

After deployment, verify the built frontend includes the production backend URL:

```sh
rg "podcast-together-api.sjm2000411.workers.dev" dist
```

## Smoke Test

Recommended production smoke:

1. Open https://listen.jiaminshi.com
2. Paste a supported episode URL.
3. Create a room.
4. Open the room in a second browser or device.
5. Test play / pause sync.
6. Test reaction sync and timestamp creation.
7. Background one browser, resume it, and confirm playback catches up.
8. Enable captions on one device and confirm the setting stays local.
9. Confirm the Pomodoro-style room interface still exposes playback, captions,
   reactions, timestamps, replace audio, share, and leave controls.

## Recent Decisions

- Backend remains on Cloudflare Workers + Durable Objects.
- Browser inactive recovery uses HTTP state refresh plus WebSocket reconnect.
- If autoplay is blocked, the app shows a resume button instead of forcing audio.
- Emoji reactions are also saved as timestamp notes.
- The room page always uses a Pomodoro-style interface; there is no separate
  discreet-interface toggle.
- Captions use public RSS transcript references only; no AI transcript generation.

## Handoff Notes

- Production Worker version from the latest deploy: `e1a23695-235e-4ea1-a9de-1d0aad2914de`
- Latest verified Pages preview: https://eaa354b2.podcast-together-os6.pages.dev
- Production custom domain is configured as https://listen.jiaminshi.com
- Production API smoke for `/parse-transcript` passed with a public VTT fixture.
- Room smoke passed for create / enter / participant state / WebSocket reaction /
  reaction-created timestamp note.

## License

MIT
