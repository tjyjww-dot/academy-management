/**
 * cn — classNames joiner (minimal, no deps)
 * Usage: cn('foo', cond && 'bar', undefined, 'baz')
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
