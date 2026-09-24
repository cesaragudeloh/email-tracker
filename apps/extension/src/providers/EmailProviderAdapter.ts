export type ComposeDetected = (compose: HTMLElement) => void;

export interface EmailProviderAdapter {
  canHandle(location: Pick<Location, 'hostname' | 'protocol'>): boolean;
  start(): void;
  stop(): void;
}
