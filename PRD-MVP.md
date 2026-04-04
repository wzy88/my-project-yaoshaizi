# 摇骰子聚会助手（微信小程序）MVP PRD要点（AI可直接开发）

> 输入文档：`/Users/wzy/Desktop/Cursor-需求/摇骰子需求/yaoshaizi.md`、`/Users/wzy/Downloads/骰子游戏房间界面需求及技术实现汇总 (1).md`
>
> 约束：后续研发与测试均由 AI 完成（无真人联调/测试），因此本 PRD 以“低歧义 + 可自动化验收 + 服务端裁决 + 可重复回归”为核心。

## 1. 产品概述

- 产品：摇骰子聚会助手（微信小程序）
- 场景：线下喝酒/聚会多人围坐，环境嘈杂、容易记错/喊不清；按真实座位顺/逆时针轮转进行“摇骰-叫骰-质疑（开牌）”
- 核心价值：
  - 线下顺序对齐：游戏顺序与现实座位一致
  - 公平性：未开牌前每人仅见自己的骰面；开牌后全局公开
  - 可交付性：服务端权威裁决 + `testMode` 可回归

## 2. MVP范围（P0）

### 2.1 房间

- 创建房间：生成房间号，支持分享；房间上限 8 人
- 加入/退出：输入房间号加入；房主可解散
- 旁观规则：
  - 当房间“未满 8 人”时允许旁观（旁观者不占座位、不参与当局）
  - 当房间“已满 8 人”时不支持旁观（直接拒绝加入）
- 游戏进行中加入：允许进入房间但只能旁观/等待下一局（不加入对局、不占座位）；下一局在 `SEATING` 阶段由房主安排座位后才可成为对局玩家
- 网络状态：显示 `good/lag/disconnected`（基于心跳/延迟）

### 2.2 关键配置（创建房间时设置，开局后锁定不可改）

- `direction`：顺时针 / 逆时针（必须让房主选择，不默认）
- `wildcardOneEnabled`：通配 1 开 / 关（两种必须都支持）
- `minOpeningCount`：最少几个开始叫（房主创建时设置；用于本局第一手叫骰的数量下限）
- `openMode`：仅开单人（MVP生效）；可开多人（MVP置灰提示“后续开放”）

### 2.2.1 每局配置（每一局开始前可改；修改会重置/重开本局）

- `dicePerPlayer`：每位对局玩家的骰子颗数（推荐默认=5；范围建议 1..10）
  - 约束：仅允许在 `SEATING/READY` 修改；若在对局中修改，服务端拒绝并提示“请结束本局后修改”

### 2.3 座位与顺序（解决“现实座位顺序”问题）

- 新增阶段：`SEATING`（排位/就坐）
- 由房主为所有玩家分配 `seatIndex: 1..8`
  - 交互：拖拽玩家到座位；或“设为X号”快捷分配
  - 冲突：同一座位不可重复；由服务端拒绝并回滚到最新合法状态
- 开局后锁定：座位与房间配置不可更改

### 2.4 对局闭环（服务端裁决）

状态机（服务端为单一真相，客户端仅渲染与发起操作请求）：

- `LOBBY` → `SEATING` → `READY` → `ROLLING` → `BIDDING` → `OPENING` → `SETTLEMENT` → `SEATING`（下一局）

关键规则：

- 骰子：仅 D6（点数 1..6）
- 每局每位对局玩家骰子颗数 = `dicePerPlayer`
- 出手顺序：按 `seatIndex` + `direction` 轮转
- 摇骰（本局规则）：
  - 新一局由“发起者”点击 `开始` 进入 `ROLLING`；首局发起者为房主，后续每局发起者为上一局失败方
  - `ROLLING` 阶段：所有对局玩家都可以多次摇骰（可点击、可摇一摇），并在满意后点 `OK/我已摇好` 锁定本局骰面
  - `BIDDING` 阶段：在该玩家本局首次成功叫骰（第一次 `placeBid`）之前仍允许多次摇骰；一旦该玩家叫过骰，该玩家本局骰面锁定，直到下一局开始前都不允许再摇
  - 限制：每位玩家每局最多摇骰 5 次（超过后拒绝）
  - 约束：新一局必须所有对局玩家都有“本局骰面”（没摇不行）；推荐实现为：
    - 玩家点 `OK` 视为“已摇好”
    - 当全部对局玩家都已 `OK` 后，房间自动进入 `BIDDING`
- 未开牌前可见性：
  - 每个玩家只可见自己的骰面
  - 等待下一局的玩家：可见玩家列表/聊天/当前叫骰气泡；不可见任何人的私密骰面；开牌后可见全局骰面
- 叫骰格式：`X个Y`（数量X、点数Y）
- 首叫下限：当 `currentBid=null` 时，本局第一手必须满足 `X >= minOpeningCount`
- 叫骰递增规则（判定“更大”）：
  - `X` 变大（`Y` 可任意 1..6），或
  - `X` 不变且 `Y` 变大（如 `3个4 → 3个5/3个6`）
- 叫骰上限：`X <= 玩家数*dicePerPlayer`；当上一手 `X` 已达上限时，仍允许“点数上涨”（直到 `Y=6`），仅当达到 `X=上限 且 Y=6` 时，下家只能开牌
- 特殊牌型（按线下家规；用于统计 `totalCount(faceY)` 时对“某个玩家的贡献”做修正）：
  - 顺子算 0：若该玩家本局骰面为严格连续且无重复的序列（例如 5 颗骰为 `1-2-3-4-5` 或 `2-3-4-5-6`），则该玩家本局 **所有点数贡献均为 0**
  - 豹子加 1：若该玩家本局骰面能凑成同一点数的豹子，则在统计该点数时额外 `+1`
    - 自然豹子：5 颗骰原始点数全部相同（例如 `4-4-4-4-4`）
    - 通配豹子：当 `wildcardOneEnabled=true` 且本局尚未有人叫过 `1` 时，若该玩家整手骰子都属于 `{Y,1}`，则统计点数 `Y` 时也视为 `Y` 的豹子（例如 `5-5-5-5-1`、`5-5-1-1-5` 都按 `5` 的豹子处理）
  - 统计顺序（避免歧义）：先按当前被叫点数 `Y` 判断顺子/豹子贡献，再按通配1规则完成最终计数
- 质疑/开牌（MVP）：
  - 只能“开上一手叫骰的人”（不能开任意人；不能开多人）
  - 开牌后公开所有玩家骰面
  - 胜负判定：对上一手 `X个Y` 统计 `totalCount(Y)`（含通配规则），若 `totalCount(Y) >= X` 则开牌方输，否则被开牌方输
- 下一局起始位：**谁输谁先**（上一局失败方作为下一局起始操作位，按 `direction` 轮转）

### 2.5 通配 1 规则（当 `wildcardOneEnabled=true`）

- 默认：点数 1 可作为任意点数参与计数（例如叫 `X个6` 时，计数 = `6的数量 + 1的数量`）
- 一旦有人叫 `X个1`（即本手 `Y=1`）：
  - 从这一手起，本局剩余流程中 1 不再通配，只按点数 1 计数

#### 2.5.1 `totalCount(Y)` 统计口径（强制，避免歧义）

对每个玩家，当前被叫点数 `Y` 的贡献按以下规则计算：

- 若顺子算 0：`contrib(Y) = 0`
- 若 `Y == 1`：`contrib(Y) = count(1) + (自然豹子且 allSameFace==1 ? 1 : 0)`
- 若 `wildcardOneEnabled && wildcardOneActive && Y != 1`：
  - `effectiveCount(Y) = count(Y) + count(1)`
  - 若 `effectiveCount(Y) == diceCount`：`contrib(Y) = diceCount + 1`（按 `Y` 的豹子处理）
  - 否则：`contrib(Y) = effectiveCount(Y) + (自然豹子且 allSameFace==Y ? 1 : 0)`
- 否则：`contrib(Y) = count(Y) + (自然豹子且 allSameFace==Y ? 1 : 0)`

示例（`dicePerPlayer=5`，`wildcardOneEnabled=true` 且 `wildcardOneActive=true`）：

- A：`[1,1,4,5,6]`，则 `baseCount(4)=1`、`baseCount(1)=2`，所以 `contrib(4)=3`
- B：`[4,4,4,2,6]`，则 `contrib(4)=3`
- C：`[2,3,4,5,6]`（顺子算 0），则 `contrib(4)=0`
- D：`[5,5,5,5,1]`，若 `Y=5` 且本局尚未叫过 `1`，则 `contrib(5)=6`（按 `5` 的豹子处理）
- 全场 `totalCount(4)=3+3+0=6`

### 2.6 叫骰输入（MVP）

- 交互：结构化控件选择 X/Y → 点击“确认叫骰”才提交
- 记录：房间内展示叫骰记录（至少展示“当前叫骰气泡” + 可展开历史列表）
- 语音叫骰（MVP做）：仅在“轮到自己”时启用 → 按住说话 → 语音识别转文字 → 解析为 `X个Y` → 仅填入叫骰面板，由用户点击“确认叫骰”提交（避免误识别直接下单）

### 2.7 超时/离线（MVP：跳过并自动操作）

- 叫骰超时：倒计时 5 秒；到时服务端自动“最小合法加注”（避免卡死）
  - 推荐最小合法算法（避免自动叫 `1` 导致通配规则被动关闭）：
    - 若存在上一手 `currentBid=(X,Y)` 且 `Y<6`：自动叫 `(X, Y+1)`
    - 若 `Y=6`：自动叫 `(X+1, 2)`（数量上涨且点数避开 1）
    - 若已到上限 `X == 玩家数*dicePerPlayer`：服务端自动开牌（质疑上一手）结束本局
  - 若本局尚未有人叫骰（`currentBid=null`）：自动叫 `(minOpeningCount, 2)`（默认避开 1）
- 离线/掉线：离开的也计入总和（仍作为对局玩家参与统计）；重连需恢复本局状态与其私密骰面
- 频控（建议）：`rollCooldownMs`（例如 300ms）防止客户端刷 `rollDice` 把房间刷爆

### 2.8 AI-only 测试模式（P0强制）

`testMode=true` 时必须支持：

- 固定随机种子或直接注入“下一次 rollDice 的结果”（按 `dicePerPlayer` 生成）
- 跳过/缩短动画时长（客户端渲染层）
- 快速进入阶段（可选，但建议）：从 `SEATING/READY/BIDDING` 直接开始，用于回归

## 3. 非目标（MVP不做 / 置灰 / 后续）

- 可开任意单人、可开多人（创建房间置灰占位，后续迭代）
- VIP/商城/概率加持（尤其概率加持会破坏公平性与验收复杂度）
- 跨房间个人中心统计、排行榜等运营体系

## 4. 页面与模块（小程序）

### 4.1 页面清单

- 首页/大厅
  - 创建房间
  - 加入房间（输入房间号）
  - 最近房间（可选，P1）
- 创建房间页（配置项）
  - `direction`（必选）
  - `wildcardOneEnabled`（开/关）
  - `openMode`：仅开单人（可选）；可开多人（置灰）
  - `dicePerPlayer`（数字选择器，默认=5）
- 房间页（核心）
  - 顶部栏：房间号、网络状态、更多菜单
  - 中央圆桌：玩家按 `seatIndex` 环形排列；头像边框状态（当前/等待/离线/房主/自己）
  - 骰盅：`closed/open`；未开牌前仅自己可见结果；开牌后全员可见
  - 叫骰气泡：位于圆内指向玩家；新声明覆盖旧气泡
  - 底部栏：摇骰、叫骰（结构化）、质疑/开牌（仅在允许时亮起）、设置（音效开关）、聊天入口；主要操作按钮需随阶段切换（开始/摇一摇/OK/等待），叫牌阶段仅当前操作者隐藏主按钮并显示叫牌面板，结算后仅上一局输家看到 `开始`，其余玩家显示 `等待`
  - 排位弹层：房主拖拽排位/设为X号；完成后可开始
- 规则说明弹层（P1）

### 4.2 视觉风格（来自附件补充）

- 中式轻奢：深棕木纹 + 金色点缀 + 米黄桌布（禁止纯绿色）
- 竖屏布局：顶部≈10%、中央≈75%、底部≈10%

## 5. 数据模型（服务端权威）

### 5.1 核心实体

- `Room`
  - `roomId`
  - `config`：`direction`、`wildcardOneEnabled`、`minOpeningCount`、`openMode`、`dicePerPlayer`、`testMode`
  - `phase`：枚举（状态机）
  - `players[]`
  - `observers[]`（可选）：旁观者列表（不占座位、不参与当局）
  - `seatMap`：`seatIndex -> playerId`
  - `currentTurnPlayerId`
  - `currentBid`：`{ countX, faceY, bidderPlayerId } | null`
  - `roundIndex`
  - `wildcardOneActive`：`boolean`（`wildcardOneEnabled=true` 时，初始为 true；一旦有人叫过 `Y=1` 则变为 false）
  - `waitingPlayerIds[]`
  - `timers`：各阶段超时信息
- `Player`
  - `playerId`
  - `nickname/avatar`
  - `seatIndex?`
  - `status`：`online/offline`
  - `dice`：`int[dicePerPlayer]`（私密，开牌后公开）
  - `rollLockedThisRound`：`boolean`（点 OK 或进入叫牌后锁定）
  - `hasBidThisRound`：`boolean`
  - `lastBid?`

### 5.2 可见性规则（强约束）

- `dice`：
  - `READY/BIDDING`：仅本人可见
  - `OPENING/SETTLEMENT`：全员可见（含等待者）
- `currentBid`：全员可见（含等待者）

## 6. 通信协议（建议：WebSocket事件）

原则：服务端裁决；所有客户端操作 = `intent`；服务端广播 `state` 或 `event`；重连用快照。

### 6.1 必备事件（示例命名）

- `room/join`, `room/leave`, `room/dissolve`
- `room/state`（快照：用于初次进入与重连）
- `room/configUpdated`（仅创建时/开局前；开局后不再发生）
- `room/seatingUpdate`（seatMap变更）
- `game/phaseChanged`
- `game/turnChanged`
- `game/rollResultPrivate`（只发给本人）
- `game/bidPlaced`（全员）
- `game/opened`（全局骰面 + 胜负结果）
- `game/settled`（结果确认 + 下一局起始位）
- `chat/message`（最小文本聊天，P0或P1由实现决定）

### 6.2 客户端意图（示例）

- `intent/setSeat(seatIndex, playerId)`（仅房主）
- `intent/setDirection(direction)`（仅房主，开局前）
- `intent/startGame()`（仅房主，需 seatMap 完整且>=2人）
- `intent/rollDice()`
- `intent/placeBid(countX, faceY)`
- `intent/openPreviousBid()`（即：质疑上一手）

## 7. 校验与错误码（必须可自动验收）

- 非法操作统一返回：`{ ok:false, code, message }`
- 关键校验：
  - 非当前回合玩家操作 → `NOT_YOUR_TURN`
  - 阶段不允许操作 → `INVALID_PHASE`
  - 叫骰不满足递增/首手/上限 → `INVALID_BID`
  - 开牌对象不是上一手叫骰 → `INVALID_OPEN_TARGET`
  - 开局后修改配置/座位 → `LOCKED`

## 8. 验收口径（P0最小集）

- 房主可创建房间并选择配置；`direction` 必选；通配1可切换；“可开多人”置灰；`dicePerPlayer` 默认=5 且可在 `SEATING/READY` 调整
- 房主可在 `SEATING` 完成 1..N 的座位分配（N<=8）并开始；开局后配置/座位锁定
- 私密骰面：未开牌前他人不可见；等待者也不可见；开牌后全局可见
- 叫骰：
  - 递增规则与上限生效
  - 超时自动最小合法加注可稳定复现
- 摇骰：
  - 在本局第一次 `placeBid` 之前允许多次摇；叫骰后本局不允许再摇
  - 若轮到自己仍未摇过骰，超时后服务端自动摇一次
- 开牌：
  - 只能开上一手叫骰的人
  - 判定 `totalCount(Y)`（含通配规则）后给出胜负
- 统计修正：
  - 顺子算 0 生效
  - 豹子加 1 生效
- 下一局：失败方起始位正确；等待者可在下一局排位加入
- `testMode`：可固定骰面/跳过动画，保证自动化回归

## 9. 风险与待定项（需要在开发前冻结）

- 摇骰/开牌阶段超时：具体时长与是否允许“自动开牌”策略（当前建议：不自动开牌，继续按叫骰超时推进）
- 通配1的统计细节：仅对“当前叫骰点数Y”做替代计数（不做“全局最优替代”以降低复杂度）
