import { useEffect, useRef, useState } from 'react';

export type RunState = 'idle' | 'running' | 'done' | 'error';

export interface LogEntry {
  id:    number;
  level: 'banner'|'step'|'info'|'success'|'warn'|'error'|'detail'|'divider';
  text:  string;
}

let _id = 0;

export function useSocket() {
  const [logs,     setLogs]     = useState<LogEntry[]>([]);
  const [runState, setRunState] = useState<RunState>('idle');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // file:// has no host — skip WebSocket (server not reachable)
    if (!window.location.host) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws    = new WebSocket(`${proto}://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen  = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data as string);

      if (msg.type === 'log') {
        setLogs(prev => [...prev, { id: ++_id, level: msg.level, text: msg.text }]);
      } else if (msg.type === 'status') {
        setRunState(msg.state as RunState);
      }
    };

    return () => ws.close();
  }, []);

  const clearLogs = () => setLogs([]);

  return { logs, runState, connected, clearLogs };
}
