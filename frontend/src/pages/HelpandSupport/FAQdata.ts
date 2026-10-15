export type FaqAnswerBlock =
  | { type: "paragraph"; text: string }
  | { type: "ordered-list" | "unordered-list"; items: string[] };

export type FaqItem = {
  id: string;
  question: string;
  answer: FaqAnswerBlock[];
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "xp-badges",
    question: "How do I earn XP and unlock badges?",
    answer: [
      {
        type: "paragraph",
        text: "XP tracks your progression on Arcadia. Only an eligible, verified win against Arcadion AI awards XP: 20 XP. Losses, draws, friend matches, and local matches do not award XP.",
      },
      {
        type: "paragraph",
        text: "Your total XP drives your server-calculated level and badge tier. The avatar selector shows level-based avatar previews and their requirements, but those tier previews are not currently selectable.",
      },
      {
        type: "paragraph",
        text: "If your XP or level does not update after an eligible match, refresh your profile and check again. If the issue persists, use Report a Problem and describe the match and progression issue.",
      },
    ],
  },
  {
    id: "leaderboard",
    question: "How does the leaderboard work?",
    answer: [
      {
        type: "paragraph",
        text: "Across all games, the current leaderboard ranks entries by XP; for a game-specific view it ranks by that game's score. Ties are ordered by wins and then player name. Search filters the displayed players without changing their rank.",
      },
      {
        type: "paragraph",
        text: "The current page uses preview entries until real entries are supplied, so those standings are illustrative, not real player rankings or statistics.",
      },
      {
        type: "paragraph",
        text: "If you cannot find a profile, check your search, game filter, and Settings → Privacy. Leaderboard Visibility set to Hide excludes a profile from the public leaderboard; Profile Visibility separately controls who can view the profile. If visibility or ranking still looks incorrect, report the issue.",
      },
    ],
  },
  {
    id: "account",
    question: "How can I manage my account, username, avatar, and password?",
    answer: [
      {
        type: "paragraph",
        text: "Open your profile from the account menu and choose My Profile to edit your username. Use the avatar selector there to choose an avatar available to your account. A Google profile picture is available only when the signed-in account has a usable Google picture.",
      },
      {
        type: "paragraph",
        text: "The selector shows level-based avatar previews and requirements, but these tier previews are not currently selectable. Save profile changes using the existing editing flow, then reopen your profile to check them.",
      },
      {
        type: "paragraph",
        text: "For password accounts, open Settings → Account & Security → Change Password and follow the displayed steps. Google-only accounts do not have an Arcadia password to change. If you forgot your password, use Forgot password on the login screen.",
      },
      {
        type: "paragraph",
        text: "If Google sign-in fails, check your connection and retry the Google sign-in flow; if needed, close and reopen the login modal. If the error persists, report it with the error message and steps to reproduce. Never share passwords, OAuth tokens, or authentication codes.",
      },
    ],
  },
  {
    id: "privacy",
    question: "How can I manage my privacy settings?",
    answer: [
      {
        type: "paragraph",
        text: "Open Settings → Privacy to manage the available visibility options:",
      },
      {
        type: "unordered-list",
        items: [
          "Profile Visibility: Public profiles can be viewed by others. Friends visibility currently fails closed for other viewers because Arcadia has no friendship graph; No One limits profile viewing to the account owner.",
          "Leaderboard Visibility: Show includes your profile in public leaderboard results; Hide excludes it. This does not remove your XP or level.",
        ],
      },
      {
        type: "paragraph",
        text: "These settings control visibility; they do not delete your account or necessarily erase match records.",
      },
    ],
  },
  {
    id: "delete-account",
    question: "How do I delete my Arcadia account?",
    answer: [
      {
        type: "paragraph",
        text: "Open Settings → Account & Security → Permanently Delete Your Account. Review the instructions, select a deletion reason, and complete the required confirmation. Password accounts must also re-authenticate with their Arcadia password.",
      },
      {
        type: "paragraph",
        text: "Deletion is permanent. After the backend confirms deletion, it removes the account and its associated account data, including profile, XP, match history, and signed-in sessions. Review the confirmation carefully.",
      },
      {
        type: "paragraph",
        text: "If deletion fails, check the displayed error. Do not assume your account was deleted unless the action succeeds.",
      },
    ],
  },
  {
    id: "help",
    question: "What should I do if I encounter a bug or need help?",
    answer: [
      {
        type: "paragraph",
        text: "In Help & Support, use Report a Problem to describe the issue:",
      },
      {
        type: "ordered-list",
        items: [
          "Choose the most relevant category and enter a clear subject.",
          "Describe what happened and include the steps needed to reproduce it.",
          "Explain what you expected to happen and what happened instead.",
          "Submit the report and check the status message to confirm whether it was received.",
        ],
      },
      {
        type: "paragraph",
        text: "Do not include passwords, OAuth tokens, or authentication codes. If submission fails or the form says reporting is unavailable, review the displayed message before retrying. For direct email help, contact helpsupportarcadia@gmail.com.",
      },
    ],
  },
];

export const HELP_CATEGORIES = ["Account", "Gameplay", "Privacy", "Technical Issues"] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export const FAQ_CATEGORY_MAP: Record<string, HelpCategory[]> = {
  "xp-badges": ["Gameplay"],
  leaderboard: ["Gameplay", "Privacy"],
  account: ["Account", "Technical Issues"],
  privacy: ["Privacy"],
  "delete-account": ["Account"],
  help: ["Technical Issues", "Account"],
};
