/** Typert gateway rejects undefined, NaN, and getter properties after Zod parse. */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
