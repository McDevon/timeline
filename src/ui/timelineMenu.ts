import { themes, Theme, applyTheme, loadSavedTheme } from '../themes';

export interface TimelineMenuCallbacks {
  onImport: () => void;
  onLoadFile: () => void;
  onExport: () => void;
  onToggleTodayLine: (show: boolean) => void;
  onDeleteAll: () => void;
  onReloadDefaults: () => void;
  onThemeChange: () => void;
}

export class TimelineMenu {
  private el: HTMLDivElement;
  private flyout: HTMLDivElement | null = null;
  private hideTimer = 0;
  private currentThemeId: string;

  constructor(callbacks: TimelineMenuCallbacks, initialShowTodayLine: boolean) {
    this.currentThemeId = loadSavedTheme().id;

    this.el = document.createElement('div');
    this.el.className = 'timeline-menu collapsed';

    // Header
    const header = document.createElement('div');
    header.className = 'timeline-menu-header';
    header.innerHTML = `<span class="timeline-menu-title">Timeline</span><span class="timeline-menu-chevron">\u25BC</span>`;
    header.addEventListener('click', () => {
      const wasCollapsed = this.el.classList.contains('collapsed');
      this.el.classList.toggle('collapsed');
      if (!wasCollapsed) this.hideFlyout();
    });
    this.el.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'timeline-menu-body';

    body.appendChild(this.createButton('Import events', false, callbacks.onImport));
    body.appendChild(this.createButton('Load events from file', false, callbacks.onLoadFile));
    body.appendChild(this.createButton('Export events', false, callbacks.onExport));
    body.appendChild(this.createCheckbox('Show today indicator', initialShowTodayLine, callbacks.onToggleTodayLine));
    body.appendChild(this.createThemeButton(callbacks));
    body.appendChild(this.createButton('Delete all events', true, callbacks.onDeleteAll));
    body.appendChild(this.createButton('Reload default events', true, callbacks.onReloadDefaults));

    this.el.appendChild(body);
    document.body.appendChild(this.el);

    // Close when clicking outside the menu and its flyout
    document.addEventListener('mousedown', (e) => {
      if (this.el.classList.contains('collapsed')) return;
      if (this.el.contains(e.target as Node)) return;
      if (this.flyout?.contains(e.target as Node)) return;
      this.el.classList.add('collapsed');
      this.hideFlyout();
    });
  }

  private createButton(label: string, destructive: boolean, onClick: () => void): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = 'timeline-menu-btn' + (destructive ? ' destructive' : '');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private createCheckbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'timeline-menu-btn';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.style.margin = '0 6px 0 0';
    checkbox.style.accentColor = 'var(--tl-check-color)';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    row.appendChild(checkbox);
    row.appendChild(labelSpan);
    row.addEventListener('click', (e) => {
      if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
      onChange(checkbox.checked);
    });
    return row;
  }

  private createThemeButton(callbacks: TimelineMenuCallbacks): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = 'timeline-menu-btn';
    btn.innerHTML = 'Color theme <span style="float:right">\u25B6</span>';

    btn.addEventListener('mouseenter', () => {
      clearTimeout(this.hideTimer);
      this.showFlyout(btn, callbacks);
    });

    btn.addEventListener('mouseleave', () => {
      this.scheduleHide();
    });

    return btn;
  }

  private showFlyout(anchor: HTMLDivElement, callbacks: TimelineMenuCallbacks) {
    if (this.flyout) {
      this.flyout.remove();
    }

    const flyout = document.createElement('div');
    flyout.className = 'theme-flyout';

    for (const theme of themes) {
      const row = document.createElement('div');
      row.className = 'theme-flyout-row';
      if (theme.id === this.currentThemeId) {
        row.classList.add('active');
      }

      // Swatches
      const swatchContainer = document.createElement('div');
      swatchContainer.className = 'theme-swatches';
      for (const color of theme.swatches) {
        const swatch = document.createElement('div');
        swatch.className = 'theme-swatch';
        swatch.style.background = color;
        swatchContainer.appendChild(swatch);
      }
      row.appendChild(swatchContainer);

      // Name
      const name = document.createElement('span');
      name.textContent = theme.name;
      row.appendChild(name);

      row.addEventListener('click', () => {
        this.applyThemeAndUpdate(theme, flyout, callbacks);
      });

      flyout.appendChild(row);
    }

    flyout.addEventListener('mouseenter', () => {
      clearTimeout(this.hideTimer);
    });

    flyout.addEventListener('mouseleave', () => {
      this.scheduleHide();
    });

    document.body.appendChild(flyout);
    this.flyout = flyout;

    // Position the flyout to the left of the menu (since menu is on the right edge)
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = this.el.getBoundingClientRect();
    const top = anchorRect.top;

    flyout.style.top = `${top}px`;
    flyout.style.left = '0px'; // temporary, to measure width
    const flyoutWidth = flyout.getBoundingClientRect().width;

    let left = menuRect.left - flyoutWidth - 4;
    // Fall back to right side if it would overflow left
    if (left < 8) {
      left = menuRect.right + 4;
    }
    flyout.style.left = `${left}px`;

    // Clamp vertical position if it overflows bottom
    const flyoutRect = flyout.getBoundingClientRect();
    if (flyoutRect.bottom > window.innerHeight - 8) {
      flyout.style.top = `${window.innerHeight - 8 - flyoutRect.height}px`;
    }
  }

  private applyThemeAndUpdate(theme: Theme, flyout: HTMLDivElement, callbacks: TimelineMenuCallbacks) {
    this.currentThemeId = theme.id;

    // Update active state on rows
    for (const row of flyout.querySelectorAll('.theme-flyout-row')) {
      row.classList.remove('active');
    }
    const rows = flyout.querySelectorAll('.theme-flyout-row');
    const idx = themes.indexOf(theme);
    if (idx >= 0 && rows[idx]) {
      rows[idx].classList.add('active');
    }

    applyTheme(theme, callbacks.onThemeChange);
  }

  private scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.hideFlyout();
    }, 150);
  }

  private hideFlyout() {
    if (this.flyout) {
      this.flyout.remove();
      this.flyout = null;
    }
  }
}
