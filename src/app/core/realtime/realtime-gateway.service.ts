import { computed, Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import {
  CreateRoomPayload,
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

  readonly connected = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly snapshot = computed(() => this.snapshotState());
  readonly selfId = computed(() => this.selfIdState());
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
    });

    this.socket.on('connect_error', () => {
      this.connected.set(false);
      this.errorMessage.set('Cannot connect to realtime server on port 3333.');
    });

    this.socket.on('room:state', (snapshot: RoomSnapshot) => {
      this.snapshotState.set(snapshot);
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
