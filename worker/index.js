// Cloudflare Worker: GobangRoom Durable Object 持有者
//
// 这个 Worker 的唯一作用是持有 GobangRoom class，
// Pages 项目通过 wrangler.toml 里的 script_name 引用这个 Worker 来使用 DO。
//
// 协议：见 ./gobang-room.js 头部注释

export { GobangRoom } from './gobang-room.js';

// 一个最小的 fetch handler（Worker 需要 default export），
// 实际业务由 Durable Object 处理，这个 handler 永远不会被调用。
export default {
  async fetch() {
    return new Response('GobangRoom DO worker', { status: 200 });
  }
};
