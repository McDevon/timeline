const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export class DateInput {
  private el: HTMLDivElement;
  private yearInput: HTMLInputElement;
  private eraSelect: HTMLSelectElement;
  private monthSelect: HTMLSelectElement;
  private daySelect: HTMLSelectElement;
  private dayRow: HTMLDivElement;
  private suppressChange = false;

  constructor(private onChange: (isoDate: string) => void) {
    this.el = document.createElement('div');
    this.el.className = 'date-input';

    // Row 1: Year + Era
    const row1 = document.createElement('div');
    row1.className = 'date-input-row';

    this.yearInput = document.createElement('input');
    this.yearInput.type = 'number';
    this.yearInput.min = '1';
    this.yearInput.className = 'date-input-year';
    this.yearInput.addEventListener('input', () => this.emitChange());

    this.eraSelect = document.createElement('select');
    this.eraSelect.className = 'date-input-era';
    this.eraSelect.innerHTML = '<option value="CE">CE</option><option value="BCE">BCE</option>';
    this.eraSelect.addEventListener('change', () => this.emitChange());

    row1.appendChild(this.yearInput);
    row1.appendChild(this.eraSelect);
    this.el.appendChild(row1);

    // Row 2: Month + Day
    const row2 = document.createElement('div');
    row2.className = 'date-input-row';

    this.monthSelect = document.createElement('select');
    this.monthSelect.className = 'date-input-month';
    this.monthSelect.innerHTML = '<option value="">\u2014</option>' +
      MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    this.monthSelect.addEventListener('change', () => {
      this.updateDayOptions();
      this.emitChange();
    });

    this.daySelect = document.createElement('select');
    this.daySelect.className = 'date-input-day';
    this.dayRow = row2;
    this.updateDayOptions();
    this.daySelect.addEventListener('change', () => this.emitChange());
    row2.appendChild(this.monthSelect);
    row2.appendChild(this.daySelect);
    this.el.appendChild(row2);
  }

  getElement(): HTMLDivElement {
    return this.el;
  }

  setValue(isoDate: string): void {
    this.suppressChange = true;
    const parsed = parseIso(isoDate);
    this.yearInput.value = String(parsed.year);
    this.eraSelect.value = parsed.bce ? 'BCE' : 'CE';
    this.monthSelect.value = parsed.month !== null ? String(parsed.month) : '';
    this.updateDayOptions();
    this.daySelect.value = parsed.day !== null ? String(parsed.day) : '';
    // Show/hide day row based on month
    this.dayRow.style.display = parsed.month !== null ? '' : 'none';
    this.suppressChange = false;
  }

  getValue(): string {
    const year = Math.max(1, parseInt(this.yearInput.value, 10) || 1);
    const bce = this.eraSelect.value === 'BCE';
    const month = this.monthSelect.value ? parseInt(this.monthSelect.value, 10) : null;
    const day = this.daySelect.value ? parseInt(this.daySelect.value, 10) : null;
    return buildIso(year, bce, month, day);
  }

  private updateDayOptions(): void {
    const monthVal = this.monthSelect.value;
    if (!monthVal) {
      this.dayRow.style.display = 'none';
      this.daySelect.value = '';
      return;
    }
    this.dayRow.style.display = '';

    const monthIdx = parseInt(monthVal, 10) - 1;
    const maxDay = DAYS_IN_MONTH[monthIdx];
    const currentDay = parseInt(this.daySelect.value, 10) || 0;

    let html = '<option value="">\u2014</option>';
    for (let d = 1; d <= maxDay; d++) {
      html += `<option value="${d}">${d}</option>`;
    }
    this.daySelect.innerHTML = html;

    // Restore day if still valid
    if (currentDay > 0 && currentDay <= maxDay) {
      this.daySelect.value = String(currentDay);
    }
  }

  private emitChange(): void {
    if (this.suppressChange) return;
    const year = parseInt(this.yearInput.value, 10);
    if (!year || year < 1) return;
    this.onChange(this.getValue());
  }
}

/** Parse an ISO date string into component parts. */
function parseIso(iso: string): { year: number; bce: boolean; month: number | null; day: number | null } {
  let bce = false;
  let s = iso;
  if (s.startsWith('-')) {
    bce = true;
    s = s.slice(1);
  }
  const parts = s.split('-');
  const year = parseInt(parts[0], 10) || 1;
  const month = parts.length >= 2 ? parseInt(parts[1], 10) : null;
  const day = parts.length >= 3 ? parseInt(parts[2], 10) : null;
  return { year, bce, month, day };
}

/** Build an ISO date string from component parts. */
function buildIso(year: number, bce: boolean, month: number | null, day: number | null): string {
  const prefix = bce ? '-' : '';
  let s = prefix + String(year);
  if (month !== null) {
    s += '-' + String(month).padStart(2, '0');
    if (day !== null) {
      s += '-' + String(day).padStart(2, '0');
    }
  }
  return s;
}
