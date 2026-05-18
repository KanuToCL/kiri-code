export type Urgency = "info" | "milestone" | "blocked";

export interface Sink {
  readonly name: string;
  available(): Promise<boolean>;
  send(text: string, urgency: Urgency): Promise<void>;
}
