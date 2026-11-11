export type Attempt<T> = { ok: true; value: T } | { ok: false; message: string };

// Lets a page section show "couldn't read this" instead of taking the whole page down.
export async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
