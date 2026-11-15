import { useCallback, useEffect, useRef, useState } from "react";
import {
  addLudoChatBubble,
  LUDO_CHAT_BUBBLE_MS,
  pruneLudoChatBubbles,
} from "./ludoChat";
import type { LudoChatBubble, LudoChatMessage } from "./types";

/**
 * Holds only the short-lived bubbles currently on screen. There is no message
 * list, no history and no storage: a bubble is dropped from state shortly after
 * it is shown, and every timer is cleared when the lobby closes.
 */
export function useLudoChatBubbles() {
  const [bubbles, setBubbles] = useState<LudoChatBubble[]>([]);
  const knownIdsRef = useRef(new Set<string>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const addBubble = useCallback((message: LudoChatMessage) => {
    if (knownIdsRef.current.has(message.id)) return;
    knownIdsRef.current.add(message.id);
    setBubbles((current) => addLudoChatBubble(current, message));

    const timer = setTimeout(() => {
      timersRef.current.delete(message.id);
      knownIdsRef.current.delete(message.id);
      setBubbles((current) => pruneLudoChatBubbles(current));
    }, LUDO_CHAT_BUBBLE_MS);

    timersRef.current.set(message.id, timer);
  }, []);

  const clearBubbles = useCallback(() => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    knownIdsRef.current.clear();
    setBubbles([]);
  }, []);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    knownIdsRef.current.clear();
  }, []);

  return { bubbles, addBubble, clearBubbles };
}
