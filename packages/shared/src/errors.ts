export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_FULL: "ROOM_FULL",
  PLAYER_NOT_IN_ROOM: "PLAYER_NOT_IN_ROOM",
  FORBIDDEN: "FORBIDDEN",
  LOCKED: "LOCKED",
  NOT_YOUR_TURN: "NOT_YOUR_TURN",
  INVALID_PHASE: "INVALID_PHASE",
  INVALID_CALL: "INVALID_CALL",
  INVALID_CONFIG: "INVALID_CONFIG",
  INVALID_OPEN_TARGET: "INVALID_OPEN_TARGET",
  SEAT_CONFLICT: "SEAT_CONFLICT",
  DICE_ALREADY_ROLLED: "DICE_ALREADY_ROLLED",
  TARGET_NOT_FOUND: "TARGET_NOT_FOUND",
  EMPTY_TARGETS: "EMPTY_TARGETS",
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class GameError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "GameError";
    this.code = code;
  }
}
