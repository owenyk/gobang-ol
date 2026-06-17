// 占位 Worker：gobang-room-worker 项目的 GitHub 集成需要 ./worker 目录存在
// 真实的 GobangRoom class 已迁到 functions/_lib/gobang-room.js（Pages 自己持有），
// 这里的 Worker 不持有任何 Durable Object，仅作为占位让 build 不报 "root directory not found"。
// 如果你不再需要这个 Worker 项目，可以在 Dashboard 删除它。
export default {
  async fetch() {
    return new Response('gobang-room-worker: placeholder, see functions/_lib/gobang-room.js for actual DO', { status: 200 });
  }
};
