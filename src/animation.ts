import { Viewport } from './timeline/viewport';
import { LayoutItem } from './timeline/layout';
import { TimelineEvent } from './types';
import { LayoutTransition } from './timeline/renderer';

export interface LayoutTransitionState {
  startTime: number;
  fadingOut: LayoutItem[];
  yOffsets: Map<TimelineEvent, number>;
  fadingIn: Set<TimelineEvent>;
  /** Per-event start times for independent animation timing. */
  startTimes?: Map<TimelineEvent, number>;
}

const ZOOM_ANIM_MS = 150;
const SCROLL_ANIM_MS = 150;
export const LAYOUT_ANIM_MS = 200;

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export class AnimationManager {
  animFrom: Viewport | null = null;
  animTo: Viewport | null = null;
  private animStartTime = 0;

  private scrollFrom = 0;
  scrollTo: number | null = null;
  private scrollAnimStart = 0;

  layoutTransition: LayoutTransitionState | null = null;

  animateZoom(current: Viewport, target: Viewport) {
    this.animFrom = { ...current };
    this.animTo = target;
    this.animStartTime = performance.now();
  }

  animateScroll(currentScrollY: number, target: number, maxScroll: number) {
    this.scrollFrom = currentScrollY;
    this.scrollTo = Math.max(0, Math.min(target, maxScroll));
    this.scrollAnimStart = performance.now();
  }

  /** Advance all animations. Returns updated values and whether more frames are needed. */
  tick(viewport: Viewport, scrollY: number): {
    viewport: Viewport;
    scrollY: number;
    transition: LayoutTransition | undefined;
    needsFrame: boolean;
  } {
    let needsFrame = false;
    let newViewport = viewport;
    let newScrollY = scrollY;
    let transition: LayoutTransition | undefined;

    if (this.animFrom && this.animTo) {
      const elapsed = performance.now() - this.animStartTime;
      const t = Math.min(elapsed / ZOOM_ANIM_MS, 1);
      const e = easeInOut(t);
      newViewport = {
        start: this.animFrom.start + (this.animTo.start - this.animFrom.start) * e,
        end: this.animFrom.end + (this.animTo.end - this.animFrom.end) * e,
      };
      if (t < 1) needsFrame = true;
      else { this.animFrom = null; this.animTo = null; }
    }

    if (this.scrollTo !== null) {
      const elapsed = performance.now() - this.scrollAnimStart;
      const t = Math.min(elapsed / SCROLL_ANIM_MS, 1);
      newScrollY = this.scrollFrom + (this.scrollTo - this.scrollFrom) * easeInOut(t);
      if (t < 1) needsFrame = true;
      else this.scrollTo = null;
    }

    if (this.layoutTransition) {
      const now = performance.now();
      const globalElapsed = now - this.layoutTransition.startTime;
      const globalLt = Math.min(globalElapsed / LAYOUT_ANIM_MS, 1);

      // Pre-decay offsets using per-event start times (or global fallback)
      const decayedOffsets = new Map<TimelineEvent, number>();
      let anyActive = false;
      for (const [event, offset] of this.layoutTransition.yOffsets) {
        const eventStart = this.layoutTransition.startTimes?.get(event) ?? this.layoutTransition.startTime;
        const eventElapsed = now - eventStart;
        const eventLt = Math.min(eventElapsed / LAYOUT_ANIM_MS, 1);
        const decayed = offset * (1 - easeInOut(eventLt));
        if (Math.abs(decayed) > 0.1) {
          decayedOffsets.set(event, decayed);
          if (eventLt < 1) anyActive = true;
        }
      }

      transition = {
        fadingOut: this.layoutTransition.fadingOut,
        yOffsets: decayedOffsets,
        fadingIn: this.layoutTransition.fadingIn,
        progress: easeInOut(globalLt),
      };
      if (anyActive || globalLt < 1) needsFrame = true;
      else this.layoutTransition = null;
    }

    return { viewport: newViewport, scrollY: newScrollY, transition, needsFrame };
  }

  cancelAll() {
    this.animFrom = null;
    this.animTo = null;
    this.scrollTo = null;
    this.layoutTransition = null;
  }
}
