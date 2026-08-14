import { useEffect, useRef } from 'react';
import { socket } from '../App';

/**
 * Subscribe to several socket events and refresh ONCE for a burst of them.
 *
 * Why this matters for how fast the app feels: a single clinical action fans out
 * into several events. A doctor completing a checkup emits `queue-updated`,
 * `journey-updated`, `pharmacy-updated` and an `activity` line within a few
 * milliseconds of each other. Each portal was calling its loader on every one,
 * so one click produced three or four full refetches — each re-rendering a big
 * dashboard and, on the staff screen, refetching queues, patients AND the
 * overview. The UI visibly stuttered on a busy morning.
 *
 * Coalescing on a short trailing timer collapses that burst into one refresh.
 * The delay is small enough to still feel instant and large enough to catch the
 * whole fan-out.
 *
 *   useLiveRefresh(['queue-updated', 'lab-updated'], loadEverything);
 *
 * The callback is held in a ref, so passing an inline arrow function does not
 * resubscribe on every render (a classic cause of listener leaks on the shared
 * socket singleton).
 */
export default function useLiveRefresh(events, callback, { delay = 120, enabled = true } = {}) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Events are usually an inline array literal; join it so the effect keys off
  // the contents rather than a new array identity each render.
  const eventKey = Array.isArray(events) ? events.join('|') : String(events);

  useEffect(() => {
    if (!enabled) return undefined;

    const names = eventKey.split('|').filter(Boolean);
    let timer = null;
    let lastPayload;

    const onEvent = (payload) => {
      lastPayload = payload;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        callbackRef.current(lastPayload);
      }, delay);
    };

    names.forEach((name) => socket.on(name, onEvent));

    return () => {
      if (timer) clearTimeout(timer);
      // Always deregister THIS handler specifically — `socket` is a shared
      // singleton, so socket.off(name) with no handler would tear down every
      // other component's listener for the same event.
      names.forEach((name) => socket.off(name, onEvent));
    };
  }, [eventKey, delay, enabled]);
}
