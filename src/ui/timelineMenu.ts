export interface TimelineMenuCallbacks {
  onImport: () => void;
  onExport: () => void;
  onDeleteAll: () => void;
  onReloadDefaults: () => void;
}

export class TimelineMenu {
  private el: HTMLDivElement;

  constructor(callbacks: TimelineMenuCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'timeline-menu collapsed';

    // Header
    const header = document.createElement('div');
    header.className = 'timeline-menu-header';
    header.innerHTML = `<span class="timeline-menu-title">Timeline</span><span class="timeline-menu-chevron">\u25BC</span>`;
    header.addEventListener('click', () => {
      this.el.classList.toggle('collapsed');
    });
    this.el.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'timeline-menu-body';

    body.appendChild(this.createButton('Import events', false, callbacks.onImport));
    body.appendChild(this.createButton('Export events', false, callbacks.onExport));
    body.appendChild(this.createButton('Delete all events', true, callbacks.onDeleteAll));
    body.appendChild(this.createButton('Reload default events', true, callbacks.onReloadDefaults));

    this.el.appendChild(body);
    document.body.appendChild(this.el);
  }

  private createButton(label: string, destructive: boolean, onClick: () => void): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = 'timeline-menu-btn' + (destructive ? ' destructive' : '');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }
}
