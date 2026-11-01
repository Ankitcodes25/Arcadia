import { useEffect, useState } from "react";
import { getLocalAvatarOption, getSafeGoogleAvatarUrl } from "../auth/avatarCatalog";
import type { FriendPlayer } from "./friendsTypes";

type FriendAvatarProps = {
  player: Pick<FriendPlayer, "avatar" | "avatarUrl" | "username">;
  className?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

/*
 * A friend/search avatar. Google pictures only render through the shared
 * allowlist, and a failed image falls back to the same local avatar instead of
 * leaving a broken icon.
 */
function FriendAvatar({ player, className = "" }: FriendAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const googleUrl = getSafeGoogleAvatarUrl(player.avatarUrl);
  const useGoogle = player.avatar.type === "google" && Boolean(googleUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [player.avatar.type, player.avatar.value, player.avatarUrl]);

  if (useGoogle) {
    return (
      <img
        className={`friends-avatar-image ${className}`.trim()}
        src={googleUrl || ""}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
    );
  }

  const local = getLocalAvatarOption(player.avatar.value);
  return (
    <span
      className={`friends-avatar-placeholder ${local.className} ${className}`.trim()}
      style={{ background: local.background }}
      aria-label={`${local.label} avatar`}
      role="img"
    >
      {initials(player.username)}
    </span>
  );
}

export default FriendAvatar;
