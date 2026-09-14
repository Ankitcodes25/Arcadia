import { useEffect, useRef } from "react";
import "./ProfilePopupmodal.css";

type ProfilePopupModalProps = {
	onClose: () => void;
	onLogout: () => void;
};

const profileItems = [
	["👤", "My Profile"],
	["💝", "Favorite Games"],
	["⚙", "Account Settings"],
	["🏆", "My Trophies & Achievements"],
	["?", "Help & Support"],
] as const;

function ProfilePopupModal({ onClose, onLogout }: ProfilePopupModalProps) {
	const popupRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handlePointerDown = (event: PointerEvent) => {
			if (!popupRef.current?.contains(event.target as Node)) onClose();
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};

		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	return (
		<div ref={popupRef} className="profile-popup" role="menu" aria-label="Profile menu">
			<div className="profile-popup-header">
				<div className="profile-popup-avatar" aria-hidden="true">A</div>
				<h2 className="profile-popup-name">GamerArcadia_88</h2>
				<p className="profile-popup-status">Account Status: <strong>Active</strong></p>
			</div>
			<nav className="profile-popup-nav">
				{profileItems.map(([icon, label]) => (
					<button key={label} type="button" className="profile-popup-item" role="menuitem" onClick={onClose}>
						<span className="profile-popup-icon" aria-hidden="true">{icon}</span>
						<span>{label}</span>
					</button>
				))}
				<button type="button" className="profile-popup-item logout" role="menuitem" onClick={onLogout}>
					<span className="profile-popup-icon" aria-hidden="true">↪</span>
					<span>Logout</span>
				</button>
			</nav>
		</div>
	);
}

export default ProfilePopupModal;