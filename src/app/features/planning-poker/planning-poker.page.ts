import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { PlanningCard } from '../../core/models/planning.models';
import { PlanningSessionStore } from '../../core/state/planning-session.store';
import { CardDeckComponent } from './components/card-deck/card-deck.component';
import { ParticipantsPanelComponent } from './components/participants-panel/participants-panel.component';
import { SessionSummaryComponent } from './components/session-summary/session-summary.component';

@Component({
  selector: 'app-planning-poker-page',
  imports: [
    ReactiveFormsModule,
    CardDeckComponent,
    ParticipantsPanelComponent,
    SessionSummaryComponent,
  ],
  templateUrl: './planning-poker.page.html',
  styleUrl: './planning-poker.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningPokerPageComponent {
  readonly sessionStore = inject(PlanningSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly displayNameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(32)],
  });

  readonly roomCodeControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(6), Validators.maxLength(6)],
  });

  readonly participantNameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(32)],
  });

  readonly inviteRoomCode = signal<string | null>(null);

  readonly canCreateRoom = () =>
    this.displayNameControl.value.trim().length > 0 && !this.inviteRoomCode();

  readonly canJoinRoom = () =>
    this.displayNameControl.value.trim().length > 0 &&
    this.roomCodeControl.value.trim().length === 6;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const inviteCode = params.get('room');
      if (!inviteCode) {
        this.inviteRoomCode.set(null);
        return;
      }

      const normalized = inviteCode.trim().toUpperCase();
      if (normalized.length !== 6) {
        this.inviteRoomCode.set(null);
        return;
      }

      this.inviteRoomCode.set(normalized);
      this.roomCodeControl.setValue(normalized);
    });
  }

  async createRoom(): Promise<void> {
    const displayName = this.displayNameControl.value.trim();
    if (!displayName) {
      this.displayNameControl.markAsTouched();
      return;
    }

    await this.sessionStore.createRoom(displayName);
  }

  async joinRoom(): Promise<void> {
    const displayName = this.displayNameControl.value.trim();
    const roomCode = this.roomCodeControl.value.trim().toUpperCase();

    if (!displayName || roomCode.length !== 6) {
      this.displayNameControl.markAsTouched();
      this.roomCodeControl.markAsTouched();
      return;
    }

    await this.sessionStore.joinRoom(roomCode, displayName);
  }

  async leaveRoom(): Promise<void> {
    await this.sessionStore.leaveRoom();
  }

  async inviteParticipants(): Promise<void> {
    const roomCode = this.sessionStore.roomCode();
    if (!roomCode) {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    url.hash = '';

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Planning Poker',
          text: 'Entre na sessão com seu nome:',
          url: url.toString(),
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    await navigator.clipboard.writeText(url.toString());
  }

  clearInviteRoom(): void {
    this.inviteRoomCode.set(null);
    this.roomCodeControl.reset('');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.hash = '';
    window.history.replaceState({}, '', url.toString());
  }

  vote(card: PlanningCard): void {
    this.sessionStore.voteForActiveParticipant(card);
  }

  canShowClear(): boolean {
    return this.sessionStore.mode() === 'multiplayer' && !!this.sessionStore.myParticipant();
  }

  isClearDisabled(): boolean {
    return (
      this.sessionStore.revealVotes() ||
      !this.sessionStore.myParticipant() ||
      this.sessionStore.myParticipant()?.vote === null
    );
  }

  clearMyVote(): void {
    const myParticipant = this.sessionStore.myParticipant();
    if (!myParticipant || this.sessionStore.revealVotes()) {
      return;
    }

    this.sessionStore.clearVote(myParticipant.id);
  }

}
