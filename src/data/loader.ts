import { TimelineEvent } from '../types';

export async function loadEvents(url: string): Promise<TimelineEvent[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load events: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<TimelineEvent[]>;
}
