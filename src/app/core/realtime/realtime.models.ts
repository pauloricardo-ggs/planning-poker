import { Participant, PlanningCard } from '../models/planning.models';

export interface RoomSnapshot {
  roomCode: string;
  hostId: string;
  revealVotes: boolean;
  participants: Participant[];
}

export interface CreateRoomPayload {
  name: string;
}

export interface JoinRoomPayload {
  roomCode: string;
  name: string;
}

export interface VotePayload {
  card: PlanningCard;
}

export interface ParticipantActionPayload {
  participantId: string;
}

export interface FirecrackerPayload {
  x: number;
  y: number;
}

export interface EmotePayload {
  emoji: string;
  x: number;
  y: number;
}

export interface CagePeekPayload {
  at: number;
}

export interface CinemaPeekPayload {
  at: number;
}

export type FunEffectType = 'rock' | 'coffee';

export interface FunEffectPayload {
  type: FunEffectType;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
}

export type SocketAck<TPayload extends object = Record<string, never>> =
  | ({ ok: true } & TPayload)
  | { ok: false; message: string };
