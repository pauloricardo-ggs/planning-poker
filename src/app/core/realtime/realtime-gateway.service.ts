import { computed, Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {
  CreateRoomPayload,
  EmotePayload,
  CagePeekPayload,
  CinemaPeekPayload,
  FirecrackerPayload,
  FunEffectPayload,
  FunEffectType,
  JoinRoomPayload,
  ParticipantActionPayload,
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
  private readonly firecrackerEventState = signal<FirecrackerPayload | null>(null);
  private readonly emoteEventState = signal<EmotePayload | null>(null);
  private readonly cagePeekEventState = signal<CagePeekPayload | null>(null);
  private readonly cinemaPeekEventState = signal<CinemaPeekPayload | null>(null);
  private readonly funEffectEventState = signal<FunEffectPayload | null>(null);

  readonly connected = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly snapshot = computed(() => this.snapshotState());
  readonly selfId = computed(() => this.selfIdState());
  readonly firecrackerEvent = computed(() => this.firecrackerEventState());
  readonly emoteEvent = computed(() => this.emoteEventState());
  readonly cagePeekEvent = computed(() => this.cagePeekEventState());
  readonly cinemaPeekEvent = computed(() => this.cinemaPeekEventState());
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
    this.errorMessage.set(null);
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

  triggerCagePeek(): void {
    const payload: CagePeekPayload = { at: Date.now() };

    if (this.inRoom()) {
      const socket = this.ensureSocket();
      socket.emit('fun:cage', payload);
      return;
    }

    this.cagePeekEventState.set(payload);
  }

  triggerCinemaPeek(): void {
    const payload: CinemaPeekPayload = { at: Date.now() };

    if (this.inRoom()) {
      const socket = this.ensureSocket();
      socket.emit('fun:cinema', payload);
      return;
    }

    this.cinemaPeekEventState.set(payload);
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

    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
    const realtimeUrl = `${protocol}//${hostname}:3333`;

    this.socket = io(realtimeUrl, {
      autoConnect: true,
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      this.connected.set(true);
      this.errorMessage.set(null);
    });

    this.socket.on('disconnect', () => {
      this.connected.set(false);
    });

    this.socket.on('connect_error', () => {
      this.connected.set(false);
      this.errorMessage.set('Cannot connect to realtime server on port 3333.');
    });

    this.socket.on('room:state', (snapshot: RoomSnapshot) => {
      this.snapshotState.set(snapshot);
    });

    this.socket.on('room:kicked', () => {
      this.snapshotState.set(null);
      this.selfIdState.set(null);
      this.errorMessage.set('You were removed from the room.');
    });

    this.socket.on('fun:firecracker', (payload: FirecrackerPayload) => {
      this.firecrackerEventState.set(payload);
    });

    this.socket.on('fun:emote', (payload: EmotePayload) => {
      this.emoteEventState.set(payload);
    });

    this.socket.on('fun:cage', (payload: CagePeekPayload) => {
      this.cagePeekEventState.set(payload);
    });

    this.socket.on('fun:cinema', (payload: CinemaPeekPayload) => {
      this.cinemaPeekEventState.set(payload);
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

}
