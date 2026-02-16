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
    const sorted = [...events].sort((a, b) => {
      return this.compareDate(a.start, b.start);
    });

    for (const event of sorted) {
      const row = document.createElement('div');
      row.className = 'event-list-row';

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

      let visible = !hiddenEvents?.has(event);
      if (!visible) row.classList.add('hidden');
      row.addEventListener('click', () => {
        visible = !visible;
        row.classList.toggle('hidden', !visible);
        onToggle(event, visible);
      });
      row.addEventListener('mouseenter', () => { onHover(event); });
      row.addEventListener('mouseleave', () => { onHover(null); });

      this.rowMap.set(event, row);
      body.appendChild(row);
    }

    this.el.appendChild(body);
    document.body.appendChild(this.el);
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

  private compareDate(a: string, b: string): number {
    // Handle negative years (BCE)
    const parseYear = (s: string) => {
      if (s.startsWith('-')) return -parseInt(s.slice(1), 10);
      return parseInt(s, 10);
    };
    return parseYear(a) - parseYear(b);
  }
}
