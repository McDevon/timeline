export interface TimelineEvent {
  name: string;
  start: string;
  end: string;
  info?: string;
  nested?: TimelineEvent[];
}
