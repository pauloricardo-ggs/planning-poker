export type PlanningCard = 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34 | '?' | '☕';

export interface Participant {
  id: string;
  name: string;
  vote: PlanningCard | null;
}

export interface Room {
  code: string;
  hostId: string;
  revealVotes: boolean;
  participants: Map<string, Participant>;
}

export interface RoomSnapshot {
  roomCode: string;
  hostId: string;
  revealVotes: boolean;
  participants: Participant[];
}
