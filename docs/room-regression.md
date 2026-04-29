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
- Open-button guard:
  - No open action when the last call is self, the last caller is missing, or fewer than 2 players are online.

## Release Notes

- 2026-04-23: See `docs/2026-04-23-发布前房间逻辑与UI沉淀.md` for the full room logic and UI decision record.
