# 五子棋 · 联机对战

两玩家通过分享房间号实时对战的五子棋。

## 技术栈

- **前端**：Vue 3 (CDN) + WebSocket + 单 HTML
- **后端**：Cloudflare Pages Functions
- **状态**：Cloudflare Durable Objects（每房间一个实例）
- **部署**：Cloudflare Pages（GitHub 集成 或 wrangler CLI）

## 本地开发

```bash
npm install -g wrangler
wrangler pages dev ./public --port 8788 --durable_objects=GOBANG_ROOM=GobangRoom --durable_objects_path=./functions/_lib/gobang-room.js
```

> Durable Object 的本地模拟需要 wrangler 3.x+。

## 部署到 Cloudflare

这个项目需要部署 **两个** Cloudflare 项目（同仓库不同子目录）：

### 项目 1：Pages（静态 + WebSocket 路由）

1. Cloudflare Dashboard → Workers & Pages → Create application → **Pages** → Connect to Git
2. 选 `owenyk/gobang-ol` 仓库
3. Build settings:
   - Build command: **留空**
   - Build output directory: **`public`**
4. Save and Deploy → 等首次部署完成

### 项目 2：Workers（持有 Durable Object class）

1. Cloudflare Dashboard → Workers & Pages → Create application → **Workers** → Connect to Git
2. 选 `owenyk/gobang-ol` 仓库
3. Build settings:
   - Root directory: **`worker`**
   - Build command: **留空**
4. Save and Deploy → 这次部署会创建 `GobangRoom` DO class

### 最后：在 Pages 里加 DO binding

1. Pages 项目 → Settings → Functions → Durable Object bindings → Add binding
2. Variable name: `GOBANG_ROOM`
3. Durable Object class: `GobangRoom`
4. Worker: `gobang-room-worker`
5. 保存 → 触发 Pages 重新部署

> 根目录的 `wrangler.toml` 已配好 `script_name = "gobang-room-worker"`，自动 deploy 时会带上 binding；手动 Dashboard 配作为双保险。

## 测试流程

1. 打开部署好的 URL（手机/电脑都行）
2. **A**：点"创建房间" → 看到 6 位房间号 + 分享链接
3. **B**：用另一个浏览器/手机打开同一 URL，输入 6 位房间号
4. 双方都进入后开始对弈
5. 同步测试：
   - A 落子 → B 立即看到
   - 双方计时器独立累加
   - 一方断网 → 另一方看到"对手已离开"
   - 房主点"申请重开" → 双方棋盘清空

## 消息协议

WebSocket JSON 消息，详见 `functions/_lib/gobang-room.js` 头部注释。

## 房间号规则

6 位大写字母+数字，去掉易混的 `0/O`、`1/I/L`。
字符集：`ABCDEFGHJKMNPQRSTUVWXYZ23456789` (32^6 ≈ 10 亿组合)
