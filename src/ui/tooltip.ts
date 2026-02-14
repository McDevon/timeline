import { TimelineEvent } from '../types';
import { formatDate, formatDuration } from '../data/time';

const TOOLTIP_MARGIN = 12;

export class Tooltip {
  private el: HTMLDivElement;
  private _onClick: (() => void) | null = null;
  private _locked = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'timeline-tooltip';
    document.body.appendChild(this.el);

    this.el.addEventListener('click', () => {
      if (this._onClick) this._onClick();
    });
  }

  set onClick(handler: (() => void) | null) {
    this._onClick = handler;
  }

  show(event: TimelineEvent, x: number, y: number) {
    // Build content
    let html = `<strong>${this.escape(event.name)}</strong>`;
    if (event.end !== undefined) {
      const start = formatDate(event.start);
      const end = formatDate(event.end);
      const duration = formatDuration(event.start, event.end);
      html += `<br><span class="tooltip-dates">${start} – ${end} (${duration})</span>`;
    } else {
      html += `<br><span class="tooltip-dates">${formatDate(event.start)}</span>`;
    }
    if (event.info) {
      html += `<br><span class="tooltip-info">${this.escape(event.info)}</span>`;
    }
    this.el.innerHTML = html;

    // Position: show above-right of click point, clamp to viewport
    this.el.style.left = '0px';
    this.el.style.top = '0px';
    this.el.classList.add('visible');

    // Measure after making visible so dimensions are correct
    const rect = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + TOOLTIP_MARGIN;
    let top = y - rect.height - TOOLTIP_MARGIN;

    // Clamp right edge
    if (left + rect.width > vw - TOOLTIP_MARGIN) {
      left = x - rect.width - TOOLTIP_MARGIN;
    }
    // Clamp left edge
    if (left < TOOLTIP_MARGIN) {
      left = TOOLTIP_MARGIN;
    }
    // Clamp top edge — flip below if needed
    if (top < TOOLTIP_MARGIN) {
      top = y + TOOLTIP_MARGIN;
    }
    // Clamp bottom edge
    if (top + rect.height > vh - TOOLTIP_MARGIN) {
      top = vh - rect.height - TOOLTIP_MARGIN;
    }

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  lock() {
    this._locked = true;
    this.el.classList.add('locked');
  }

  hide() {
    this.el.classList.remove('visible');
    this.el.classList.remove('locked');
    this._locked = false;
  }

  get isLocked(): boolean {
    return this._locked;
  }

  private escape(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
