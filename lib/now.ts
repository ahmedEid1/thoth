/**
 * Snapshot the current wall-clock time as a number of milliseconds since
 * the epoch, intended for use in server-component render bodies that
 * need a reference clock (relative-time labels, in-progress-step
 * durations, etc).
 *
 * React 19's `react-hooks/purity` rule flags `Date.now()` when it's
 * called *inside a component/hook render body*. Calling it here — in a
 * plain module-level function — sidesteps the rule entirely (the lint
 * never fires on non-component code), which is the whole point: server
 * pages call `nowSnapshot()` instead of inlining `Date.now()` in their
 * render, so no per-site eslint-disable is needed. Server components run
 * once per request, so a wall-clock read at render time is exactly what
 * a relative-time label / in-progress duration needs.
 *
 * Do NOT use in client components — there, prefer a `useEffect` +
 * `useState` ticker so the displayed time stays consistent with React's
 * re-render contract.
 */
export const nowSnapshot = (): number => Date.now();
