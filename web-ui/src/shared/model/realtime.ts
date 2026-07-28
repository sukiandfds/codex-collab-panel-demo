export interface RealtimeConnectedEvent {
  type: "connected";
  eventId: number;
  requestedEventId: number;
  oldestEventId: number;
  replayed: number;
  gap: boolean;
}

export type RealtimeRecoveryReason = "event-gap" | "reconnected" | "resumed" | "stale-execution";
