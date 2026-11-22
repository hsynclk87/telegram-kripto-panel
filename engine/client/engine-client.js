/**
 * Browser-side connector for the analysis engine.
 * Usage:
 * const engine = createEngineClient("https://YOUR-SERVICE");
 * engine.on("analysis", (data) => console.log(data));
 * engine.connect();
 */
export function createEngineClient(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  const listeners = new Map();
  let socket;
  let retryTimer;
  let retryMs = 1000;
  let closedByUser = false;

  function emit(type, data) {
    for (const callback of listeners.get(type) || []) callback(data);
  }

  function on(type, callback) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(callback);
    return () => listeners.get(type)?.delete(callback);
  }

  function connect() {
    closedByUser = false;
    const wsUrl = base.replace(/^https:/, "wss:").replace(/^http:/, "ws:") + "/stream";
    socket = new WebSocket(wsUrl);
    socket.addEventListener("open", () => {
      retryMs = 1000;
      emit("open", { connected: true });
    });
    socket.addEventListener("message", (event) => {
      try {
        const packet = JSON.parse(event.data);
        emit(packet.type, packet.data);
        emit("event", packet);
      } catch (error) {
        emit("error", error);
      }
    });
    socket.addEventListener("close", () => {
      emit("close", { connected: false });
      if (!closedByUser) {
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 30000);
      }
    });
    socket.addEventListener("error", (error) => emit("error", error));
  }

  async function get(path) {
    const response = await fetch(base + path, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Engine API error: ${response.status}`);
    return response.json();
  }

  function disconnect() {
    closedByUser = true;
    clearTimeout(retryTimer);
    if (socket) socket.close();
  }

  return {
    on,
    connect,
    disconnect,
    health: () => get("/api/v1/health"),
    snapshot: (symbol) => get("/api/v1/snapshot" + (symbol ? "?symbol=" + encodeURIComponent(symbol) : "")),
    analysis: (symbol) => get("/api/v1/analysis" + (symbol ? "?symbol=" + encodeURIComponent(symbol) : "")),
    marketSignals: (symbol) => get("/api/v1/market-signals" + (symbol ? "?symbol=" + encodeURIComponent(symbol) : "")),
    trades: (limit = 50) => get("/api/v1/trades?limit=" + encodeURIComponent(limit)),
    liquidations: (limit = 50) => get("/api/v1/liquidations?limit=" + encodeURIComponent(limit)),
    whales: (limit = 50) => get("/api/v1/whales?limit=" + encodeURIComponent(limit))
  };
}
