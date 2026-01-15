import { ReplayStore } from "../types";

export class MemoryReplayStore implements ReplayStore {
  private seen = new Map<string, number>();

  async checkAndStore(args: { provider: "stripe"; eventId: string; ttlSeconds: number }): Promise<boolean> {
    const key = `${args.provider}:${args.eventId}`;
    const now = Date.now();
    for (const [k, exp] of this.seen.entries()) {
      if (exp <= now) this.seen.delete(k);
    }
    if (this.seen.has(key)) return true;
    this.seen.set(key, now + args.ttlSeconds * 1000);
    return false;
  }
}
