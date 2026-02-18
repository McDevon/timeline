import { DateInput } from './dateInput';

export class ApproxInput {
  private el: HTMLDivElement;
  private checkbox: HTMLInputElement;
  private fields: HTMLDivElement;
  private earliestInput: DateInput;
  private latestInput: DateInput;
  private suppressChange = false;

  constructor(private onChange: (approx: [string, string] | undefined) => void) {
    this.el = document.createElement('div');
    this.el.className = 'approx-input';

    // Checkbox toggle
    const toggle = document.createElement('label');
    toggle.className = 'approx-toggle';
    this.checkbox = document.createElement('input');
    this.checkbox.type = 'checkbox';
    const label = document.createTextNode(' Uncertainty range');
    toggle.appendChild(this.checkbox);
    toggle.appendChild(label);
    this.el.appendChild(toggle);

    // Fields container (hidden when unchecked)
    this.fields = document.createElement('div');
    this.fields.className = 'approx-fields';
    this.fields.style.display = 'none';

    const earliestLabel = document.createElement('div');
    earliestLabel.className = 'approx-label';
    earliestLabel.textContent = 'Earliest';
    this.fields.appendChild(earliestLabel);

    this.earliestInput = new DateInput(() => this.emitChange());
    this.fields.appendChild(this.earliestInput.getElement());

    const latestLabel = document.createElement('div');
    latestLabel.className = 'approx-label';
    latestLabel.textContent = 'Latest';
    this.fields.appendChild(latestLabel);

    this.latestInput = new DateInput(() => this.emitChange());
    this.fields.appendChild(this.latestInput.getElement());

    this.el.appendChild(this.fields);

    // Toggle handler
    this.checkbox.addEventListener('change', () => {
      if (this.checkbox.checked) {
        this.fields.style.display = '';
      } else {
        this.fields.style.display = 'none';
      }
      this.emitChange();
    });
  }

  getElement(): HTMLDivElement {
    return this.el;
  }

  setValue(approx: [string, string] | undefined, nominalIso: string): void {
    this.suppressChange = true;
    if (approx) {
      this.checkbox.checked = true;
      this.fields.style.display = '';
      this.earliestInput.setValue(approx[0]);
      this.latestInput.setValue(approx[1]);
    } else {
      this.checkbox.checked = false;
      this.fields.style.display = 'none';
      // Pre-populate with ±1 year defaults based on nominal date
      // so they're ready if the user enables approximation
      const defaultEarliest = offsetYear(nominalIso, -1);
      const defaultLatest = offsetYear(nominalIso, 1);
      this.earliestInput.setValue(defaultEarliest);
      this.latestInput.setValue(defaultLatest);
    }
    this.suppressChange = false;
  }

  private emitChange(): void {
    if (this.suppressChange) return;
    if (this.checkbox.checked) {
      this.onChange([this.earliestInput.getValue(), this.latestInput.getValue()]);
    } else {
      this.onChange(undefined);
    }
  }
}

/** Offset the year component of an ISO date string by delta years. */
function offsetYear(iso: string, delta: number): string {
  let bce = false;
  let s = iso;
  if (s.startsWith('-')) {
    bce = true;
    s = s.slice(1);
  }
  const parts = s.split('-');
  let year = parseInt(parts[0], 10) || 1;

  // Apply offset in absolute terms
  const signed = bce ? -year : year;
  const newSigned = signed + delta;
  const newBce = newSigned < 0;
  const newYear = Math.max(1, Math.abs(newSigned));

  const prefix = newBce ? '-' : '';
  let result = prefix + String(newYear);
  // Preserve month/day if present
  if (parts.length >= 2) result += '-' + parts[1];
  if (parts.length >= 3) result += '-' + parts[2];
  return result;
}
