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
