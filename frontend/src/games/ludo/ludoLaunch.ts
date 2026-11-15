export const LUDO_LAUNCH_EVENT = "arcadia:ludo-launch";

export type LudoLaunchDetail = {
  gameName: string;
};

export function isLudoGame(gameName: string | null | undefined): boolean {
  return typeof gameName === "string" && gameName.trim().toLowerCase() === "ludo";
}

/**
 * Every Ludo card, in every catalogue surface, asks for the same launch flow
 * through this one event instead of owning a copy of the setup modal.
 */
export function requestLudoLaunch(gameName = "Ludo"): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent<LudoLaunchDetail>(LUDO_LAUNCH_EVENT, {
    detail: { gameName },
  }));
}
