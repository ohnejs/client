/**
 * `true` only when `A` and `B` are the same type, so an optional field added on one side fails too.
 */
export type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
