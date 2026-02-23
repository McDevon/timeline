/**
 * Read a .json file via FileReader and parse it.
 * Returns { data } on success, { error } on failure.
 */
export function readJsonFile(file: File): Promise<{ data: unknown } | { error: string }> {
  if (!file.name.endsWith('.json')) {
    return Promise.resolve({ error: `Cannot read "${file.name}": only .json files are supported` });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve({ data: JSON.parse(reader.result as string) });
      } catch {
        resolve({ error: `Invalid JSON in "${file.name}"` });
      }
    };
    reader.onerror = () => {
      resolve({ error: `Failed to read "${file.name}"` });
    };
    reader.readAsText(file);
  });
}

/** JSON-stringify data and trigger a file download. */
export function exportToFile(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
