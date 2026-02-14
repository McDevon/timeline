export interface TimelineEvent {
  name: string;
  start: string;
  end?: string;
  info?: string;
  nested?: TimelineEvent[];
}

export interface TimelineSelection {
  start: number;   // decimal year, always <= end
  end: number;     // decimal year, always >= start
  anchor: number;  // the year where the user first clicked (equals start or end)
}
