# 摇骰子小程序（发布导向）代码骨架

## 目录结构

- `packages/shared`：前后端共用协议、错误码、规则函数
- `apps/server`：Node.js WebSocket 服务（房间状态机）
- `miniprogram`：微信原生小程序联调页
  - `pages/room/room`：正式房间页（圆桌布局）
  - `pages/index/index`：调试联调页
  - `pages/legal/privacy/privacy`：隐私政策页
  - `pages/legal/terms/terms`：用户协议页
- 支持在页面内修改并持久化 `wsUrl`（键名：`diceWsUrlV1`）

## 已实现能力

- 房间状态机：`ready -> diceRolling -> calling -> opening -> ended`
- 事件协议：建房、入房、开始、摇骰、叫牌、开牌、再来一局
- 断线重连：30秒重连窗口，`room:rejoin` + `resumeToken` 恢复会话
- 历史记录：开牌结算自动落盘，支持 `history:list` 分页查询
- 语音链路：小程序按住录音（需 `scope.record`）-> `voice:upload` -> 服务端落盘 -> `voice:list/voice:fetch` 播放
- 服务端权威判定：摇骰和开牌判定在服务端执行
- 小程序联调页：可直接连接 WebSocket 服务测试主链路

## 本地启动（Node.js 20+，Node.js v24 已适配）

```bash
npm install
npm run dev:server
```

服务默认地址：`ws://127.0.0.1:3000`
服务健康检查：`http://127.0.0.1:3000/health`
WebSocket 路径：`/ws`（示例：`ws://127.0.0.1:3000/ws`）

端口占用自动处理：
- 若 `3000` 被占用，服务会自动尝试 `3001`、`3002` ...（最多 10 次，可用 `PORT_RETRY_LIMIT` 调整）
- 控制台会打印最终监听端口

macOS 排查占用：
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill -15 <PID>
```

微信开发者工具代理模式（本机回环）：
```bash
HOST=127.0.0.1 PORT=3003 npm run dev:server
```
然后在小程序里填：`ws://127.0.0.1:3003/ws`

历史记录落盘目录：`apps/server/data/history/<roomId>.json`
语音落盘目录：`apps/server/data/voice/<roomId>/<playerId>/<fileId>.mp3`

## 小程序联调

1. 用微信开发者工具打开 `miniprogram` 目录。
2. 保持后端运行。
3. 在首页点击“连接服务器”，再进行“创建房间/加入房间”操作。

语音识别说明：
- 当前默认不启用 `WechatSI` 插件（避免未授权导致“模拟器启动失败”）。
- 房间语音叫骰仍可用：按住录音上传语音；未启用插件时会弹出“手动输入识别文本”作为兜底。
- 若你的小程序后台已授权该插件，可在 `miniprogram/app.json` 重新添加插件配置启用实时识别。

## 手机真机（推荐 WSS 隧道）

见：[手机真机联调-WSS隧道指南.md](/Users/wzy/Desktop/CodeX-20260303/摇骰子/手机真机联调-WSS隧道指南.md)

## 下一步建议

- 按 `RoomStateDTO` 增加断线重连 token 与重进房间能力
- 将历史记录落库（MongoDB/MySQL）
- 将小程序联调页拆分成正式房间 UI 组件
