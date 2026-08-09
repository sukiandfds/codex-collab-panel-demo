import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_FOLLOW_DISTANCE = 120;
const DEFAULT_PROMPT_DISTANCE = 800;
const noTrailingContent = () => 0;

const distanceFromBottom = (root: HTMLElement) => Math.max(
  0,
  root.scrollHeight - root.scrollTop - root.clientHeight,
);

export const isNearBottom = (root: HTMLElement, trailingContentHeight = 0) => (
  Math.max(0, distanceFromBottom(root) - Math.max(0, trailingContentHeight)) < AUTO_FOLLOW_DISTANCE
);

export function useReturnToBottom({
  active = true,
  isStreaming,
  localSendVersion = 0,
  getScrollElement,
  getTrailingContentHeight = noTrailingContent,
  scrollToBottom,
}: {
  active?: boolean;
  isStreaming: boolean;
  localSendVersion?: number;
  getScrollElement: () => HTMLElement | null;
  getTrailingContentHeight?: () => number;
  scrollToBottom: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const stickToBottomRef = useRef(true);
  const streamingPromptLatchedRef = useRef(false);
  const previousLocalSendVersionRef = useRef(localSendVersion);
  const positionFrameRef = useRef(0);

  const updateFromPosition = useCallback((root = getScrollElement()) => {
    if (!active || !root) return;
    const distance = Math.max(0, distanceFromBottom(root) - Math.max(0, getTrailingContentHeight()));
    if (distance < AUTO_FOLLOW_DISTANCE) {
      stickToBottomRef.current = true;
      streamingPromptLatchedRef.current = false;
      setVisible(false);
      return;
    }

    stickToBottomRef.current = false;
    const promptDistance = isStreaming ? root.clientHeight / 2 : DEFAULT_PROMPT_DISTANCE;
    const beyondPromptDistance = distance > promptDistance;
    if (isStreaming && beyondPromptDistance) streamingPromptLatchedRef.current = true;
    setVisible(streamingPromptLatchedRef.current || beyondPromptDistance);
  }, [active, getScrollElement, getTrailingContentHeight, isStreaming]);

  const schedulePositionUpdate = useCallback(() => {
    window.cancelAnimationFrame(positionFrameRef.current);
    positionFrameRef.current = window.requestAnimationFrame(() => updateFromPosition());
  }, [updateFromPosition]);

  const contentChanged = useCallback(() => {
    if (!active) return;
    if (stickToBottomRef.current) scrollToBottom();
    else schedulePositionUpdate();
  }, [active, schedulePositionUpdate, scrollToBottom]);

  const returnToBottom = useCallback(() => {
    if (!active) return;
    stickToBottomRef.current = true;
    streamingPromptLatchedRef.current = false;
    setVisible(false);
    scrollToBottom();
  }, [active, scrollToBottom]);

  const reset = useCallback((stickToBottom = true) => {
    stickToBottomRef.current = stickToBottom;
    streamingPromptLatchedRef.current = false;
    setVisible(false);
  }, []);

  useEffect(() => {
    if (localSendVersion === previousLocalSendVersionRef.current) return;
    previousLocalSendVersionRef.current = localSendVersion;
    returnToBottom();
  }, [localSendVersion, returnToBottom]);

  useEffect(() => {
    if (!active) return;
    schedulePositionUpdate();
  }, [active, isStreaming, schedulePositionUpdate]);

  useEffect(() => () => window.cancelAnimationFrame(positionFrameRef.current), []);

  return {
    visible,
    stickToBottomRef,
    onScroll: updateFromPosition,
    contentChanged,
    returnToBottom,
    reset,
  };
}
