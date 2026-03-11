import { themes, Theme, applyTheme, loadSavedTheme } from '../themes';

export interface TimelineMenuCallbacks {
  onImport: () => void;
  onImportIntoEvent: () => void;
  onLoadFile: () => void;
  onExport: () => void;
  onToggleTodayLine: (show: boolean) => void;
  onToggleWeekendBands: (show: boolean) => void;
  onToggleSketchMode: (enabled: boolean) => void;
  onToggleEditMode: (enabled: boolean) => void;
  onToggleShowRangesAsDays: (enabled: boolean) => void;
  onDeleteAll: () => void;
  onReloadDefaults: () => void;
  onThemeChange: () => void;
}

export class TimelineMenu {
  private el: HTMLDivElement;
  private flyout: HTMLDivElement | null = null;
  private hideTimer = 0;
  private currentThemeId: string;
  private slug: string;
  private sketchCheckbox: HTMLInputElement | null = null;
  private editCheckbox: HTMLInputElement | null = null;
  private showTodayLine: boolean;
  private weekendBands: boolean;
  private sketchMode: boolean;
  private editMode: boolean;
  private showRangesAsDays: boolean;

  // Edit-only buttons to hide in observer mode
  private importBtn: HTMLDivElement;
  private importIntoBtn: HTMLDivElement;
  private loadFileBtn: HTMLDivElement;
  private deleteAllBtn: HTMLDivElement;
  private reloadDefaultsBtn: HTMLDivElement;

  constructor(callbacks: TimelineMenuCallbacks, initialShowTodayLine: boolean, initialWeekendBands: boolean, initialSketchMode: boolean, initialEditMode: boolean, initialShowRangesAsDays: boolean, slug = '') {
    this.slug = slug;
    this.currentThemeId = loadSavedTheme(slug).id;
    this.showTodayLine = initialShowTodayLine;
    this.weekendBands = initialWeekendBands;
    this.sketchMode = initialSketchMode;
    this.editMode = initialEditMode;
    this.showRangesAsDays = initialShowRangesAsDays;

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

    this.importBtn = this.createButton('Import events', false, callbacks.onImport);
    this.importIntoBtn = this.createButton('Import into new event', false, callbacks.onImportIntoEvent);
    this.loadFileBtn = this.createButton('Load events from file', false, callbacks.onLoadFile);
    body.appendChild(this.importBtn);
    body.appendChild(this.importIntoBtn);
    body.appendChild(this.loadFileBtn);
    body.appendChild(this.createButton('Export events', false, callbacks.onExport));
    body.appendChild(this.createViewButton(callbacks));
    this.deleteAllBtn = this.createButton('Delete all events', true, callbacks.onDeleteAll);
    this.reloadDefaultsBtn = this.createButton('Reload default events', true, callbacks.onReloadDefaults);
    body.appendChild(this.deleteAllBtn);
    body.appendChild(this.reloadDefaultsBtn);

    this.applyEditMode();

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

  private createViewButton(callbacks: TimelineMenuCallbacks): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = 'timeline-menu-btn';
    btn.innerHTML = 'View <span style="float:right">\u25B6</span>';

    btn.addEventListener('mouseenter', () => {
      clearTimeout(this.hideTimer);
      this.showViewFlyout(btn, callbacks);
    });

    btn.addEventListener('mouseleave', () => {
      this.scheduleHide();
    });

    return btn;
  }

  private showViewFlyout(anchor: HTMLDivElement, callbacks: TimelineMenuCallbacks) {
    if (this.flyout) {
      this.flyout.remove();
    }

    const flyout = document.createElement('div');
    flyout.className = 'theme-flyout';

    // Checkboxes
    const todayRow = this.createFlyoutCheckbox('Show today indicator', this.showTodayLine, (checked) => {
      this.showTodayLine = checked;
      callbacks.onToggleTodayLine(checked);
    });
    todayRow.dataset.tooltip = 'Show a vertical line marking the current date';
    flyout.appendChild(todayRow);

    const weekendRow = this.createFlyoutCheckbox('Weekend bands', this.weekendBands, (checked) => {
      this.weekendBands = checked;
      callbacks.onToggleWeekendBands(checked);
    });
    weekendRow.dataset.tooltip = 'Shade weekends when zoomed in to day level';
    flyout.appendChild(weekendRow);

    const daysRow = this.createFlyoutCheckbox('Show ranges as days', this.showRangesAsDays, (checked) => {
      this.showRangesAsDays = checked;
      callbacks.onToggleShowRangesAsDays(checked);
    });
    daysRow.dataset.tooltip = 'Show precise durations in total days';
    flyout.appendChild(daysRow);

    const editRow = this.createFlyoutCheckbox('Enable editing', this.editMode, (checked) => {
      this.editMode = checked;
      callbacks.onToggleEditMode(checked);
      // Rebuild flyout so sketch row updates immediately
      this.showViewFlyout(anchor, callbacks);
    });
    editRow.dataset.tooltip = 'Allow adding, modifying, and deleting events';
    this.editCheckbox = editRow.querySelector('input') as HTMLInputElement;
    flyout.appendChild(editRow);

    const sketchRow = this.createFlyoutCheckbox('Sketch mode', this.sketchMode, (checked) => {
      if (!this.editMode) return;
      this.sketchMode = checked;
      callbacks.onToggleSketchMode(checked);
    });
    sketchRow.dataset.tooltip = 'Drag events on the canvas to move or resize them';
    this.sketchCheckbox = sketchRow.querySelector('input') as HTMLInputElement;
    if (!this.editMode) {
      sketchRow.style.opacity = '0.4';
      sketchRow.style.pointerEvents = 'none';
    }
    flyout.appendChild(sketchRow);

    // Separator
    const sep = document.createElement('div');
    sep.style.borderTop = '1px solid var(--tl-border)';
    sep.style.margin = '4px 0';
    flyout.appendChild(sep);

    // Theme rows
    for (const theme of themes) {
      const row = document.createElement('div');
      row.className = 'theme-flyout-row';
      if (theme.id === this.currentThemeId) {
        row.classList.add('active');
      }

      const swatchContainer = document.createElement('div');
      swatchContainer.className = 'theme-swatches';
      for (const color of theme.swatches) {
        const swatch = document.createElement('div');
        swatch.className = 'theme-swatch';
        swatch.style.background = color;
        swatchContainer.appendChild(swatch);
      }
      row.appendChild(swatchContainer);

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

    this.positionFlyout(anchor);
  }

  private createFlyoutCheckbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'theme-flyout-row';
    row.style.cursor = 'pointer';
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

  private positionFlyout(anchor: HTMLDivElement) {
    const flyout = this.flyout;
    if (!flyout) return;

    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = this.el.getBoundingClientRect();
    const top = anchorRect.top;

    flyout.style.top = `${top}px`;
    flyout.style.left = '0px'; // temporary, to measure width
    const flyoutWidth = flyout.getBoundingClientRect().width;

    let left = menuRect.left - flyoutWidth - 4;
    if (left < 8) {
      left = menuRect.right + 4;
    }
    flyout.style.left = `${left}px`;

    const flyoutRect = flyout.getBoundingClientRect();
    if (flyoutRect.bottom > window.innerHeight - 8) {
      flyout.style.top = `${window.innerHeight - 8 - flyoutRect.height}px`;
    }
  }

  private applyThemeAndUpdate(theme: Theme, flyout: HTMLDivElement, callbacks: TimelineMenuCallbacks) {
    this.currentThemeId = theme.id;

    for (const row of flyout.querySelectorAll('.theme-flyout-row')) {
      row.classList.remove('active');
    }
    const rows = flyout.querySelectorAll('.theme-flyout-row');
    const idx = themes.indexOf(theme);
    // Offset by 5 checkbox rows + 1 separator
    const rowIdx = idx + 5;
    if (rowIdx >= 0 && rows[rowIdx]) {
      rows[rowIdx].classList.add('active');
    }

    applyTheme(this.slug, theme, callbacks.onThemeChange);
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

  /** Update the sketch mode checkbox from outside (e.g. keyboard shortcut). */
  setSketchMode(enabled: boolean) {
    this.sketchMode = enabled;
    if (this.sketchCheckbox) this.sketchCheckbox.checked = enabled;
  }

  setShowRangesAsDays(enabled: boolean) {
    this.showRangesAsDays = enabled;
  }

  setEditMode(enabled: boolean) {
    this.editMode = enabled;
    if (this.editCheckbox) this.editCheckbox.checked = enabled;
    this.applyEditMode();
  }

  private applyEditMode() {
    const display = this.editMode ? '' : 'none';
    this.importBtn.style.display = display;
    this.importIntoBtn.style.display = display;
    this.loadFileBtn.style.display = display;
    this.deleteAllBtn.style.display = display;
    this.reloadDefaultsBtn.style.display = display;
  }
}
