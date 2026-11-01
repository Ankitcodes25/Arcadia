type OnlineStatusIndicatorProps = {
  online: boolean;
  showLabel?: boolean;
};

/*
 * A small presence indicator. `online` is always the backend's verified value
 * from a recent authenticated heartbeat, never a locally guessed status.
 */
function OnlineStatusIndicator({ online, showLabel = false }: OnlineStatusIndicatorProps) {
  return (
    <span
      className={`friends-presence ${online ? "friends-presence--online" : "friends-presence--offline"}`}
      title={online ? "Online" : "Offline"}
    >
      <span className="friends-presence-dot" aria-hidden="true" />
      {showLabel && <span>{online ? "Online" : "Offline"}</span>}
      <span className="friends-visually-hidden">{online ? "Online" : "Offline"}</span>
    </span>
  );
}

export default OnlineStatusIndicator;
