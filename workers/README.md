# Sunny Together Backend

Cloudflare Workers + Durable Objects backend for Sunny Together.

One Durable Object is used per room. It stores room state, playback status,
participants, timestamp notes, public transcript references, and coordinates
WebSocket sync.

Production API:

```txt
https://podcast-together-api.sjm2000411.workers.dev
```

## Endpoints

- `POST /parse-text`
  - Parses supported podcast/audio links into `ContentData`.
  - Attempts RSS discovery and public transcript reference discovery.
- `POST /parse-transcript`
  - Input: `{ url, type }`
  - Output: `{ cues: { startMs, endMs, text }[] }`
  - Supports VTT, SRT, Podcasting 2.0 JSON, and untimed plain text metadata.
- `POST /room-operate`
  - `CREATE | ENTER | HEARTBEAT | LEAVE`
  - Routed to the room Durable Object.
  - `ENTER` and `HEARTBEAT` may include `clientState`.
- `POST /pt-service`
  - Returns `{ stamp: Date.now() }` for frontend clock calibration.
- `GET /ws?roomId=<id>`
  - WebSocket upgrade routed to the room Durable Object.

## WebSocket Protocol

Client messages:

- `FIRST_SEND`
- `SET_PLAYER`
- `HEARTBEAT`
- `SEND_REACTION`
- `ADD_NOTE`
- `SET_CONTENT`

Server messages:

- `CONNECTED`
- `NEW_STATUS`
- `HEARTBEAT`
- `REACTION`
- `NOTE`
- `NOTES`
- `NEW_CONTENT`

`SET_PLAYER` may include a pause `reason`.

`SEND_REACTION` broadcasts a floating reaction and also creates a timestamp
`NOTE` at the sender's current playback position.

## Participant State

Participants may report:

- `visible`
- `hidden`
- `idle`
- `reconnecting`

The Durable Object stores:

- `clientState`
- `lastActiveStamp`
- `lastVisibleStamp`

The frontend uses these fields to warn active listeners when someone may have
fallen out of sync.

## Room Lifecycle

- Room TTL: 12 hours
- Stale participants are pruned after roughly 50 seconds without heartbeat.
- Empty rooms that were playing are auto-paused by Durable Object alarms.
- Replacing content resets playback, pause reason, and timestamp notes.

## Local Development

```sh
cd workers
npm install
npx wrangler dev --port 8787 --local-protocol http
```

For frontend local proxying, set:

```env
VITE_API_URL=/pt-api
VITE_WEBSOCKET_URL=/pt-api/ws
```

## Validation

```sh
npm run typecheck
```

Production transcript smoke:

```sh
node -e "fetch('https://podcast-together-api.sjm2000411.workers.dev/parse-transcript',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://gist.githubusercontent.com/samdutton/ca37f3adaf4e23679957b8083e061177/raw/sample.vtt',type:'text/vtt'})}).then(r=>r.text()).then(console.log)"
```

## Deploy

```sh
cd workers
npx wrangler deploy
```
