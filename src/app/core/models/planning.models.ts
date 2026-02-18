export type PlanningCard = 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34 | '?' | '☕';

export interface Participant {
  id: string;
  name: string;
  vote: PlanningCard | null;
}
