export interface TimelineConfig {
  slug: string;
  dataUrl: string;
  fallbackUrl: string;
  defaultTheme?: string;
  title?: string;
  compact?: boolean;
  showTodayLine?: boolean;
  unknownSlug?: string;
}

interface TimelineEntry {
  data: string;
  theme?: string;
  title?: string;
  compact?: boolean;
  showTodayLine?: boolean;
}

export async function resolveTimeline(): Promise<TimelineConfig> {
  const slug = location.pathname.replace(/^\/|\/$/g, '');

  if (!slug) {
    return { slug: '', dataUrl: '/events.json', fallbackUrl: '/events.example.json' };
  }

  try {
    const response = await fetch('/timelines.json');
    if (response.ok) {
      const config: Record<string, TimelineEntry> = await response.json();
      const entry = config[slug];
      if (entry) {
        return {
          slug,
          dataUrl: entry.data,
          fallbackUrl: '/events.example.json',
          defaultTheme: entry.theme,
          title: entry.title,
          compact: entry.compact,
          showTodayLine: entry.showTodayLine,
        };
      }
    }
  } catch {
    // Config unavailable — fall through to root defaults
  }

  // Unknown slug — fall back to root timeline but flag it
  return { slug: '', dataUrl: '/events.json', fallbackUrl: '/events.example.json', unknownSlug: slug };
}
