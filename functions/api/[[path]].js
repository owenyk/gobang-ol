// Cloudflare Pages Function: WebSocket 路由 + Durable Object 转发
//
// 路径: /api/room/<6位房间号>
// 协议: WebSocket
// 房间状态由 Durable Object "GobangRoom" 维护（每房间一个实例）。
//
// GobangRoom class 在外部 Worker 项目 `gobang-room-worker` 的 worker/index.js 里。
// Pages wrangler.toml 的 [[durable_objects.bindings]] script_name 引用这个 Worker。
// 路由层只用 env.GOBANG_ROOM binding，不持有 class 本身。

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 只接受 /api/room/<6位> 路径
  const m = url.pathname.match(/^\/api\/room\/([A-Z0-9]{6})$/);
  if (!m) {
    return new Response('Not Found', { status: 404 });
  }

  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket Upgrade', { status: 400 });
  }

  const roomId = m[1].toUpperCase();

  // 用房间号作为 Durable Object 的名字（自动分配 ID）
  const id = env.GOBANG_ROOM.idFromName(roomId);
  const stub = env.GOBANG_ROOM.get(id);

  // 转发到 Durable Object
  return stub.fetch(request);
}
