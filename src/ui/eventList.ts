import { TimelineEvent } from '../types';
import { formatDate } from '../data/time';

export class EventListPanel {
  private el: HTMLDivElement;
  private rowMap = new Map<TimelineEvent, HTMLDivElement>();
  private highlightedRow: HTMLDivElement | null = null;

  constructor(
    events: TimelineEvent[],
    onToggle: (event: TimelineEvent, visible: boolean) => void,
    onHover: (event: TimelineEvent | null) => void,
    hiddenEvents?: Set<TimelineEvent>,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'event-list-panel collapsed';

    // Header
    const header = document.createElement('div');
    header.className = 'event-list-header';
    header.innerHTML = `<span class="event-list-title">Events</span><span class="event-list-chevron">\u25BC</span>`;
    header.addEventListener('click', () => {
      this.el.classList.toggle('collapsed');
    });
    this.el.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'event-list-body';

    // Sort events by start date
    const sorted = [...events].sort((a, b) => this.parseYear(a.start) - this.parseYear(b.start));

    for (const event of sorted) {
      const hidden = hiddenEvents?.has(event) ?? false;
      const row = this.createRow(event, onToggle, onHover, hidden);
      body.appendChild(row);
    }

    this.el.appendChild(body);
    document.body.appendChild(this.el);
  }

  addEvents(
    newEvents: TimelineEvent[],
    onToggle: (event: TimelineEvent, visible: boolean) => void,
    onHover: (event: TimelineEvent | null) => void,
  ): void {
    const body = this.el.querySelector('.event-list-body');
    if (!body) return;

    for (const event of newEvents) {
      const row = this.createRow(event, onToggle, onHover, false);
      const eventYear = this.parseYear(event.start);

      // Insert in sorted position
      let inserted = false;
      for (const child of Array.from(body.children) as HTMLDivElement[]) {
        if (parseFloat(child.dataset.startYear ?? '0') > eventYear) {
          body.insertBefore(row, child);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        body.appendChild(row);
      }
    }
  }

  clear(): void {
    const body = this.el.querySelector('.event-list-body');
    if (body) body.innerHTML = '';
    this.rowMap.clear();
    this.highlightedRow = null;
  }

  highlightEvent(event: TimelineEvent | null) {
    if (this.highlightedRow) {
      this.highlightedRow.classList.remove('highlighted');
      this.highlightedRow = null;
    }
    if (event) {
      const row = this.rowMap.get(event) ?? null;
      if (row) {
        row.classList.add('highlighted');
        this.highlightedRow = row;
      }
    }
  }

  private createRow(
    event: TimelineEvent,
    onToggle: (event: TimelineEvent, visible: boolean) => void,
    onHover: (event: TimelineEvent | null) => void,
    hidden: boolean,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'event-list-row';
    row.dataset.startYear = String(this.parseYear(event.start));

    const check = document.createElement('div');
    check.className = 'event-list-check';
    check.textContent = '\u2713';

    const info = document.createElement('div');
    info.className = 'event-list-info';

    const name = document.createElement('div');
    name.className = 'event-list-name';
    name.textContent = event.name;

    const dates = document.createElement('div');
    dates.className = 'event-list-dates';
    dates.textContent = this.formatEventDates(event);

    info.appendChild(name);
    info.appendChild(dates);
    row.appendChild(check);
    row.appendChild(info);

    let visible = !hidden;
    if (!visible) row.classList.add('hidden');
    row.addEventListener('click', () => {
      visible = !visible;
      row.classList.toggle('hidden', !visible);
      onToggle(event, visible);
    });
    row.addEventListener('mouseenter', () => { onHover(event); });
    row.addEventListener('mouseleave', () => { onHover(null); });

    this.rowMap.set(event, row);
    return row;
  }

  private formatEventDates(event: TimelineEvent): string {
    const start = formatDate(event.start);
    if (event.end === 'ongoing') {
      return `${start} \u2013 present`;
    }
    if (event.end !== undefined) {
      return `${start} \u2013 ${formatDate(event.end)}`;
    }
    return start;
  }

  private parseYear(s: string): number {
    if (s.startsWith('-')) return -parseInt(s.slice(1), 10);
    return parseInt(s, 10);
  }
}
