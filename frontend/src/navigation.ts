import type { MouseEvent } from "react";

const NAVIGATION_EVENT = "arcadia:navigate";

export function navigateTo(path: string, event?: MouseEvent<HTMLAnchorElement>) {
  event?.preventDefault();
  const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentLocation === path) return;

  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

export function onNavigation(callback: () => void) {
  window.addEventListener(NAVIGATION_EVENT, callback);
  window.addEventListener("popstate", callback);

  return () => {
    window.removeEventListener(NAVIGATION_EVENT, callback);
    window.removeEventListener("popstate", callback);
  };
}
