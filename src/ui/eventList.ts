import { TimelineEvent } from '../types';
import { formatDate } from '../data/time';

export class EventListPanel {
  private el: HTMLDivElement;
  private rowMap = new Map<TimelineEvent, HTMLDivElement>();
  private childrenMap = new Map<TimelineEvent, HTMLDivElement>();
  private expandedEvents = new Set<TimelineEvent>();
  private highlightedRow: HTMLDivElement | null = null;
  private selectedRow: HTMLDivElement | null = null;
  private filterInput: HTMLInputElement;
  private filterClearBtn: HTMLDivElement;
  private preFilterExpanded: Set<TimelineEvent> | null = null;
  private allEvents: TimelineEvent[] = [];

  constructor(
    events: TimelineEvent[],
    onToggle: (event: TimelineEvent, visible: boolean) => void,
    onHover: (event: TimelineEvent | null) => void,
    onSelect: (event: TimelineEvent) => void,
    hiddenEvents?: Set<TimelineEvent>,
    private onDblClick?: (event: TimelineEvent) => void,
    private onContextMenu?: (event: TimelineEvent, x: number, y: number) => void,
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

    // Filter row
    const filterRow = document.createElement('div');
    filterRow.className = 'event-list-filter';
    this.filterInput = document.createElement('input');
    this.filterInput.type = 'text';
    this.filterInput.placeholder = 'Filter events\u2026';
    this.filterInput.addEventListener('input', () => this.applyFilter());
    this.filterClearBtn = document.createElement('div');
    this.filterClearBtn.className = 'event-list-filter-clear';
    this.filterClearBtn.textContent = '\u00D7';
    this.filterClearBtn.addEventListener('click', () => {
      this.filterInput.value = '';
      this.applyFilter();
    });
    filterRow.appendChild(this.filterInput);
    filterRow.appendChild(this.filterClearBtn);
    this.el.appendChild(filterRow);

    // Body
    this.allEvents = events;
    const body = document.createElement('div');
    body.className = 'event-list-body';

    // Sort events by start date
    const sorted = [...events].sort((a, b) => this.parseYear(a.start) - this.parseYear(b.start));

    for (const event of sorted) {
      body.appendChild(this.createItem(event, onToggle, onHover, onSelect, hiddenEvents, 0));
    }

    this.el.appendChild(body);
    document.body.appendChild(this.el);
  }

  addEvents(
    newEvents: TimelineEvent[],
    onToggle: (event: TimelineEvent, visible: boolean) => void,
    onHover: (event: TimelineEvent | null) => void,
    onSelect: (event: TimelineEvent) => void,
  ): void {
    const body = this.el.querySelector('.event-list-body');
    if (!body) return;

    for (const event of newEvents) {
      const item = this.createItem(event, onToggle, onHover, onSelect, undefined, 0);
      const eventYear = this.parseYear(event.start);

      // Insert in sorted position
      let inserted = false;
      for (const child of Array.from(body.children) as HTMLElement[]) {
        const childYear = parseFloat(child.dataset.startYear ?? '0');
        if (childYear > eventYear) {
          body.insertBefore(item, child);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        body.appendChild(item);
      }
    }
    if (this.filterInput.value) this.applyFilter();
  }

  clear(): void {
    const body = this.el.querySelector('.event-list-body');
    if (body) body.innerHTML = '';
    this.rowMap.clear();
    this.childrenMap.clear();
    this.expandedEvents.clear();
    this.highlightedRow = null;
    this.selectedRow = null;
  }

  updateEventName(event: TimelineEvent): void {
    const row = this.rowMap.get(event);
    if (!row) return;
    const nameEl = row.querySelector('.event-list-name');
    if (nameEl) nameEl.textContent = event.name;
  }

  removeEvent(event: TimelineEvent): void {
    const row = this.rowMap.get(event);
    if (row) {
      // The row is inside an .event-list-item wrapper
      const item = row.parentElement;
      if (item) item.remove();
      this.rowMap.delete(event);
      if (this.highlightedRow === row) this.highlightedRow = null;
      if (this.selectedRow === row) this.selectedRow = null;
    }
    this.childrenMap.delete(event);
    this.expandedEvents.delete(event);
    if (this.filterInput.value) this.applyFilter();
  }

  rebuild(
    events: TimelineEvent[],
    onToggle: (event: TimelineEvent, visible: boolean) => void,
    onHover: (event: TimelineEvent | null) => void,
    onSelect: (event: TimelineEvent) => void,
    hiddenEvents?: Set<TimelineEvent>,
    onContextMenu?: (event: TimelineEvent, x: number, y: number) => void,
  ): void {
    if (onContextMenu !== undefined) this.onContextMenu = onContextMenu;
    // Save expanded & selected state
    const expanded = new Set(this.expandedEvents);
    const prevSelected = this.selectedRow
      ? [...this.rowMap.entries()].find(([, r]) => r === this.selectedRow)?.[0] ?? null
      : null;

    this.clear();
    this.allEvents = events;
    const body = this.el.querySelector('.event-list-body');
    if (!body) return;

    const sorted = [...events].sort((a, b) => this.parseYear(a.start) - this.parseYear(b.start));
    for (const event of sorted) {
      body.appendChild(this.createItem(event, onToggle, onHover, onSelect, hiddenEvents, 0));
    }

    // Restore expanded state
    for (const event of expanded) {
      const container = this.childrenMap.get(event);
      const row = this.rowMap.get(event);
      if (container && row) {
        this.expandedEvents.add(event);
        const icon = row.querySelector('.event-list-arrow-icon');
        if (icon) icon.classList.add('expanded');
        container.style.maxHeight = 'none';
      }
    }

    // Restore selection
    if (prevSelected) {
      this.selectEvent(prevSelected);
    }

    // Re-apply filter
    if (this.filterInput.value) this.applyFilter();
  }

  selectEvent(event: TimelineEvent | null) {
    if (this.selectedRow) {
      this.selectedRow.classList.remove('selected');
      this.selectedRow = null;
    }
    if (event) {
      const row = this.rowMap.get(event) ?? null;
      if (row) {
        row.classList.add('selected');
        this.selectedRow = row;
      }
    }
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

  /** Expand all ancestor containers of a row so it becomes visible in the list. */
  private expandAncestors(row: HTMLDivElement): void {
    let el: HTMLElement | null = row.parentElement; // item wrapper
    while (el) {
      el = el.parentElement; // children container or body
      if (!el || el.classList.contains('event-list-body')) break;
      if (el.classList.contains('event-list-children')) {
        // Find the parent event that owns this children container
        for (const [event, container] of this.childrenMap) {
          if (container === el) {
            const parentRow = this.rowMap.get(event);
            const icon = parentRow?.querySelector('.event-list-arrow-icon');
            this.expandedEvents.add(event);
            if (icon) icon.classList.add('expanded');
            container.style.maxHeight = 'none';
            break;
          }
        }
        el = el.parentElement; // move to parent item wrapper
      }
    }
  }

  private applyFilter(): void {
    const text = this.filterInput.value.trim().toLowerCase();

    if (!text) {
      // Clear filter: remove all filter classes, restore expand state
      this.filterClearBtn.style.display = 'none';
      for (const row of this.rowMap.values()) {
        row.classList.remove('filter-ancestor');
        const item = row.parentElement;
        if (item) item.classList.remove('filtered-out');
      }
      // Restore pre-filter expand state
      if (this.preFilterExpanded !== null) {
        for (const [event, container] of this.childrenMap) {
          const row = this.rowMap.get(event);
          const icon = row?.querySelector('.event-list-arrow-icon');
          if (this.preFilterExpanded.has(event)) {
            this.expandedEvents.add(event);
            if (icon) icon.classList.add('expanded');
            container.style.maxHeight = 'none';
          } else {
            this.expandedEvents.delete(event);
            if (icon) icon.classList.remove('expanded');
            container.style.maxHeight = '0';
          }
        }
        this.preFilterExpanded = null;

        // Ensure selected item remains visible: expand its ancestors and scroll
        if (this.selectedRow) {
          this.expandAncestors(this.selectedRow);
          this.selectedRow.scrollIntoView({ block: 'nearest' });
        }
      }
      return;
    }

    // Save expand state on first filter keystroke
    if (this.preFilterExpanded === null) {
      this.preFilterExpanded = new Set(this.expandedEvents);
    }
    this.filterClearBtn.style.display = 'flex';

    // Determine which events match or have matching descendants
    const matchSet = new Set<TimelineEvent>();     // self-matches
    const ancestorSet = new Set<TimelineEvent>();   // has matching descendant

    const walk = (events: TimelineEvent[]): boolean => {
      let anyMatch = false;
      for (const event of events) {
        const selfMatch = event.name.toLowerCase().includes(text);
        let descendantMatch = false;
        if (event.nested && event.nested.length > 0) {
          descendantMatch = walk(event.nested);
        }
        if (selfMatch) {
          matchSet.add(event);
          anyMatch = true;
        }
        if (descendantMatch) {
          ancestorSet.add(event);
          anyMatch = true;
        }
      }
      return anyMatch;
    };
    walk(this.allEvents);

    // Apply visibility and styling
    for (const [event, row] of this.rowMap) {
      const item = row.parentElement;
      if (!item) continue;

      const isMatch = matchSet.has(event);
      const isAncestor = ancestorSet.has(event);

      if (isMatch || isAncestor) {
        item.classList.remove('filtered-out');
        row.classList.toggle('filter-ancestor', !isMatch && isAncestor);

        // Auto-expand ancestors to reveal matching descendants
        if (isAncestor) {
          const container = this.childrenMap.get(event);
          const icon = row.querySelector('.event-list-arrow-icon');
          if (container) {
            this.expandedEvents.add(event);
            if (icon) icon.classList.add('expanded');
            container.style.maxHeight = 'none';
          }
        }
      } else {
        item.classList.add('filtered-out');
        row.classList.remove('filter-ancestor');
      }
    }
  }

  private createItem(
    event: TimelineEvent,
    onToggle: (event: TimelineEvent, visible: boolean) => void,
    onHover: (event: TimelineEvent | null) => void,
    onSelect: (event: TimelineEvent) => void,
    hiddenEvents: Set<TimelineEvent> | undefined,
    depth: number,
  ): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'event-list-item';
    item.dataset.startYear = String(this.parseYear(event.start));

    const row = document.createElement('div');
    row.className = 'event-list-row';
    if (depth > 0) {
      row.style.background = `rgba(255,255,255,${depth * 0.02})`;
    }

    const hasChildren = event.nested !== undefined && event.nested.length > 0;

    // Arrow (left) — covers indentation area for a larger click target
    const arrow = document.createElement('div');
    arrow.className = 'event-list-arrow' + (hasChildren ? '' : ' placeholder');
    arrow.style.paddingLeft = `${10 + depth * 16}px`;
    arrow.style.paddingRight = '4px';
    const arrowIcon = document.createElement('span');
    arrowIcon.className = 'event-list-arrow-icon';
    arrowIcon.textContent = '\u25B6';
    arrow.appendChild(arrowIcon);

    // Info (center, flex:1)
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

    // Checkbox (right)
    const check = document.createElement('div');
    check.className = 'event-list-check';
    check.textContent = '\u2713';

    row.appendChild(arrow);
    row.appendChild(info);
    row.appendChild(check);
    item.appendChild(row);

    // Visibility state
    let visible = !(hiddenEvents?.has(event) ?? false);
    if (!visible) row.classList.add('hidden');

    // Checkbox click → toggle canvas visibility
    check.addEventListener('click', (e) => {
      e.stopPropagation();
      visible = !visible;
      row.classList.toggle('hidden', !visible);
      onToggle(event, visible);
    });

    // Click → select on timeline
    row.addEventListener('click', () => { onSelect(event); });

    // Double-click → zoom to event
    row.addEventListener('dblclick', () => { this.onDblClick?.(event); });

    // Hover sync
    row.addEventListener('mouseenter', () => { onHover(event); });
    row.addEventListener('mouseleave', () => { onHover(null); });

    // Right-click context menu
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onContextMenu?.(event, e.clientX, e.clientY);
    });

    this.rowMap.set(event, row);

    // Children container
    if (hasChildren) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'event-list-children';
      childrenContainer.style.maxHeight = '0';

      const sortedChildren = [...event.nested!].sort(
        (a, b) => this.parseYear(a.start) - this.parseYear(b.start),
      );
      for (const child of sortedChildren) {
        childrenContainer.appendChild(
          this.createItem(child, onToggle, onHover, onSelect, hiddenEvents, depth + 1),
        );
      }

      item.appendChild(childrenContainer);
      this.childrenMap.set(event, childrenContainer);

      // Arrow click → expand/collapse children in list
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleExpand(event, arrowIcon, childrenContainer);
      });
    }

    return item;
  }

  private toggleExpand(
    event: TimelineEvent,
    icon: HTMLElement,
    container: HTMLDivElement,
  ): void {
    const isExpanded = this.expandedEvents.has(event);

    if (isExpanded) {
      // Collapse: animate from scrollHeight to 0
      this.expandedEvents.delete(event);
      icon.classList.remove('expanded');
      container.style.maxHeight = container.scrollHeight + 'px';
      // Force reflow so the browser registers the starting value
      void container.offsetHeight;
      container.style.maxHeight = '0';
    } else {
      // Expand: animate from 0 to scrollHeight, then set to 'none'
      this.expandedEvents.add(event);
      icon.classList.add('expanded');
      container.style.maxHeight = container.scrollHeight + 'px';

      const onEnd = () => {
        container.removeEventListener('transitionend', onEnd);
        if (this.expandedEvents.has(event)) {
          container.style.maxHeight = 'none';
        }
      };
      container.addEventListener('transitionend', onEnd);
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

  private parseYear(s: string): number {
    if (s.startsWith('-')) return -parseInt(s.slice(1), 10);
    return parseInt(s, 10);
  }
}
