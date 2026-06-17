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

## 部署到 Cloudflare Pages

### 方式 A：Git 集成（推荐）

1. 把代码 push 到 GitHub
2. Cloudflare Dashboard → Pages → Connect to Git
3. 选这个仓库
4. Build settings:
   - **Build command**: 留空
   - **Build output directory**: `public`
5. 保存后 Cloudflare 自动部署

> ⚠️ Pages 项目 settings → Functions → Durable Object bindings 里手动添加：
> - Variable name: `GOBANG_ROOM`
> - Class name: `GobangRoom`
> 这样 wrangler.toml 之外的 binding 也生效（双保险）。

### 方式 B：wrangler CLI

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy ./public --project-name=gobang-online
```

> 首次部署会提示创建 Pages 项目，之后直接 push。

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
