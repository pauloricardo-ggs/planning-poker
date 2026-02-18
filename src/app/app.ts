import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
}

interface FunEffectBurst {
  id: number;
  type: 'rock' | 'coffee';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

interface EmoteOption {
  type: 'emote' | 'firecracker' | 'coffee';
  emoji: string;
  label: string;
}

interface ParticipantMenuOption {
  type: 'rock';
  emoji: string;
  label: string;
}

interface ContextParticipant {
  id: string;
  name: string;
  targetX: number;
  targetY: number;
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
  private burstId = 0;
  private emoteId = 0;
  private effectId = 0;

  readonly contextMenuOpen = signal(false);
  readonly emoteSubmenuOpen = signal(false);
  readonly participantSubmenuOpen = signal(false);
  readonly contextMenuPosition = signal({ x: 0, y: 0 });
  readonly contextParticipant = signal<ContextParticipant | null>(null);
  readonly bursts = signal<FirecrackerBurst[]>([]);
  readonly emoteBursts = signal<EmoteBurst[]>([]);
  readonly funEffectBursts = signal<FunEffectBurst[]>([]);
  readonly emoteOptions: readonly EmoteOption[] = [
    { type: 'firecracker', emoji: '🎆', label: 'Firecracker burst' },
    { type: 'emote', emoji: '🎉', label: 'Cheer' },
    { type: 'emote', emoji: '🔥', label: 'Hype' },
    { type: 'emote', emoji: '😂', label: 'Laugh' },
    { type: 'emote', emoji: '👏', label: 'Clap' },
    { type: 'coffee', emoji: '☕', label: 'Drop coffee' },
  ];
  readonly participantMenuOptions: readonly ParticipantMenuOption[] = [
    { type: 'rock', emoji: '🪨', label: 'Throw a rock' },
  ];

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
    event.preventDefault();

    const maxX = Math.max(window.innerWidth - 220, 0);
    const maxY = Math.max(window.innerHeight - 140, 0);

    this.contextMenuPosition.set({
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
    });

    this.contextParticipant.set(this.resolveContextParticipant(event));
    this.emoteSubmenuOpen.set(false);
    this.participantSubmenuOpen.set(false);
    this.contextMenuOpen.set(true);
  }

  onWindowClick(): void {
    if (this.contextMenuOpen()) {
      this.emoteSubmenuOpen.set(false);
      this.participantSubmenuOpen.set(false);
      this.contextMenuOpen.set(false);
    }
  }

  onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.emoteSubmenuOpen.set(false);
      this.participantSubmenuOpen.set(false);
      this.contextMenuOpen.set(false);
    }
  }

  triggerReactionAtMenuPosition(option: EmoteOption): void {
    const position = this.contextMenuPosition();
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);

    if (option.type === 'firecracker') {
      this.realtimeGateway.triggerFirecracker(
        position.x / viewportWidth,
        position.y / viewportHeight,
      );
      return;
    }

    if (option.type === 'coffee') {
      this.realtimeGateway.triggerFunEffect(
        option.type,
        position.x / viewportWidth,
        position.y / viewportHeight,
      );
      return;
    }

    this.realtimeGateway.triggerEmote(
      option.emoji,
      position.x / viewportWidth,
      position.y / viewportHeight,
    );
  }

  onEmoteMenuEnter(): void {
    this.emoteSubmenuOpen.set(true);
  }

  onEmoteMenuLeave(): void {
    this.emoteSubmenuOpen.set(false);
  }

  onParticipantMenuEnter(): void {
    this.participantSubmenuOpen.set(true);
  }

  onParticipantMenuLeave(): void {
    this.participantSubmenuOpen.set(false);
  }

  triggerParticipantAction(option: ParticipantMenuOption): void {
    const target = this.contextParticipant();
    if (!target) {
      return;
    }

    if (option.type !== 'rock') {
      return;
    }

    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    const start = this.randomStartPoint(viewportWidth, viewportHeight);

    this.realtimeGateway.triggerFunEffect(
      'rock',
      start.x / viewportWidth,
      start.y / viewportHeight,
      target.targetX / viewportWidth,
      target.targetY / viewportHeight,
    );
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
    const burst: EmoteBurst = {
      id: ++this.emoteId,
      emoji,
      x,
      y,
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
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const participantNode = target.closest<HTMLElement>(
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

    const nameNode =
      participantNode.querySelector<HTMLElement>('.participant__name') ?? participantNode;
    const rect = nameNode.getBoundingClientRect();
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);

    const targetX = Math.min(Math.max(rect.left + rect.width / 2, 12), viewportWidth - 12);
    const targetY = Math.min(Math.max(rect.top + rect.height / 2, 12), viewportHeight - 12);

    return {
      id: participantId,
      name: participantName,
      targetX,
      targetY,
    };
  }

  private randomStartPoint(
    viewportWidth: number,
    viewportHeight: number,
  ): { x: number; y: number } {
    const margin = 16;
    const side = Math.floor(Math.random() * 4);

    if (side === 0) {
      return { x: margin, y: margin + Math.random() * Math.max(viewportHeight - margin * 2, 1) };
    }

    if (side === 1) {
      return {
        x: Math.max(viewportWidth - margin, margin),
        y: margin + Math.random() * Math.max(viewportHeight - margin * 2, 1),
      };
    }

    if (side === 2) {
      return { x: margin + Math.random() * Math.max(viewportWidth - margin * 2, 1), y: margin };
    }

    return {
      x: margin + Math.random() * Math.max(viewportWidth - margin * 2, 1),
      y: Math.max(viewportHeight - margin, margin),
    };
  }
}
