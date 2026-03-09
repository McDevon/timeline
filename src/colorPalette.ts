export interface EventColor {
  id: string;
  label: string;
  hex: string;
}

export const EVENT_COLORS: EventColor[] = [
  { id: 'red',     label: 'Red',     hex: '#B05A45' },
  { id: 'orange',  label: 'Orange',  hex: '#B87333' },
  { id: 'amber',   label: 'Amber',   hex: '#A89030' },
  { id: 'yellow',  label: 'Yellow',  hex: '#A0A030' },
  { id: 'lime',    label: 'Lime',    hex: '#6B9B37' },
  { id: 'green',   label: 'Green',   hex: '#4A9060' },
  { id: 'teal',    label: 'Teal',    hex: '#3D8B8B' },
  { id: 'cyan',    label: 'Cyan',    hex: '#3A80A0' },
  { id: 'blue',    label: 'Blue',    hex: '#4A6FA5' },
  { id: 'indigo',  label: 'Indigo',  hex: '#5B5EA6' },
  { id: 'purple',  label: 'Purple',  hex: '#7B5EA7' },
  { id: 'magenta', label: 'Magenta', hex: '#9855A0' },
  { id: 'rose',    label: 'Rose',    hex: '#B5486E' },
  { id: 'brown',   label: 'Brown',   hex: '#8B7355' },
];

const colorMap = new Map<string, EventColor>();
for (const c of EVENT_COLORS) colorMap.set(c.id, c);

export const VALID_COLOR_IDS: Set<string> = new Set(EVENT_COLORS.map(c => c.id));

export function getEventColor(id: string | undefined): EventColor | undefined {
  if (id === undefined) return undefined;
  return colorMap.get(id);
}
