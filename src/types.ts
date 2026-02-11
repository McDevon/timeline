export interface TimelineEvent {
  name: string;
  start: number;
  end: number;
  info?: string;
  nested?: TimelineEvent[];
}
