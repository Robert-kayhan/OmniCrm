const RESERVED_SLUGS = new Set(['api', 'admin', 'www', 'app', 'auth', 'static', 'public']);

export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'org';
}

/**
 * Appends `-2`, `-3`, … until `isTaken` says the slug is free. `isTaken` hits
 * the database, so the caller must still rely on the unique constraint for the
 * race between the check and the insert.
 */
export async function uniqueSlug(
  input: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(input);
  let candidate = RESERVED_SLUGS.has(base) ? `${base}-org` : base;

  for (let suffix = 2; await isTaken(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
    if (suffix > 500) {
      candidate = `${base}-${Date.now().toString(36)}`;
      break;
    }
  }

  return candidate;
}
