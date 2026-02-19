import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PlanningSessionStore } from './core/state/planning-session.store';
import { RealtimeGatewayService } from './core/realtime/realtime-gateway.service';

interface FirecrackerParticle {
  id: number;
  dx: number;
  dy: number;
  hue: number;
  durationMs: number;
}

interface FirecrackerBurst {
  id: number;
  x: number;
  y: number;
  particles: FirecrackerParticle[];
}

interface EmoteBurst {
  id: number;
  emoji: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
}

interface FunEffectBurst {
  id: number;
  type: 'rock' | 'coffee';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

interface ContextParticipant {
  id: string;
  name: string;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly realtimeGateway = inject(RealtimeGatewayService);
  readonly sessionStore = inject(PlanningSessionStore);
  private burstId = 0;
  private emoteId = 0;
  private effectId = 0;

  readonly contextMenuOpen = signal(false);
  readonly contextMenuPosition = signal({ x: 0, y: 0 });
  readonly contextParticipant = signal<ContextParticipant | null>(null);
  readonly bursts = signal<FirecrackerBurst[]>([]);
  readonly emoteBursts = signal<EmoteBurst[]>([]);
  readonly funEffectBursts = signal<FunEffectBurst[]>([]);

  constructor() {
    effect(() => {
      const firecrackerEvent = this.realtimeGateway.firecrackerEvent();
      if (!firecrackerEvent) {
        return;
      }

      this.spawnFirecracker(
        Math.round(firecrackerEvent.x * window.innerWidth),
        Math.round(firecrackerEvent.y * window.innerHeight),
      );
    });

    effect(() => {
      const emoteEvent = this.realtimeGateway.emoteEvent();
      if (!emoteEvent) {
        return;
      }

      this.spawnEmote(
        emoteEvent.emoji,
        Math.round(emoteEvent.x * window.innerWidth),
        Math.round(emoteEvent.y * window.innerHeight),
      );
    });

    effect(() => {
      const effectEvent = this.realtimeGateway.funEffectEvent();
      if (!effectEvent) {
        return;
      }

      this.spawnFunEffect(
        effectEvent.type,
        Math.round(effectEvent.x * window.innerWidth),
        Math.round(effectEvent.y * window.innerHeight),
        Math.round((effectEvent.targetX ?? effectEvent.x) * window.innerWidth),
        Math.round((effectEvent.targetY ?? effectEvent.y) * window.innerHeight),
      );
    });
  }

  onContextMenu(event: MouseEvent): void {
    const participant = this.resolveContextParticipant(event);
    if (!participant) {
      this.contextMenuOpen.set(false);
      return;
    }

    event.preventDefault();

    const menuWidth = 300;
    const menuHeight = 150;
    const emoteRailHeight = 52;
    const gap = 12;
    const minY = emoteRailHeight + gap;
    const maxX = Math.max(window.innerWidth - menuWidth, 0);
    const maxY = Math.max(window.innerHeight - menuHeight, minY);
    const nextX = Math.min(Math.max(event.clientX, 12), maxX);
    const nextY = Math.min(Math.max(event.clientY, minY), maxY);

    this.contextMenuPosition.set({ x: nextX, y: nextY });
    this.contextParticipant.set(participant);
    this.contextMenuOpen.set(true);
  }

  onWindowClick(): void {
    if (this.contextMenuOpen()) {
      this.contextMenuOpen.set(false);
    }
  }

  onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.contextMenuOpen.set(false);
    }
  }

  private spawnFirecracker(x: number, y: number): void {
    const particleCount = 20;
    const particles: FirecrackerParticle[] = Array.from({ length: particleCount }, (_, index) => {
      const angle = (index / particleCount) * Math.PI * 2;
      const distance = 50 + Math.random() * 40;
      return {
        id: index,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        hue: Math.floor(Math.random() * 360),
        durationMs: 520 + Math.random() * 260,
      };
    });

    const burst: FirecrackerBurst = {
      id: ++this.burstId,
      x,
      y,
      particles,
    };

    this.bursts.update((activeBursts) => [...activeBursts, burst]);

    window.setTimeout(() => {
      this.bursts.update((activeBursts) =>
        activeBursts.filter((activeBurst) => activeBurst.id !== burst.id),
      );
    }, 900);
  }

  private spawnEmote(emoji: string, x: number, y: number): void {
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    const start = this.randomOffscreenStart(viewportWidth, viewportHeight);
    const offsetX = start.x - x;
    const offsetY = start.y - y;

    const burst: EmoteBurst = {
      id: ++this.emoteId,
      emoji,
      x,
      y,
      offsetX,
      offsetY,
    };

    this.emoteBursts.update((activeBursts) => [...activeBursts, burst]);

    window.setTimeout(() => {
      this.emoteBursts.update((activeBursts) =>
        activeBursts.filter((activeBurst) => activeBurst.id !== burst.id),
      );
    }, 1200);
  }

  private spawnFunEffect(
    type: 'rock' | 'coffee',
    x: number,
    y: number,
    targetX: number,
    targetY: number,
  ): void {
    const burst: FunEffectBurst = {
      id: ++this.effectId,
      type,
      x,
      y,
      targetX,
      targetY,
    };

    this.funEffectBursts.update((activeBursts) => [...activeBursts, burst]);

    window.setTimeout(() => {
      this.funEffectBursts.update((activeBursts) =>
        activeBursts.filter((activeBurst) => activeBurst.id !== burst.id),
      );
    }, 1900);
  }

  private resolveContextParticipant(event: MouseEvent): ContextParticipant | null {
    const target = event.target;
    const elementTarget =
      target instanceof HTMLElement ? target : target instanceof Text ? target.parentElement : null;
    if (!elementTarget) {
      return null;
    }

    const participantNode = elementTarget.closest<HTMLElement>(
      '[data-participant-id][data-participant-name]',
    );
    if (!participantNode) {
      return null;
    }

    const participantId = participantNode.dataset['participantId'];
    const participantName = participantNode.dataset['participantName'];
    if (!participantId || !participantName) {
      return null;
    }

    const rect = participantNode.getBoundingClientRect();

    return {
      id: participantId,
      name: participantName,
      bounds: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  private randomOffscreenStart(
    viewportWidth: number,
    viewportHeight: number,
  ): { x: number; y: number } {
    const margin = 80;
    const side = Math.floor(Math.random() * 4);

    if (side === 0) {
      return {
        x: this.randomInRange(-margin, viewportWidth + margin),
        y: -margin - Math.random() * 120,
      };
    }

    if (side === 1) {
      return {
        x: viewportWidth + margin + Math.random() * 120,
        y: this.randomInRange(-margin, viewportHeight + margin),
      };
    }

    if (side === 2) {
      return {
        x: this.randomInRange(-margin, viewportWidth + margin),
        y: viewportHeight + margin + Math.random() * 120,
      };
    }

    return {
      x: -margin - Math.random() * 120,
      y: this.randomInRange(-margin, viewportHeight + margin),
    };
  }

  private randomInRange(min: number, max: number): number {
    if (max <= min) {
      return min;
    }

    return min + Math.random() * (max - min);
  }

}
