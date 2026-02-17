import { TimelineEvent } from '../types';
import { showConfirmDialog } from './confirmDialog';
import { DateInput } from './dateInput';
import { ApproxInput } from './approxInput';

export interface EventMenuCallbacks {
  onRename: (event: TimelineEvent, name: string) => void;
  onEditInfo: (event: TimelineEvent, info: string) => void;
  onChangeStart: (event: TimelineEvent, start: string) => void;
  onChangeEnd: (event: TimelineEvent, end: string | undefined) => void;
  onChangeStartApprox: (event: TimelineEvent, approx: [string, string] | undefined) => void;
  onChangeEndApprox: (event: TimelineEvent, approx: [string, string] | undefined) => void;
  onDelete: (event: TimelineEvent) => void;
  hasChildren: (event: TimelineEvent) => boolean;
}

type EventType = 'point' | 'range' | 'ongoing';

export class EventMenu {
  private el: HTMLDivElement;
  private titleSpan: HTMLSpanElement;
  private nameInput: HTMLInputElement;
  private infoInput: HTMLTextAreaElement;
  private currentEvent: TimelineEvent | null = null;

  // Type selector
  private typeBtns: Map<EventType, HTMLDivElement> = new Map();
  private currentType: EventType = 'range';

  // Date sections
  private startDateInput: DateInput;
  private startApproxInput: ApproxInput;
  private endSection: HTMLDivElement;
  private endDateInput: DateInput;
  private endApproxInput: ApproxInput;
  private endOngoingLabel: HTMLDivElement;
  private endDateContainer: HTMLDivElement;

  constructor(private callbacks: EventMenuCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'event-menu collapsed hidden';

    // Header
    const header = document.createElement('div');
    header.className = 'event-menu-header';
    this.titleSpan = document.createElement('span');
    this.titleSpan.className = 'event-menu-title';
    const chevron = document.createElement('span');
    chevron.className = 'event-menu-chevron';
    chevron.textContent = '\u25BC';
    header.appendChild(this.titleSpan);
    header.appendChild(chevron);
    header.addEventListener('click', () => {
      this.el.classList.toggle('collapsed');
    });
    this.el.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'event-menu-body';

    // Name field
    const nameField = document.createElement('div');
    nameField.className = 'event-menu-field';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.addEventListener('input', () => {
      if (!this.currentEvent) return;
      const val = this.nameInput.value.trim();
      if (val.length === 0) return;
      this.titleSpan.textContent = val;
      callbacks.onRename(this.currentEvent, val);
    });
    nameField.appendChild(nameLabel);
    nameField.appendChild(this.nameInput);
    body.appendChild(nameField);

    // Info field
    const infoField = document.createElement('div');
    infoField.className = 'event-menu-field';
    const infoLabel = document.createElement('label');
    infoLabel.textContent = 'Info';
    this.infoInput = document.createElement('textarea');
    this.infoInput.rows = 3;
    this.infoInput.addEventListener('input', () => {
      if (!this.currentEvent) return;
      callbacks.onEditInfo(this.currentEvent, this.infoInput.value);
    });
    infoField.appendChild(infoLabel);
    infoField.appendChild(this.infoInput);
    body.appendChild(infoField);

    // Type selector
    const typeRow = document.createElement('div');
    typeRow.className = 'event-menu-type';
    for (const type of ['point', 'range', 'ongoing'] as EventType[]) {
      const btn = document.createElement('div');
      btn.className = 'event-menu-type-btn';
      btn.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      btn.addEventListener('click', () => this.onTypeClick(type));
      typeRow.appendChild(btn);
      this.typeBtns.set(type, btn);
    }
    body.appendChild(typeRow);

    // Start section
    const startHeader = document.createElement('div');
    startHeader.className = 'event-menu-section';
    startHeader.textContent = 'Start';
    body.appendChild(startHeader);

    this.startDateInput = new DateInput((iso) => {
      if (!this.currentEvent) return;
      callbacks.onChangeStart(this.currentEvent, iso);
    });
    body.appendChild(this.startDateInput.getElement());

    this.startApproxInput = new ApproxInput((approx) => {
      if (!this.currentEvent) return;
      callbacks.onChangeStartApprox(this.currentEvent, approx);
    });
    body.appendChild(this.startApproxInput.getElement());

    // End section
    this.endSection = document.createElement('div');

    const endHeader = document.createElement('div');
    endHeader.className = 'event-menu-section';
    endHeader.textContent = 'End';
    this.endSection.appendChild(endHeader);

    // Ongoing label (shown when type is ongoing)
    this.endOngoingLabel = document.createElement('div');
    this.endOngoingLabel.className = 'event-menu-ongoing';
    this.endOngoingLabel.textContent = 'ongoing (present day)';
    this.endSection.appendChild(this.endOngoingLabel);

    // Date inputs for end (shown when type is range)
    this.endDateContainer = document.createElement('div');

    this.endDateInput = new DateInput((iso) => {
      if (!this.currentEvent) return;
      callbacks.onChangeEnd(this.currentEvent, iso);
    });
    this.endDateContainer.appendChild(this.endDateInput.getElement());

    this.endApproxInput = new ApproxInput((approx) => {
      if (!this.currentEvent) return;
      callbacks.onChangeEndApprox(this.currentEvent, approx);
    });
    this.endDateContainer.appendChild(this.endApproxInput.getElement());

    this.endSection.appendChild(this.endDateContainer);
    body.appendChild(this.endSection);

    // Delete button
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'event-menu-btn destructive';
    deleteBtn.textContent = 'Delete event';
    deleteBtn.addEventListener('click', () => {
      if (!this.currentEvent) return;
      const event = this.currentEvent;
      showConfirmDialog(`Delete "${event.name}"? This cannot be undone.`, () => {
        callbacks.onDelete(event);
      });
    });
    body.appendChild(deleteBtn);

    this.el.appendChild(body);
    document.body.appendChild(this.el);
  }

  show(event: TimelineEvent): void {
    this.currentEvent = event;
    this.titleSpan.textContent = event.name;
    this.nameInput.value = event.name;
    this.infoInput.value = event.info ?? '';

    // Determine type
    if (event.end === undefined) {
      this.currentType = 'point';
    } else if (event.end === 'ongoing') {
      this.currentType = 'ongoing';
    } else {
      this.currentType = 'range';
    }

    // Update type buttons
    this.updateTypeButtons();

    // Populate start
    this.startDateInput.setValue(event.start);
    this.startApproxInput.setValue(event.startApprox, event.start);

    // Populate end
    this.updateEndSection();

    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.currentEvent = null;
  }

  private updateTypeButtons(): void {
    const hasKids = this.currentEvent ? this.callbacks.hasChildren(this.currentEvent) : false;

    for (const [type, btn] of this.typeBtns) {
      btn.classList.toggle('active', type === this.currentType);
      // Block point if event has children
      const blocked = type === 'point' && hasKids && this.currentType !== 'point';
      btn.classList.toggle('disabled', blocked);
      if (blocked) {
        btn.title = 'Point events cannot have children';
      } else {
        btn.title = '';
      }
    }
  }

  private updateEndSection(): void {
    if (this.currentType === 'point') {
      this.endSection.style.display = 'none';
    } else if (this.currentType === 'ongoing') {
      this.endSection.style.display = '';
      this.endOngoingLabel.style.display = '';
      this.endDateContainer.style.display = 'none';
    } else {
      this.endSection.style.display = '';
      this.endOngoingLabel.style.display = 'none';
      this.endDateContainer.style.display = '';
      if (this.currentEvent?.end && this.currentEvent.end !== 'ongoing') {
        this.endDateInput.setValue(this.currentEvent.end);
        this.endApproxInput.setValue(this.currentEvent.endApprox, this.currentEvent.end);
      }
    }
  }

  private onTypeClick(newType: EventType): void {
    if (!this.currentEvent || newType === this.currentType) return;

    const hasKids = this.callbacks.hasChildren(this.currentEvent);
    if (newType === 'point' && hasKids) return; // blocked

    const oldType = this.currentType;
    this.currentType = newType;

    // Apply data changes
    if (newType === 'point') {
      this.callbacks.onChangeEnd(this.currentEvent, undefined);
      this.callbacks.onChangeEndApprox(this.currentEvent, undefined);
    } else if (newType === 'ongoing') {
      this.callbacks.onChangeEnd(this.currentEvent, 'ongoing');
      this.callbacks.onChangeEndApprox(this.currentEvent, undefined);
    } else {
      // Switching to range
      if (oldType === 'point' || oldType === 'ongoing') {
        // Default end: start year + 1, same precision
        const defaultEnd = offsetStartYear(this.currentEvent.start, 1);
        this.callbacks.onChangeEnd(this.currentEvent, defaultEnd);
      }
    }

    this.updateTypeButtons();
    this.updateEndSection();
  }
}

/** Offset the year in an ISO date string by delta. */
function offsetStartYear(iso: string, delta: number): string {
  let bce = false;
  let s = iso;
  if (s.startsWith('-')) {
    bce = true;
    s = s.slice(1);
  }
  const parts = s.split('-');
  const year = parseInt(parts[0], 10) || 1;
  const signed = bce ? -year : year;
  const newSigned = signed + delta;
  const newBce = newSigned < 0;
  const newYear = Math.max(1, Math.abs(newSigned));
  const prefix = newBce ? '-' : '';
  let result = prefix + String(newYear);
  if (parts.length >= 2) result += '-' + parts[1];
  if (parts.length >= 3) result += '-' + parts[2];
  return result;
}
