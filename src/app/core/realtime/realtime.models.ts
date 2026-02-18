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

export type SocketAck<TPayload extends object = Record<string, never>> =
  | ({ ok: true } & TPayload)
  | { ok: false; message: string };
