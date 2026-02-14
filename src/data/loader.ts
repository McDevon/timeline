import { TimelineEvent } from '../types';

export async function loadEvents(url: string, fallbackUrl: string): Promise<TimelineEvent[]> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await (response.json() as Promise<TimelineEvent[]>);
    }
  } catch {
    // Primary URL missing or not valid JSON — try fallback
  }

  const fallback = await fetch(fallbackUrl);
  if (fallback.ok) {
    return fallback.json() as Promise<TimelineEvent[]>;
  }

  throw new Error(`Failed to load events from ${url} or ${fallbackUrl}`);
}
