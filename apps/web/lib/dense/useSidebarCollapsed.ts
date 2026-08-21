"use client";

import { useEffect, useState } from "react";

/**
 * Persisted whole-sidebar collapse state, extracted out of DenseSidebar.tsx
 * into lib/dense's hook home (alongside useDenseScale, useRowNavigate) so it
 * can carry its own test file without dragging the sidebar component in.
 *
 * Two things this hook is careful about beyond just "read/write localStorage":
 *
 * - `ready` lags the applied stored value by one animation frame. The CSS
 *   side (`dense-theme.css`'s `.k-sidebar[data-ready="false"]` rule) turns
 *   the sidebar's width/opacity transitions off until `ready` is true, so
 *   the mount effect below writes the stored value to `collapsed` in its
 *   own commit (still transition-free), and only flips `ready` to true a
 *   frame later. Doing both in the same commit would let the very first
 *   paint after hydration animate 153px -> 58px, which is exactly the
 *   flash this sequencing exists to prevent.
 * - Both the read and the write are guarded with `try`/`catch` (the same
 *   shape as `parsePreference`'s guard one level up in `lib/dense/theme.ts`):
 *   `localStorage` can throw outright in Safari private browsing, under
 *   quota, or with storage disabled, and a collapse toggle is not worth an
 *   error boundary. On a throw the hook just keeps running in memory for
 *   the session — nothing is rethrown, nothing is logged.
 */

export const SIDEBAR_COLLAPSED_KEY = "k-dense-sidebar-collapsed";

/**
 * Pure parse, no `window` access — mirrors `parsePreference` in
 * `theme.ts` / `useDenseScale.ts`. Only the literal `"1"` means collapsed;
 * `null` and any other stored string (including `"0"`) mean expanded.
 */
export function parseCollapsed(stored: string | null): boolean {
  return stored === "1";
}

export function useSidebarCollapsed() {
  // Default to expanded and not-ready on the server render and the first
  // client render — no `window` access during render, so SSR and the first
  // client render agree.
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    } catch {
      // Unavailable/throwing storage — fall back to the default (expanded)
      // for this session.
    }
    setCollapsed(parseCollapsed(stored));

    // See the file header: `ready` must land a frame after `collapsed` so
    // the stored value is already applied, transition-free, before CSS
    // transitions turn on.
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Same as above — the toggle still works for the session even if
        // persisting it doesn't.
      }
      return next;
    });
  };

  return { collapsed, ready, toggle };
}
