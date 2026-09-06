import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import apiRoutes from './routes/api';
import { AdbService } from './services/adbService';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// WebSocket Handler for Real-Time TV Remote, Keyboards, Gamepads & Voice Input
wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket] TV / Controller Client connected');

  ws.on('message', async (data: string) => {
    try {
      const payload = JSON.parse(data.toString());
      if (payload.type === 'key' && typeof payload.keyCode === 'number') {
        await AdbService.sendKeyEvent(payload.keyCode);
      } else if (payload.type === 'text' && typeof payload.text === 'string') {
        await AdbService.sendText(payload.text);
      } else if (payload.type === 'touch' && typeof payload.x === 'number' && typeof payload.y === 'number') {
        await AdbService.sendTouch(payload.x, payload.y);
      } else if (
        payload.type === 'swipe' &&
        typeof payload.x1 === 'number' &&
        typeof payload.y1 === 'number' &&
        typeof payload.x2 === 'number' &&
        typeof payload.y2 === 'number'
      ) {
        await AdbService.sendSwipe(payload.x1, payload.y1, payload.x2, payload.y2, payload.duration || 300);
      }
    } catch (e) {
      console.error('[WebSocket Error]:', e);
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] TV / Controller Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(` Umbrella OS Backend running on port ${PORT}`);
  console.log(` REST API: http://localhost:${PORT}/api`);
  console.log(` WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`========================================`);
});
