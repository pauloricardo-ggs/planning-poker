import { computed, Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {
  CreateRoomPayload,
  CursorMovePayload,
  EmotePayload,
  FirecrackerPayload,
  FunEffectPayload,
  FunEffectType,
  JoinRoomPayload,
  ParticipantActionPayload,
  RemoteCursor,
  RoomSnapshot,
  SocketAck,
  VotePayload,
} from './realtime.models';

type CreateOrJoinAck = SocketAck<{ snapshot: RoomSnapshot; selfId: string }>;

const SOCKET_ACK_TIMEOUT_MS = 5000;

@Injectable({ providedIn: 'root' })
export class RealtimeGatewayService {
  private socket: Socket | null = null;

  private readonly snapshotState = signal<RoomSnapshot | null>(null);
  private readonly selfIdState = signal<string | null>(null);
  private readonly remoteCursorsState = signal<Record<string, RemoteCursor>>({});
  private readonly firecrackerEventState = signal<FirecrackerPayload | null>(null);
  private readonly emoteEventState = signal<EmotePayload | null>(null);
  private readonly funEffectEventState = signal<FunEffectPayload | null>(null);

  readonly connected = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly snapshot = computed(() => this.snapshotState());
  readonly selfId = computed(() => this.selfIdState());
  readonly remoteCursors = computed(() => Object.values(this.remoteCursorsState()));
  readonly firecrackerEvent = computed(() => this.firecrackerEventState());
  readonly emoteEvent = computed(() => this.emoteEventState());
  readonly funEffectEvent = computed(() => this.funEffectEventState());
  readonly inRoom = computed(() => this.snapshotState() !== null);
  readonly roomCode = computed(() => this.snapshotState()?.roomCode ?? null);
  readonly isHost = computed(() => {
    const currentSnapshot = this.snapshotState();
    const selfId = this.selfIdState();
    return !!currentSnapshot && !!selfId && currentSnapshot.hostId === selfId;
  });

  async createRoom(name: string): Promise<boolean> {
    const payload: CreateRoomPayload = { name };
    const response = await this.emitWithAck<CreateOrJoinAck>('room:create', payload);

    if (!response.ok) {
      this.errorMessage.set(response.message);
      return false;
    }

    this.errorMessage.set(null);
    this.snapshotState.set(response.snapshot);
    this.selfIdState.set(response.selfId);
    return true;
  }

  async joinRoom(roomCode: string, name: string): Promise<boolean> {
    const payload: JoinRoomPayload = { roomCode, name };
    const response = await this.emitWithAck<CreateOrJoinAck>('room:join', payload);

    if (!response.ok) {
      this.errorMessage.set(response.message);
      return false;
    }

    this.errorMessage.set(null);
    this.snapshotState.set(response.snapshot);
    this.selfIdState.set(response.selfId);
    return true;
  }

  async leaveRoom(): Promise<void> {
    if (!this.socket || !this.inRoom()) {
      return;
    }

    await this.emitWithAck<SocketAck>('room:leave', undefined);
    this.snapshotState.set(null);
    this.selfIdState.set(null);
    this.remoteCursorsState.set({});
    this.errorMessage.set(null);
  }

  publishCursorMove(x: number, y: number): void {
    if (!this.inRoom()) {
      return;
    }

    const socket = this.ensureSocket();
    socket.emit('cursor:move', { x, y } satisfies CursorMovePayload);
  }

  triggerFirecracker(x: number, y: number): void {
    const normalizedPayload: FirecrackerPayload = {
      x: Math.min(Math.max(x, 0), 1),
      y: Math.min(Math.max(y, 0), 1),
    };

    if (this.inRoom()) {
      const socket = this.ensureSocket();
      socket.emit('fun:firecracker', normalizedPayload);
      return;
    }

    this.firecrackerEventState.set(normalizedPayload);
  }

  triggerEmote(emoji: string, x: number, y: number): void {
    const payload: EmotePayload = {
      emoji,
      x: Math.min(Math.max(x, 0), 1),
      y: Math.min(Math.max(y, 0), 1),
    };

    if (this.inRoom()) {
      const socket = this.ensureSocket();
      socket.emit('fun:emote', payload);
      return;
    }

    this.emoteEventState.set(payload);
  }

  triggerFunEffect(
    type: FunEffectType,
    x: number,
    y: number,
    targetX?: number,
    targetY?: number,
  ): void {
    const payload: FunEffectPayload = {
      type,
      x: Math.min(Math.max(x, 0), 1),
      y: Math.min(Math.max(y, 0), 1),
      targetX: typeof targetX === 'number' ? Math.min(Math.max(targetX, 0), 1) : undefined,
      targetY: typeof targetY === 'number' ? Math.min(Math.max(targetY, 0), 1) : undefined,
    };

    if (this.inRoom()) {
      const socket = this.ensureSocket();
      socket.emit('fun:effect', payload);
      return;
    }

    this.funEffectEventState.set(payload);
  }

  async vote(card: VotePayload['card']): Promise<void> {
    if (!this.inRoom()) {
      return;
    }

    const response = await this.emitWithAck<SocketAck>('vote:set', { card } as VotePayload);
    if (!response.ok) {
      this.errorMessage.set(response.message);
    }
  }

  async clearVote(participantId: string): Promise<void> {
    if (!this.inRoom()) {
      return;
    }

    const response = await this.emitWithAck<SocketAck>('vote:clear', {
      participantId,
    } as ParticipantActionPayload);
    if (!response.ok) {
      this.errorMessage.set(response.message);
    }
  }

  async removeParticipant(participantId: string): Promise<void> {
    if (!this.inRoom()) {
      return;
    }

    const response = await this.emitWithAck<SocketAck>('participant:remove', {
      participantId,
    } as ParticipantActionPayload);
    if (!response.ok) {
      this.errorMessage.set(response.message);
    }
  }

  async toggleReveal(): Promise<void> {
    if (!this.inRoom()) {
      return;
    }

    const response = await this.emitWithAck<SocketAck>('round:toggleReveal', undefined);
    if (!response.ok) {
      this.errorMessage.set(response.message);
    }
  }

  async resetRound(): Promise<void> {
    if (!this.inRoom()) {
      return;
    }

    const response = await this.emitWithAck<SocketAck>('round:reset', undefined);
    if (!response.ok) {
      this.errorMessage.set(response.message);
    }
  }

  private ensureSocket(): Socket {
    if (this.socket) {
      return this.socket;
    }

    this.socket = io('http://localhost:3333', {
      autoConnect: true,
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      this.connected.set(true);
      this.errorMessage.set(null);
    });

    this.socket.on('disconnect', () => {
      this.connected.set(false);
      this.remoteCursorsState.set({});
    });

    this.socket.on('connect_error', () => {
      this.connected.set(false);
      this.errorMessage.set('Cannot connect to realtime server on port 3333.');
    });

    this.socket.on('room:state', (snapshot: RoomSnapshot) => {
      this.snapshotState.set(snapshot);
      this.reconcileRemoteCursors();
    });

    this.socket.on(
      'cursor:update',
      (payload: { participantId: string; x: number; y: number; name: string }) => {
        const selfId = this.selfIdState();
        if (!this.inRoom() || payload.participantId === selfId) {
          return;
        }

        this.remoteCursorsState.update((cursors) => ({
          ...cursors,
          [payload.participantId]: {
            participantId: payload.participantId,
            name: payload.name,
            x: payload.x,
            y: payload.y,
          },
        }));
      },
    );

    this.socket.on('cursor:leave', (payload: { participantId: string }) => {
      this.remoteCursorsState.update((cursors) => {
        const { [payload.participantId]: _removed, ...remaining } = cursors;
        return remaining;
      });
    });

    this.socket.on('fun:firecracker', (payload: FirecrackerPayload) => {
      this.firecrackerEventState.set(payload);
    });

    this.socket.on('fun:emote', (payload: EmotePayload) => {
      this.emoteEventState.set(payload);
    });

    this.socket.on('fun:effect', (payload: FunEffectPayload) => {
      this.funEffectEventState.set(payload);
    });

    return this.socket;
  }

  private emitWithAck<TResponse>(event: string, payload: unknown): Promise<TResponse> {
    const socket = this.ensureSocket();

    return new Promise<TResponse>((resolve) => {
      socket
        .timeout(SOCKET_ACK_TIMEOUT_MS)
        .emit(event, payload, (error: Error | null, response: TResponse) => {
          if (error) {
            resolve({
              ok: false,
              message: 'Realtime server is unavailable or not responding.',
            } as TResponse);
            return;
          }

          resolve(response);
        });
    });
  }

  private reconcileRemoteCursors(): void {
    const snapshot = this.snapshotState();
    const selfId = this.selfIdState();

    if (!snapshot || !selfId) {
      this.remoteCursorsState.set({});
      return;
    }

    const participantMap = new Map(
      snapshot.participants.map((participant) => [participant.id, participant.name]),
    );

    this.remoteCursorsState.update((cursors) => {
      const nextCursors: Record<string, RemoteCursor> = {};

      for (const [participantId, cursor] of Object.entries(cursors)) {
        if (participantId === selfId) {
          continue;
        }

        const name = participantMap.get(participantId);
        if (!name) {
          continue;
        }

        nextCursors[participantId] = {
          ...cursor,
          name,
        };
      }

      return nextCursors;
    });
  }
}
