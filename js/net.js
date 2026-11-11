// NEO JAPAN CLASH — オンライン（server.js への WebSocket 接続）
(function () {
  'use strict';
  const N = window.NJC;
  const Net = {
    ws: null, id: null, onMsg: null, onClose: null,
    available() { return location.protocol === 'http:' || location.protocol === 'https:'; },
    connected() { return !!this.ws && this.ws.readyState === 1; },
    connect() {
      if (this.connected()) return Promise.resolve();
      return new Promise((res, rej) => {
        let ws, done = false;
        try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host); } catch (e) { return rej(e); }
        const timer = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch (e) { /* 既に閉じている */ } rej(new Error('timeout')); } }, 6000);
        ws.onopen = () => { if (done) return; done = true; clearTimeout(timer); this.ws = ws; res(); };
        ws.onerror = () => { if (!done) { done = true; clearTimeout(timer); rej(new Error('connect')); } };
        ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'joined') this.id = m.id; if (this.onMsg) this.onMsg(m); };
        ws.onclose = () => { const was = this.ws === ws; if (was) { this.ws = null; this.id = null; if (this.onClose) this.onClose(); } };
      });
    },
    send(o) { if (this.connected()) this.ws.send(JSON.stringify(o)); },
    close() { const ws = this.ws; this.ws = null; this.id = null; if (ws) { try { ws.close(); } catch (e) { /* 既に閉じている */ } } },
  };
  N.Net = Net;
})();
