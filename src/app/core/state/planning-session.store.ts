import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Participant, PlanningCard } from '../models/planning.models';
import { RealtimeGatewayService } from '../realtime/realtime-gateway.service';

type NumericPlanningCard = Exclude<PlanningCard, '?' | '☕'>;

const DEFAULT_DECK: readonly PlanningCard[] = [1, 2, 3, 5, 8, 13, 21, 34, '?', '☕'];

function isNumericCard(vote: PlanningCard | null): vote is NumericPlanningCard {
  return typeof vote === 'number';
}

@Injectable({ providedIn: 'root' })
export class PlanningSessionStore {
  private readonly realtimeGateway = inject(RealtimeGatewayService);

  readonly deck = signal(DEFAULT_DECK);

  private readonly participantsState = signal<Participant[]>([]);

  readonly participants = computed(() => this.participantsState());

  readonly activeParticipantId = signal<string | null>(this.participantsState()[0]?.id ?? null);

  readonly mode = signal<'local' | 'multiplayer'>('local');

  readonly revealVotes = signal(false);

  readonly roomCode = computed(() => this.realtimeGateway.roomCode());
  readonly inRoom = computed(() => this.realtimeGateway.inRoom());
  readonly isHost = computed(() => this.realtimeGateway.isHost());
  readonly connected = computed(() => this.realtimeGateway.connected());
  readonly connectionError = computed(() => this.realtimeGateway.errorMessage());
  readonly selfParticipantId = computed(() => this.realtimeGateway.selfId());

  readonly activeParticipant = computed(() => {
    const participantId = this.activeParticipantId();
    return this.participantsState().find((participant) => participant.id === participantId) ?? null;
  });

  readonly myParticipant = computed(() => {
    const selfId = this.selfParticipantId();
    return this.participantsState().find((participant) => participant.id === selfId) ?? null;
  });

  readonly totalParticipants = computed(() => this.participantsState().length);

  readonly votedCount = computed(
    () => this.participantsState().filter((participant) => participant.vote !== null).length,
  );

  readonly allVoted = computed(() => {
    const total = this.totalParticipants();
    return total > 0 && this.votedCount() === total;
  });

  readonly average = computed(() => {
    const numericVotes = this.participantsState()
      .map((participant) => participant.vote)
      .filter(isNumericCard);

    if (numericVotes.length === 0) {
      return '-';
    }

    const total = numericVotes.reduce((sum, vote) => sum + vote, 0);
    return (total / numericVotes.length).toFixed(1);
  });

  readonly consensus = computed(() => {
    const numericVotes = this.participantsState()
      .map((participant) => participant.vote)
      .filter(isNumericCard);

    if (numericVotes.length <= 1) {
      return false;
    }

    return numericVotes.every((vote) => vote === numericVotes[0]);
  });

  constructor() {
    effect(() => {
      const snapshot = this.realtimeGateway.snapshot();
      if (!snapshot) {
        if (this.mode() === 'multiplayer') {
          this.resetToLocalDefaults();
          this.mode.set('local');
        }
        return;
      }

      this.mode.set('multiplayer');
      this.participantsState.set(snapshot.participants);
      this.revealVotes.set(snapshot.revealVotes);
      this.activeParticipantId.set(this.realtimeGateway.selfId());
    });
  }

  async createRoom(name: string): Promise<void> {
    await this.realtimeGateway.createRoom(name);
  }

  async joinRoom(roomCode: string, name: string): Promise<void> {
    await this.realtimeGateway.joinRoom(roomCode.trim().toUpperCase(), name);
  }

  async leaveRoom(): Promise<void> {
    await this.realtimeGateway.leaveRoom();
  }

  addParticipant(rawName: string): void {
    if (this.mode() === 'multiplayer') {
      return;
    }

    const name = rawName.trim();
    if (!name) {
      return;
    }

    const newParticipant: Participant = {
      id: crypto.randomUUID(),
      name,
      vote: null,
    };

    this.participantsState.update((participants) => [...participants, newParticipant]);

    if (!this.activeParticipantId()) {
      this.activeParticipantId.set(newParticipant.id);
    }
  }

  removeParticipant(participantId: string): void {
    if (this.mode() === 'multiplayer') {
      void this.realtimeGateway.removeParticipant(participantId);
      return;
    }

    this.participantsState.update((participants) =>
      participants.filter((participant) => participant.id !== participantId),
    );

    if (this.activeParticipantId() === participantId) {
      this.activeParticipantId.set(this.participantsState()[0]?.id ?? null);
    }
  }

  setActiveParticipant(participantId: string): void {
    if (this.mode() === 'multiplayer') {
      return;
    }

    this.activeParticipantId.set(participantId);
  }

  voteForActiveParticipant(card: PlanningCard): void {
    if (this.revealVotes()) {
      return;
    }

    if (this.mode() === 'multiplayer') {
      void this.realtimeGateway.vote(card);
      return;
    }

    const participantId = this.activeParticipantId();
    if (!participantId) {
      return;
    }

    this.participantsState.update((participants) =>
      participants.map((participant) =>
        participant.id === participantId
          ? {
              ...participant,
              vote: card,
            }
          : participant,
      ),
    );
  }

  clearVote(participantId: string): void {
    if (this.revealVotes()) {
      return;
    }

    if (this.mode() === 'multiplayer') {
      void this.realtimeGateway.clearVote(participantId);
      return;
    }

    this.participantsState.update((participants) =>
      participants.map((participant) =>
        participant.id === participantId
          ? {
              ...participant,
              vote: null,
            }
          : participant,
      ),
    );
  }

  clearRound(): void {
    if (this.mode() === 'multiplayer') {
      void this.realtimeGateway.resetRound();
      return;
    }

    this.participantsState.update((participants) =>
      participants.map((participant) => ({
        ...participant,
        vote: null,
      })),
    );
    this.revealVotes.set(false);
  }

  toggleRevealVotes(): void {
    if (this.mode() === 'multiplayer') {
      void this.realtimeGateway.toggleReveal();
      return;
    }

    this.revealVotes.update((currentValue) => !currentValue);
  }

  private resetToLocalDefaults(): void {
    this.participantsState.set([]);
    this.activeParticipantId.set(this.participantsState()[0]?.id ?? null);
    this.revealVotes.set(false);
  }
}
