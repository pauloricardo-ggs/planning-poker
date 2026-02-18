import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-session-summary',
  templateUrl: './session-summary.component.html',
  styleUrl: './session-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionSummaryComponent {
  readonly totalParticipants = input.required<number>();
  readonly votedCount = input.required<number>();
  readonly average = input.required<string>();
  readonly consensus = input.required<boolean>();
  readonly revealVotes = input.required<boolean>();
}
