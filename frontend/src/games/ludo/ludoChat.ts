import type { LudoChatBubble, LudoChatMessage } from "./types";

/** A temporary lobby message lives for roughly four and a half seconds. */
export const LUDO_CHAT_BUBBLE_MS = 4500;

export const LUDO_CHAT_QUICK_MESSAGES = [
  "Ready!",
  "Wait a moment.",
  "Let's start!",
  "One more player.",
  "Choose your colour.",
] as const;

export const LUDO_CHAT_MAX_LENGTH = 180;

export function addLudoChatBubble(
  bubbles: readonly LudoChatBubble[],
  message: LudoChatMessage,
  now = Date.now(),
): LudoChatBubble[] {
  if (bubbles.some((bubble) => bubble.id === message.id)) return [...bubbles];

  return [
    ...bubbles,
    {
      id: message.id,
      text: message.text,
      colour: message.colour,
      senderName: message.senderName,
      createdAt: now,
    },
  ].slice(-12);
}

export function pruneLudoChatBubbles(
  bubbles: readonly LudoChatBubble[],
  now = Date.now(),
): LudoChatBubble[] {
  return bubbles.filter((bubble) => now - bubble.createdAt < LUDO_CHAT_BUBBLE_MS);
}

export function normaliseLudoChatText(value: string): string {
  return value.trim().slice(0, LUDO_CHAT_MAX_LENGTH);
}
