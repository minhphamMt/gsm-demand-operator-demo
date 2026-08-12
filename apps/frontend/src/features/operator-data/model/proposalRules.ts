export function isPlanInputFresh(inputFreshUntil: string, now = new Date()) {
  return new Date(inputFreshUntil) >= now
}
