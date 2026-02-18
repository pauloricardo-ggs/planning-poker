import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PlanningCard } from '../../../../core/models/planning.models';

@Component({
  selector: 'app-card-deck',
  templateUrl: './card-deck.component.html',
  styleUrl: './card-deck.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardDeckComponent {
  readonly cards = input.required<readonly PlanningCard[]>();
  readonly selectedCard = input<PlanningCard | null>(null);
  readonly disabled = input(false);

  readonly cardSelected = output<PlanningCard>();

  selectCard(card: PlanningCard): void {
    if (this.disabled()) {
      return;
    }

    this.cardSelected.emit(card);
  }
}
