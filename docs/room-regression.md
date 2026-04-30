# Room Regression

Reusable room release gate for reconnect, resume, seat updates, and dice restore flows.

## Commands

- Focused room regression: `npm run test:room-regression`
- Full release regression: `npm test`

## What This Covers

- Fixed 8-seat room rendering and seat swap position changes.
- Foreground/background recovery for self dice rolling and reveal UI.
- Cached session resume, socket reconnect, and automatic room rejoin.
- Duplicate reconnect suppression across `onShow`, `close`, and `error`.
- Pending leave cleanup without accidental reconnect.
- Direct private dice restoration after reconnect or state recovery.
- Explicit leave during an active round:
  - If only one online player remains, the round aborts back to `ready`.
  - If the leaving player is on turn, the server auto-advances that turn quickly.
- Settlement continuation fallback:
  - Loser online: loser starts the next round.
  - Loser offline/removed: owner can start the next round.
- Waiting-player admission:
  - Mid-game joiners stay in `waitingPlayers`.
  - Owner admits them to seats in `ready` or `ended`.
  - Offline waiting players cannot be admitted and do not block the next round.
  - When online waiting players exist after settlement, owner must arrange seats before restarting.
  - Waiting-player admission preserves account identity fields.
- Theme assets:
  - Premium room theme assets live under `miniprogram/pages/room/assets/room-themes/`.
  - Room audio assets live under `miniprogram/pages/room/assets/audio/`.
  - Server theme manifest, create-room preview, room runtime theme class, and self dice asset mapping stay aligned.
  - Remote manifest loading can fall back to bundled room-subpackage assets without blocking room entry.
- Turn countdown:
  - Calling-state broadcasts refresh `turnDeadlineTs` before clients reset countdown.
- Nickname validation:
  - Both server and miniapp accept 1-12 characters and share the same rejection copy.
- Open-button guard:
  - No open action when the last call is self, the last caller is missing, or fewer than 2 players are online.

## Release Notes

- 2026-05-01: See `docs/2026-05-01-房间主题与近期迭代沉淀.md` for room theme expansion rules and recent room-flow details.
- 2026-04-23: See `docs/2026-04-23-发布前房间逻辑与UI沉淀.md` for the full room logic and UI decision record.
