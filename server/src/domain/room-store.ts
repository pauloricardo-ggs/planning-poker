import { Participant, PlanningCard, Room, RoomSnapshot } from './models.js';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function normalizeName(rawName: string): string {
  return rawName.trim().slice(0, 32);
}

export class RoomStore {
  private readonly roomsByCode = new Map<string, Room>();
  private readonly roomBySocketId = new Map<string, string>();

  createRoom(socketId: string, rawName: string): RoomSnapshot {
    const name = normalizeName(rawName);
    if (!name) {
      throw new Error('Participant name is required.');
    }

    let roomCode = generateRoomCode();
    while (this.roomsByCode.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const participant: Participant = {
      id: socketId,
      name,
      vote: null,
    };

    const room: Room = {
      code: roomCode,
      hostId: socketId,
      revealVotes: false,
      participants: new Map([[socketId, participant]]),
    };

    this.roomsByCode.set(roomCode, room);
    this.roomBySocketId.set(socketId, roomCode);

    return this.getSnapshot(roomCode);
  }

  joinRoom(socketId: string, rawRoomCode: string, rawName: string): RoomSnapshot {
    const roomCode = rawRoomCode.trim().toUpperCase();
    const name = normalizeName(rawName);

    if (!name) {
      throw new Error('Participant name is required.');
    }

    const room = this.roomsByCode.get(roomCode);
    if (!room) {
      throw new Error('Room not found.');
    }

    if (room.participants.has(socketId)) {
      return this.getSnapshot(roomCode);
    }

    room.participants.set(socketId, {
      id: socketId,
      name,
      vote: null,
    });
    this.roomBySocketId.set(socketId, roomCode);

    return this.getSnapshot(roomCode);
  }

  leaveRoom(socketId: string): RoomSnapshot | null {
    const roomCode = this.roomBySocketId.get(socketId);
    if (!roomCode) {
      return null;
    }

    const room = this.roomsByCode.get(roomCode);
    if (!room) {
      this.roomBySocketId.delete(socketId);
      return null;
    }

    room.participants.delete(socketId);
    this.roomBySocketId.delete(socketId);

    if (room.participants.size === 0) {
      this.roomsByCode.delete(roomCode);
      return null;
    }

    if (room.hostId === socketId) {
      room.hostId = room.participants.keys().next().value as string;
    }

    return this.getSnapshot(roomCode);
  }

  setVote(socketId: string, card: PlanningCard): RoomSnapshot {
    const room = this.getRoomBySocket(socketId);
    if (room.revealVotes) {
      throw new Error('Votes are locked after reveal. Start a new round to vote again.');
    }

    const participant = room.participants.get(socketId);

    if (!participant) {
      throw new Error('Participant not found.');
    }

    participant.vote = card;
    return this.getSnapshot(room.code);
  }

  clearVote(socketId: string, participantId: string): RoomSnapshot {
    const room = this.getRoomBySocket(socketId);
    if (room.revealVotes) {
      throw new Error('Votes are locked after reveal. Start a new round to clear votes.');
    }

    const canClear = socketId === participantId || room.hostId === socketId;
    if (!canClear) {
      throw new Error('Not allowed to clear this vote.');
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      throw new Error('Participant not found.');
    }

    participant.vote = null;
    return this.getSnapshot(room.code);
  }

  removeParticipant(socketId: string, participantId: string): RoomSnapshot {
    const room = this.getRoomBySocket(socketId);
    if (room.hostId !== socketId) {
      throw new Error('Only host can remove participants.');
    }

    if (!room.participants.has(participantId)) {
      throw new Error('Participant not found.');
    }

    room.participants.delete(participantId);
    this.roomBySocketId.delete(participantId);

    if (room.participants.size === 0) {
      this.roomsByCode.delete(room.code);
      return {
        roomCode: room.code,
        hostId: '',
        revealVotes: false,
        participants: [],
      };
    }

    if (room.hostId === participantId) {
      room.hostId = room.participants.keys().next().value as string;
    }

    return this.getSnapshot(room.code);
  }

  toggleReveal(socketId: string): RoomSnapshot {
    const room = this.getRoomBySocket(socketId);
    if (room.hostId !== socketId) {
      throw new Error('Only host can reveal votes.');
    }

    room.revealVotes = !room.revealVotes;
    return this.getSnapshot(room.code);
  }

  resetRound(socketId: string): RoomSnapshot {
    const room = this.getRoomBySocket(socketId);
    if (room.hostId !== socketId) {
      throw new Error('Only host can reset rounds.');
    }

    room.revealVotes = false;
    for (const participant of room.participants.values()) {
      participant.vote = null;
    }

    return this.getSnapshot(room.code);
  }

  getRoomCodeForSocket(socketId: string): string | null {
    return this.roomBySocketId.get(socketId) ?? null;
  }

  getSnapshot(roomCode: string): RoomSnapshot {
    const room = this.roomsByCode.get(roomCode);
    if (!room) {
      throw new Error('Room not found.');
    }

    return {
      roomCode: room.code,
      hostId: room.hostId,
      revealVotes: room.revealVotes,
      participants: [...room.participants.values()],
    };
  }

  private getRoomBySocket(socketId: string): Room {
    const roomCode = this.roomBySocketId.get(socketId);
    if (!roomCode) {
      throw new Error('You are not connected to any room.');
    }

    const room = this.roomsByCode.get(roomCode);
    if (!room) {
      throw new Error('Room not found.');
    }

    return room;
  }
}
