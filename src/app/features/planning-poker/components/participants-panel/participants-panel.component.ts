import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Participant } from '../../../../core/models/planning.models';
import { RealtimeGatewayService } from '../../../../core/realtime/realtime-gateway.service';

@Component({
  selector: 'app-participants-panel',
  templateUrl: './participants-panel.component.html',
  styleUrl: './participants-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParticipantsPanelComponent {
  private readonly realtimeGateway = inject(RealtimeGatewayService);

  readonly participants = input.required<readonly Participant[]>();
  readonly activeParticipantId = input<string | null>(null);
  readonly revealVotes = input(false);
  readonly selfParticipantId = input<string | null>(null);
  readonly isHost = input(false);
  readonly activeSelectable = input(true);

  readonly quickEmotes = ['🧻', '✈️', '🎯', '☕'] as const;
  readonly customEmotes = ['👍', '🌧️', '🚀', '✨', '😄', '🤝', '🔥'] as const;
  readonly customEmoteOpenId = signal<string | null>(null);

  readonly activeChanged = output<string>();
  readonly participantRemoved = output<string>();

  activate(participantId: string): void {
    if (!this.activeSelectable()) {
      return;
    }

    this.activeChanged.emit(participantId);
  }

  remove(participantId: string): void {
    this.participantRemoved.emit(participantId);
  }

  toggleCustomEmotes(participantId: string): void {
    this.customEmoteOpenId.update((current) => (current === participantId ? null : participantId));
  }

  closeCustomEmotes(participantId: string): void {
    if (this.customEmoteOpenId() === participantId) {
      this.customEmoteOpenId.set(null);
    }
  }

  triggerEmote(emoji: string, participantElement: HTMLElement): void {
    const rect = participantElement.getBoundingClientRect();
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);

    const padding = 12;
    const minX = rect.left + padding;
    const maxX = rect.left + rect.width - padding;
    const minY = rect.top + padding;
    const maxY = rect.top + rect.height - padding;

    const targetX = this.clamp(this.randomInRange(minX, Math.max(minX, maxX)), 12, viewportWidth - 12);
    const targetY = this.clamp(this.randomInRange(minY, Math.max(minY, maxY)), 12, viewportHeight - 12);

    this.realtimeGateway.triggerEmote(
      emoji,
      targetX / viewportWidth,
      targetY / viewportHeight,
    );
  }

  private randomInRange(min: number, max: number): number {
    if (max <= min) {
      return min;
    }

    return min + Math.random() * (max - min);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
