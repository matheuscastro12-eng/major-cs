// Junta classes ignorando falsy — usado pelos primitivos do design system.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
