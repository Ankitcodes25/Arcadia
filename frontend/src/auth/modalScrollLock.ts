/*
 * Document scroll locking for every Arcadia modal layer.
 *
 * The page behind an open modal must stay exactly where the reader left it.
 * Hiding the document overflow alone is not enough: it can still let the page
 * move in some browsers (notably iOS) and keyboard scrolling can still reach
 * the document. The lock therefore fixes the body in place at the current
 * scroll offset for as long as any layer needs it:
 *
 *   body { position: fixed; top: -scrollY; left: -scrollX; width: 100% }
 *
 * The body's own inline styles and the original scroll position are captured
 * once, then restored by the last release. The document overflow is held by the
 * `has-modal-scroll-lock` class on <html> for the same lifetime. Every layer is
 * reference counted, so a child modal opening above a parent cannot unlock the
 * document when it closes, and a double cleanup cannot decrement another
 * layer's lock.
 *
 * `scrollbar-gutter: stable` is held for as long as the lock is engaged (see
 * `index.css`), so the space the scrollbar occupied is reserved while the
 * scrollbar itself is gone. The available width is therefore identical before
 * and after locking, and a centred parent dialog does not move sideways when a
 * child layer opens over it.
 */

type BodyStyleSnapshot = {
  position: string;
  top: string;
  left: string;
  width: string;
  overflow: string;
};

type ScrollLockSnapshot = {
  scrollX: number;
  scrollY: number;
  pathname: string;
  body: BodyStyleSnapshot;
};

let lockCount = 0;
let snapshot: ScrollLockSnapshot | null = null;

function currentScrollX(): number {
  return window.scrollX ?? document.documentElement.scrollLeft ?? document.body.scrollLeft ?? 0;
}

function currentScrollY(): number {
  return window.scrollY ?? document.documentElement.scrollTop ?? document.body.scrollTop ?? 0;
}

function restoreSnapshot(saved: ScrollLockSnapshot) {
  document.body.style.position = saved.body.position;
  document.body.style.top = saved.body.top;
  document.body.style.left = saved.body.left;
  document.body.style.width = saved.body.width;
  document.body.style.overflow = saved.body.overflow;

  document.documentElement.classList.remove(MODAL_LOCK_CLASS);

  /*
   * A route change can leave the new page mounted underneath a still-open
   * dialog (the Navbar and its login dialog survive player navigations). That
   * route owns its own scroll position, and the previous page's offset is no
   * longer meaningful: restoring it would drop the reader into the middle of
   * the new page. On the same route the exact previous position is still
   * restored as before.
   */
  const routeChanged = window.location.pathname !== saved.pathname;

  /*
   * The page is scrollable again now that its styles are back. `scroll-behavior:
   * smooth` is declared globally for in-page anchors, so it is temporarily
   * replaced with `auto` here: closing a modal must restore the previous
   * position immediately, never animate the reader up or down the page.
   */
  if (!routeChanged && (saved.scrollX !== 0 || saved.scrollY !== 0)) {
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    try {
      if (typeof window.scrollTo === "function") {
        window.scrollTo(saved.scrollX, saved.scrollY);
      } else {
        document.documentElement.scrollTop = saved.scrollY;
        document.documentElement.scrollLeft = saved.scrollX;
      }
    } catch {
      // A failed programmatic scroll must never leave the cleanup throwing and
      // the caller's modal stuck. Fall back to the scrolling element directly;
      // the page is already scrollable again at this point.
      document.documentElement.scrollTop = saved.scrollY;
      document.documentElement.scrollLeft = saved.scrollX;
    } finally {
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    }
  }
}

/**
 * Holds the document scroll for as long as it is engaged. Call the returned
 * function to release it; the last release restores the exact previous state,
 * body styles and scroll position.
 */
export function acquireModalScrollLock(): () => void {
  if (lockCount === 0) {
    const body = document.body;
    snapshot = {
      scrollX: currentScrollX(),
      scrollY: currentScrollY(),
      pathname: window.location.pathname,
      body: {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
        overflow: body.style.overflow,
      },
    };

    body.style.position = "fixed";
    body.style.top = `-${snapshot.scrollY}px`;
    body.style.left = `-${snapshot.scrollX}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    // The class also hides the document overflow and disables overscroll
    // chaining/ rubber-banding; see index.css.
    document.documentElement.classList.add(MODAL_LOCK_CLASS);
  }
  lockCount += 1;

  let released = false;
  return () => {
    // A double release must not unlock a layer that is still open.
    if (released) return;
    released = true;

    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && snapshot) {
      const saved = snapshot;
      snapshot = null;
      restoreSnapshot(saved);
    }
  };
}

/** Exported for the stylesheet contract and for tests. */
export const MODAL_LOCK_CLASS = "has-modal-scroll-lock";

/** The number of layers currently holding the lock. Test-only helper. */
export function activeModalScrollLocks(): number {
  return lockCount;
}
