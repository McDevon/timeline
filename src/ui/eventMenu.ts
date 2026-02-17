import { TimelineEvent } from '../types';
import { showConfirmDialog } from './confirmDialog';

export interface EventMenuCallbacks {
  onRename: (event: TimelineEvent, name: string) => void;
  onEditInfo: (event: TimelineEvent, info: string) => void;
  onDelete: (event: TimelineEvent) => void;
}

export class EventMenu {
  private el: HTMLDivElement;
  private titleSpan: HTMLSpanElement;
  private nameInput: HTMLInputElement;
  private infoInput: HTMLTextAreaElement;
  private currentEvent: TimelineEvent | null = null;

  constructor(callbacks: EventMenuCallbacks) {
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
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.currentEvent = null;
  }
}
