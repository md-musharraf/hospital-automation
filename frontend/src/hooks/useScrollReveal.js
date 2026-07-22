import { useEffect } from 'react';

/**
 * Reveals any element carrying the `.reveal` class as it scrolls into view by
 * toggling `.is-visible` (styled in index.css). Re-scans on the `deps` you pass
 * so dynamically-rendered sections (e.g. after data loads) get observed too.
 *
 * Falls back to immediately showing everything when IntersectionObserver is
 * unavailable or the user prefers reduced motion.
 */
export default function useScrollReveal(deps = []) {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.reveal:not(.is-visible)'));
    if (!nodes.length) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      nodes.forEach((n) => n.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
