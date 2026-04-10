'use client';

// Design Ref: §10.2 -- Responsive media query hooks for mobile layout
// Plan SC: FR-22 Mobile responsive UI

import { useState, useEffect } from 'react';

/**
 * Subscribe to a CSS media query and return whether it matches.
 * Returns `false` during SSR to avoid hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    function handler(e: MediaQueryListEvent) {
      setMatches(e.matches);
    }

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * Convenience hook: true when viewport width <= 768px.
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}
