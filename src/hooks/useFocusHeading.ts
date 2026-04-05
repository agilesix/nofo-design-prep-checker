import { useRef, useEffect, type RefObject } from 'react';

/**
 * Returns a ref to attach to a page heading (h1).
 * Programmatically focuses the heading on mount so keyboard and screen reader
 * users are oriented to the new content on every page/step transition.
 * The heading must have tabIndex={-1} to receive focus without entering the tab order.
 */
export function useFocusHeading(): RefObject<HTMLHeadingElement> {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return ref;
}
