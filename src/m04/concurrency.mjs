// This limit applies to one file workflow, not to browser byte transfers.
export const DRIVE_FILE_CONCURRENCY = 3;

export async function orderedPool(items, limit, work) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid worker limit.');
  const results = new Array(items.length); let cursor = 0, failed = false, failure;
  async function worker() {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await work(items[index], index); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw failure;
  return results;
}

export function limiter(limit) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid request limit.');
  let active = 0; const queue = [];
  return {
    get active() { return active; },
    get waiting() { return queue.length; },
    async acquire() {
      if (active < limit) active++; else await new Promise(resolve => queue.push(resolve));
      let released = false;
      return () => {
        if (released) return; released = true;
        if (queue.length) queue.shift()(); else active--;
      };
    }
  };
}
