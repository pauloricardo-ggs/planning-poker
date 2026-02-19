import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { PlanningCard } from './domain/models.js';
import { RoomStore } from './domain/room-store.js';

const app = express();
app.use(cors());
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

const roomStore = new RoomStore();

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected server error.';
}

function emitRoomState(roomCode: string): void {
  const snapshot = roomStore.getSnapshot(roomCode);
  io.to(roomCode).emit('room:state', snapshot);
}

io.on('connection', (socket) => {
  socket.on(
    'fun:effect',
    (payload: {
      type: 'rock' | 'coffee';
      x: number;
      y: number;
      targetX?: number;
      targetY?: number;
    }) => {
      try {
        const roomCode = roomStore.getRoomCodeForSocket(socket.id);
        if (!roomCode) {
          return;
        }

        if (payload.type !== 'rock' && payload.type !== 'coffee') {
          return;
        }

        const x = Math.min(Math.max(payload.x, 0), 1);
        const y = Math.min(Math.max(payload.y, 0), 1);
        const targetX =
          typeof payload.targetX === 'number'
            ? Math.min(Math.max(payload.targetX, 0), 1)
            : undefined;
        const targetY =
          typeof payload.targetY === 'number'
            ? Math.min(Math.max(payload.targetY, 0), 1)
            : undefined;

        io.to(roomCode).emit('fun:effect', { type: payload.type, x, y, targetX, targetY });
      } catch {
        return;
      }
    },
  );

  socket.on('fun:emote', (payload: { emoji: string; x: number; y: number }) => {
    try {
      const roomCode = roomStore.getRoomCodeForSocket(socket.id);
      if (!roomCode) {
        return;
      }

      const x = Math.min(Math.max(payload.x, 0), 1);
      const y = Math.min(Math.max(payload.y, 0), 1);
      const emoji = payload.emoji.slice(0, 4);

      io.to(roomCode).emit('fun:emote', { emoji, x, y });
    } catch {
      return;
    }
  });

  socket.on('fun:firecracker', (payload: { x: number; y: number }) => {
    try {
      const roomCode = roomStore.getRoomCodeForSocket(socket.id);
      if (!roomCode) {
        return;
      }

      const x = Math.min(Math.max(payload.x, 0), 1);
      const y = Math.min(Math.max(payload.y, 0), 1);
      io.to(roomCode).emit('fun:firecracker', { x, y });
    } catch {
      return;
    }
  });

  socket.on('room:create', (payload: { name: string }, ack?: (response: unknown) => void) => {
    try {
      const snapshot = roomStore.createRoom(socket.id, payload.name);
      socket.join(snapshot.roomCode);
      ack?.({ ok: true, snapshot, selfId: socket.id });
      emitRoomState(snapshot.roomCode);
    } catch (error) {
      ack?.({ ok: false, message: getErrorMessage(error) });
    }
  });

  socket.on(
    'room:join',
    (payload: { roomCode: string; name: string }, ack?: (response: unknown) => void) => {
      try {
        const snapshot = roomStore.joinRoom(socket.id, payload.roomCode, payload.name);
        socket.join(snapshot.roomCode);
        ack?.({ ok: true, snapshot, selfId: socket.id });
        emitRoomState(snapshot.roomCode);
      } catch (error) {
        ack?.({ ok: false, message: getErrorMessage(error) });
      }
    },
  );

  socket.on('vote:set', (payload: { card: PlanningCard }, ack?: (response: unknown) => void) => {
    try {
      const snapshot = roomStore.setVote(socket.id, payload.card);
      ack?.({ ok: true });
      emitRoomState(snapshot.roomCode);
    } catch (error) {
      ack?.({ ok: false, message: getErrorMessage(error) });
    }
  });

  socket.on(
    'vote:clear',
    (payload: { participantId: string }, ack?: (response: unknown) => void) => {
      try {
        const snapshot = roomStore.clearVote(socket.id, payload.participantId);
        ack?.({ ok: true });
        emitRoomState(snapshot.roomCode);
      } catch (error) {
        ack?.({ ok: false, message: getErrorMessage(error) });
      }
    },
  );

  socket.on(
    'participant:remove',
    (payload: { participantId: string }, ack?: (response: unknown) => void) => {
      try {
        const removedRoomCode = roomStore.getRoomCodeForSocket(payload.participantId);
        const snapshot = roomStore.removeParticipant(socket.id, payload.participantId);
        ack?.({ ok: true });
        if (snapshot.participants.length > 0) {
          emitRoomState(snapshot.roomCode);
        }

        if (removedRoomCode) {
          const removedSocket = io.sockets.sockets.get(payload.participantId);
          if (removedSocket) {
            removedSocket.leave(removedRoomCode);
            removedSocket.emit('room:kicked');
            removedSocket.disconnect(true);
          }
        }
      } catch (error) {
        ack?.({ ok: false, message: getErrorMessage(error) });
      }
    },
  );

  socket.on('round:toggleReveal', (_payload: undefined, ack?: (response: unknown) => void) => {
    try {
      const snapshot = roomStore.toggleReveal(socket.id);
      ack?.({ ok: true });
      emitRoomState(snapshot.roomCode);
    } catch (error) {
      ack?.({ ok: false, message: getErrorMessage(error) });
    }
  });

  socket.on('round:reset', (_payload: undefined, ack?: (response: unknown) => void) => {
    try {
      const snapshot = roomStore.resetRound(socket.id);
      ack?.({ ok: true });
      emitRoomState(snapshot.roomCode);
    } catch (error) {
      ack?.({ ok: false, message: getErrorMessage(error) });
    }
  });

  socket.on('room:leave', (_payload: undefined, ack?: (response: unknown) => void) => {
    const roomCode = roomStore.getRoomCodeForSocket(socket.id);
    const snapshot = roomStore.leaveRoom(socket.id);
    if (roomCode) {
      socket.leave(roomCode);
    }

    ack?.({ ok: true });

    if (snapshot) {
      emitRoomState(snapshot.roomCode);
    }
  });

  socket.on('disconnect', () => {
    const roomCode = roomStore.getRoomCodeForSocket(socket.id);
    const snapshot = roomStore.leaveRoom(socket.id);
    if (snapshot) {
      emitRoomState(snapshot.roomCode);
    }
  });
});

const port = Number.parseInt(process.env.PORT ?? '3333', 10);
httpServer.listen(port, () => {
  console.log(`Planning Poker server running on http://localhost:${port}`);
});
