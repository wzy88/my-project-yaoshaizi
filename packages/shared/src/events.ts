import type { ClientEventName, ServerEventName } from "./types.js";

export const CLIENT_EVENTS: ClientEventName[] = [
  "room:create",
  "room:join",
  "room:rejoin",
  "room:config:update",
  "room:seat:set",
  "room:seat:swap",
  "room:waiting:admit",
  "history:list",
  "room:leave",
  "player:update",
  "game:start",
  "dice:roll",
  "dice:lock",
  "rolling:finish",
  "call:make",
  "open:request",
  "round:restart",
  "chat:send",
  "chat:list",
  "voice:transcript",
  "voice:upload",
  "voice:list",
  "voice:fetch",
  "system:heartbeat",
  "test:setSeed",
  "test:setNextDice"
];

export const SERVER_EVENTS: ServerEventName[] = [
  "room:state",
  "action:ack",
  "dice:privateResult",
  "open:result",
  "round:summary",
  "history:list",
  "voice:uploaded",
  "voice:list",
  "voice:fetched",
  "voice:transcribed",
  "chat:new",
  "chat:list",
  "system:error"
];
