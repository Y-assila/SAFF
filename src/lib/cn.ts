/** Join class names, skipping falsy values. Deliberately tiny: no class-merging dependency. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
