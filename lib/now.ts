/**
 * Snapshot the current wall-clock time as a number of milliseconds since
 * the epoch, intended for use in server-component render bodies that
 * need a reference clock (relative-time labels, in-progress-step
 * durations, etc).
 *
 * React 19's `react-hooks/purity` rule flags `Date.now()` as impure when
 * called in a component's render path — true in client components,
 * which can re-render arbitrarily many times, but server components are
 * invoked once per request, so a wall-clock read at render time is
 * exactly what's needed.
 *
 * Centralising the eslint-disable here means individual server pages
 * don't each need their own disable comment + justification. They just
 * call `nowSnapshot()` and the lint exemption lives in one place.
 *
 * Do NOT use in client components — there, prefer a `useEffect` +
 * `useState` ticker so the displayed time stays consistent with React's
 * re-render contract.
 */
// eslint-disable-next-line react-hooks/purity -- intentional: this helper exists precisely to encapsulate the wall-clock read in server-component renders. See JSDoc above for context.
export const nowSnapshot = (): number => Date.now();
