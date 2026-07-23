import React, { useState, useRef, useEffect } from 'react';

// Renders its children only once the placeholder scrolls near the viewport.
// Used to keep heavy, below-the-fold widgets out of the initial page work so
// the landing page paints fast and doesn't download/mount everything at once.
export default function DeferUntilVisible({ children, rootMargin = '300px', minHeight = 240, fallback = null }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (old browsers / SSR) → just render it.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} style={!visible ? { minHeight } : undefined}>
      {visible ? children : fallback}
    </div>
  );
}
