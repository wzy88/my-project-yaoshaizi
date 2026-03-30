# 手机真机联调 - WSS 隧道指南

目标：让手机通过公网 `wss` 地址访问你本机服务，避免局域网 `1006` 断连问题。

## 1. 启动本地服务

```bash
cd /Users/wzy/Desktop/CodeX-20260303/摇骰子
npm run dev:server
```

启动后应看到：
- `http://0.0.0.0:3000`
- `ws://0.0.0.0:3000/ws`

本机验证：
```bash
curl http://127.0.0.1:3000/health
```

若终端提示端口占用，服务会自动切到下一个端口（如 3001）。  
macOS 手动排查：
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill -15 <PID>
```

## 1.1 微信开发者工具真机代理（本机回环）

当你使用“真机调试代理”把手机流量回传到 Mac 时，可改成：
```bash
HOST=127.0.0.1 PORT=3003 npm run dev:server
```
小程序地址填写：
```text
ws://127.0.0.1:3003/ws
```

## 2. 方案A：ngrok（推荐）

### 2.1 安装并登录

按官方说明安装并配置 token：
- https://ngrok.com/docs/getting-started/

### 2.2 打通隧道

```bash
ngrok http 3000
```

你会得到一个公网地址，例如：
- `https://abc123.ngrok-free.app`

### 2.3 小程序填写地址

在房间页：`更多 -> 服务器地址` 填：
- `wss://abc123.ngrok-free.app/ws`

测试前先在手机浏览器打开：
- `https://abc123.ngrok-free.app/health`

返回 `{"ok":true...}` 即可。

## 3. 方案B：cloudflared（免注册临时）

### 3.1 安装

按官方文档安装 `cloudflared`。

### 3.2 打通隧道

```bash
cloudflared tunnel --url http://localhost:3000
```

会得到地址，例如：
- `https://xxx.trycloudflare.com`

### 3.3 小程序填写地址

填：
- `wss://xxx.trycloudflare.com/ws`

并先在手机浏览器打开：
- `https://xxx.trycloudflare.com/health`

## 4. 小程序端注意事项

- 服务器地址必须是完整协议：`ws://` 或 `wss://`
- 使用隧道时优先 `wss://.../ws`
- 若地址更新，页面会自动重连

## 5. 常见问题

1. `close(1006):abnormal closure`
- 地址错误（缺 `/ws`）
- 隧道未启动或过期
- 手机网络无法访问该域名

2. 浏览器能开 `/health`，小程序连不上
- 检查是否填了 `wss://.../ws`
- 微信开发者工具调试时，打开“本地设置”里不校验项

3. 语音上传失败
- 没有麦克风权限（`scope.record`）
- 录音过长（当前限制约 2MB base64）
