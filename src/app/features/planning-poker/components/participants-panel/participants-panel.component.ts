import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Participant } from '../../../../core/models/planning.models';

@Component({
  selector: 'app-participants-panel',
  templateUrl: './participants-panel.component.html',
  styleUrl: './participants-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParticipantsPanelComponent {
  readonly participants = input.required<readonly Participant[]>();
  readonly activeParticipantId = input<string | null>(null);
  readonly revealVotes = input(false);
  readonly selfParticipantId = input<string | null>(null);
  readonly isHost = input(false);
  readonly activeSelectable = input(true);

  readonly activeChanged = output<string>();
  readonly participantRemoved = output<string>();
  readonly voteCleared = output<string>();

  activate(participantId: string): void {
    if (!this.activeSelectable()) {
      return;
    }

    this.activeChanged.emit(participantId);
  }

  remove(participantId: string): void {
    this.participantRemoved.emit(participantId);
  }

  clearVote(participantId: string): void {
    this.voteCleared.emit(participantId);
  }
}
