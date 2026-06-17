// Cloudflare Pages Function: GobangRoom Durable Object
//
// 房间状态由 Durable Object "GobangRoom" 维护（每房间一个实例），
// 协议见文件顶部注释。Pages 项目通过 wrangler.toml 里的
// [[durable_objects.bindings]] name = "GOBANG_ROOM" 暴露给路由层使用。
//
// 协议：JSON 文本消息
//
// 客户端 → 服务端:
//   { type: 'create', roomId, name }
//   { type: 'join',   roomId, name }
//   { type: 'move',   x, y }
//   { type: 'restart' }
//   { type: 'leave' }
//
// 服务端 → 客户端:
//   { type: 'created',          color: 1|2, roomId }
//   { type: 'joined',           color: 1|2 }
//   { type: 'opponent_joined',  name }
//   { type: 'sync',             moves, currentPlayer, blackTime, whiteTime, gameOver, winner, winLine }
//   { type: 'move',             x, y, player, color, blackTime, whiteTime, gameOver, winner, winLine }
//   { type: 'tick',             blackTime, whiteTime }
//   { type: 'restart',          currentPlayer }
//   { type: 'opponent_left',    name }
//   { type: 'error',            message }

export class GobangRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // 内存状态
    this.sessions = new Map();   // ws -> { color, name, isHost }
    this.board = Array.from({ length: 15 }, () => Array(15).fill(0));
    this.moves = [];
    this.currentPlayer = 1;
    this.blackTime = 0;
    this.whiteTime = 0;
    this.lastTick = Date.now();
    this.gameOver = false;
    this.winner = 0;
    this.winLine = null;
    this.restored = false;

    // 启动时恢复 + 设置定时器
    state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.get('snapshot');
      if (stored) {
        Object.assign(this, stored);
        this.restored = true;
      }
      // 1 秒后开始 tick（如果游戏还在进行，alarm 会持续调度）
      await state.storage.setAlarm(Date.now() + 1000);
    });
  }

  // 处理 HTTP/WS 请求（路由层转发过来）
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);

    // 初始挂个空玩家信息，等 create/join 消息确认
    this.sessions.set(server, { color: 0, name: '', isHost: false });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const sess = this.sessions.get(ws);
    if (!sess) return;

    let msg;
    try { msg = JSON.parse(message); } catch { return; }

    switch (msg.type) {
      case 'create': {
        if (sess.color !== 0) return; // 已确认过角色
        // 检查是否已有人 host
        const hasHost = [...this.sessions.values()].some(s => s.isHost);
        if (hasHost) {
          this.send(ws, { type: 'error', message: '房间已存在' });
          try { ws.close(); } catch {}
          return;
        }
        sess.color = 1;
        sess.name = (msg.name || '黑方').slice(0, 20);
        sess.isHost = true;
        this.send(ws, { type: 'created', color: 1, roomId: msg.roomId });
        break;
      }

      case 'join': {
        if (sess.color !== 0) return;
        const players = [...this.sessions.values()].filter(s => s.color !== 0);
        if (players.length >= 2) {
          this.send(ws, { type: 'error', message: '房间已满（需要 2 人）' });
          try { ws.close(); } catch {}
          return;
        }
        const taken = players.map(s => s.color);
        const myColor = taken.includes(1) ? 2 : 1;
        sess.color = myColor;
        sess.name = (msg.name || (myColor === 1 ? '黑方' : '白方')).slice(0, 20);
        sess.isHost = false;

        // 通知 host
        for (const [otherWs, otherSess] of this.sessions) {
          if (otherWs !== ws && otherSess.isHost) {
            this.send(otherWs, { type: 'opponent_joined', name: sess.name, color: myColor });
          }
        }
        // 给新加入者回 ack + 状态同步
        this.send(ws, { type: 'joined', color: myColor });
        this.send(ws, {
          type: 'sync',
          moves: this.moves,
          currentPlayer: this.currentPlayer,
          blackTime: this.blackTime,
          whiteTime: this.whiteTime,
          gameOver: this.gameOver,
          winner: this.winner,
          winLine: this.winLine
        });
        break;
      }

      case 'move': {
        if (this.gameOver) return;
        if (sess.color !== this.currentPlayer) return;

        const { x, y } = msg;
        if (!Number.isInteger(x) || !Number.isInteger(y)) return;
        if (x < 1 || x > 15 || y < 1 || y > 15) return;
        if (this.board[x - 1][y - 1] !== 0) return;

        this.board[x - 1][y - 1] = this.currentPlayer;
        this.moves.push({ x, y, player: this.currentPlayer });

        const line = this.checkWin(x - 1, y - 1, this.currentPlayer);
        let nextPlayer = this.currentPlayer;

        if (line) {
          this.winner = this.currentPlayer;
          this.winLine = line.map(([a, b]) => ({ x: a + 1, y: b + 1 }));
          this.gameOver = true;
        } else if (this.moves.length === 225) {
          this.gameOver = true;
        } else {
          nextPlayer = this.currentPlayer === 1 ? 2 : 1;
          this.currentPlayer = nextPlayer;
        }

        this.broadcast({
          type: 'move',
          x, y,
          player: sess.color,        // 落下的是谁
          color: nextPlayer,         // 下一个该谁
          blackTime: this.blackTime,
          whiteTime: this.whiteTime,
          gameOver: this.gameOver,
          winner: this.winner,
          winLine: this.winLine
        });
        await this.save();
        break;
      }

      case 'restart': {
        // 只 host 能发起
        if (!sess.isHost) {
          this.send(ws, { type: 'error', message: '只有房主能申请重开' });
          return;
        }
        if (this.sessions.size < 2) {
          this.send(ws, { type: 'error', message: '对手已离开，无法重开' });
          return;
        }
        this.board = Array.from({ length: 15 }, () => Array(15).fill(0));
        this.moves = [];
        this.currentPlayer = 1;
        this.blackTime = 0;
        this.whiteTime = 0;
        this.lastTick = Date.now();
        this.gameOver = false;
        this.winner = 0;
        this.winLine = null;
        this.broadcast({ type: 'restart', currentPlayer: 1 });
        await this.save();
        break;
      }

      case 'leave': {
        try { ws.close(); } catch {}
        break;
      }
    }
  }

  async webSocketClose(ws) {
    const sess = this.sessions.get(ws);
    this.sessions.delete(ws);
    if (sess && sess.color !== 0) {
      for (const [otherWs, otherSess] of this.sessions) {
        if (otherSess.color !== 0) {
          this.send(otherWs, { type: 'opponent_left', name: sess.name });
        }
      }
    }
  }

  async webSocketError(ws) {
    this.sessions.delete(ws);
  }

  // Durable Object 的 alarm：每秒触发一次，做计时器 tick
  async alarm() {
    if (this.sessions.size === 0) {
      // 没人了，停止 alarm
      return;
    }
    if (!this.gameOver) {
      const now = Date.now();
      const dt = now - this.lastTick;
      if (this.currentPlayer === 1) this.blackTime += dt;
      else this.whiteTime += dt;
      this.lastTick = now;
      this.broadcast({ type: 'tick', blackTime: this.blackTime, whiteTime: this.whiteTime });
      await this.save();
    }
    // 继续调度
    await this.state.storage.setAlarm(Date.now() + 1000);
  }

  // 4 方向五连判定
  checkWin(x, y, p) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dx, dy] of dirs) {
      const line = [[x, y]];
      for (let i = 1; i < 5; i++) {
        const nx = x + dx * i, ny = y + dy * i;
        if (nx < 0 || nx >= 15 || ny < 0 || ny >= 15) break;
        if (this.board[nx][ny] !== p) break;
        line.push([nx, ny]);
      }
      for (let i = 1; i < 5; i++) {
        const nx = x - dx * i, ny = y - dy * i;
        if (nx < 0 || nx >= 15 || ny < 0 || ny >= 15) break;
        if (this.board[nx][ny] !== p) break;
        line.unshift([nx, ny]);
      }
      if (line.length >= 5) return line.slice(0, 5);
    }
    return null;
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }

  broadcast(msg) {
    for (const ws of this.sessions.keys()) this.send(ws, msg);
  }

  async save() {
    await this.state.storage.put('snapshot', {
      board: this.board,
      moves: this.moves,
      currentPlayer: this.currentPlayer,
      blackTime: this.blackTime,
      whiteTime: this.whiteTime,
      gameOver: this.gameOver,
      winner: this.winner,
      winLine: this.winLine,
      lastTick: this.lastTick
    });
  }
}
