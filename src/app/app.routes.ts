import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/planning-poker/planning-poker.page').then(
        (module) => module.PlanningPokerPageComponent,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
