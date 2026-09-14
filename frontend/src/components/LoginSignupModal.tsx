import type { FormEvent } from "react";
import logo from "../assets/ArcadialogoA.png";
import "./LoginSignupModal.css";

type AuthMode = "login" | "signup";

type LoginSignupModalProps = {
	authMode: AuthMode;
	onClose: () => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onSwitchMode: () => void;
};

function LoginSignupModal({ authMode, onClose, onSubmit, onSwitchMode }: LoginSignupModalProps) {
	return (
		<div className="auth-modal-backdrop" role="presentation" onMouseDown={onClose}>
			<section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onMouseDown={(event) => event.stopPropagation()}>
				<button type="button" className="auth-modal-close" aria-label="Close authentication dialog" onClick={onClose}>×</button>
				<div className="auth-modal-brand"><img src={logo} alt="" /><span>ARCADIA</span></div>
				<h2 id="auth-modal-title">{authMode === "login" ? "Log in to Arcadia" : "Create your account"}</h2>
				<p className="auth-modal-description">{authMode === "login" ? "Enter your credentials to continue" : "Join Arcadia and start playing"}</p>
				<form onSubmit={onSubmit}>
					{authMode === "signup" && <label>Name<input type="text" placeholder="Choose a username" required /></label>}
					<label>Email<input type="email" placeholder="Enter email" required /></label>
					<label>Password<input type="password" placeholder={authMode === "login" ? "Enter password" : "Create password"} required /></label>
					{authMode === "login" && <div className="auth-form-options"><label className="auth-remember"><input type="checkbox" /><span>Remember Me</span></label><button type="button" className="auth-link">Forgot Password?</button></div>}
					<button type="submit" className="auth-submit">{authMode === "login" ? "Log In" : "Create Account"}</button>
				</form>
				<div className="auth-divider"><span>OR</span></div>
				<button type="button" className="auth-google"><strong>G</strong> {authMode === "login" ? "Continue with Google" : "Sign up with Google"}</button>
				<p className="auth-bottom-switch">{authMode === "login" ? "Don't have an account?" : "Already have an account?"} <button type="button" className="auth-link" onClick={onSwitchMode}>{authMode === "login" ? "Sign up" : "Log in"}</button></p>
			</section>
		</div>
	);
}

export default LoginSignupModal;
