import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
  private lastCursorEmitAt = 0;

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

  readonly canCreateRoom = () => this.displayNameControl.value.trim().length > 0;

  readonly canJoinRoom = () =>
    this.displayNameControl.value.trim().length > 0 &&
    this.roomCodeControl.value.trim().length === 6;

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

  addParticipant(): void {
    if (this.sessionStore.mode() === 'multiplayer') {
      return;
    }

    if (this.participantNameControl.invalid) {
      return;
    }

    this.sessionStore.addParticipant(this.participantNameControl.value);
    this.participantNameControl.reset('');
  }

  vote(card: PlanningCard): void {
    this.sessionStore.voteForActiveParticipant(card);
  }

  onViewportPointerMove(event: PointerEvent): void {
    if (!this.sessionStore.inRoom() || this.sessionStore.mode() !== 'multiplayer') {
      return;
    }

    const now = performance.now();
    if (now - this.lastCursorEmitAt < 45) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }

    const x = Math.min(Math.max(event.clientX / viewportWidth, 0), 1);
    const y = Math.min(Math.max(event.clientY / viewportHeight, 0), 1);

    this.lastCursorEmitAt = now;
    this.sessionStore.publishCursorMove(x, y);
  }
}
