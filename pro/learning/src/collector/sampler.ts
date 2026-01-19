/**
 * ContractShield Learning Mode - Fixed Rate Sampler
 *
 * Simple probabilistic sampler with fixed rate.
 * v1: No adaptive sampling - predictable behavior.
 *
 * @license Commercial
 */

/**
 * Sampler with fixed rate
 */
export class Sampler {
  private rate: number;
  private totalChecked: number = 0;
  private totalSampled: number = 0;

  /**
   * Create a new sampler
   * @param rate Sample rate 0.0-1.0 (default: 0.1 = 10%)
   */
  constructor(rate: number = 0.1) {
    this.rate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Determine if current request should be sampled
   * @returns true if should sample
   */
  shouldSample(): boolean {
    this.totalChecked++;

    if (Math.random() < this.rate) {
      this.totalSampled++;
      return true;
    }

    return false;
  }

  /**
   * Get current sampling rate
   */
  getRate(): number {
    return this.rate;
  }

  /**
   * Get sampling statistics
   */
  getStats(): SamplerStats {
    return {
      rate: this.rate,
      totalChecked: this.totalChecked,
      totalSampled: this.totalSampled,
      actualRate: this.totalChecked > 0 ? this.totalSampled / this.totalChecked : 0,
    };
  }

  /**
   * Reset statistics (for testing)
   */
  reset(): void {
    this.totalChecked = 0;
    this.totalSampled = 0;
  }
}

/**
 * Sampler statistics
 */
export interface SamplerStats {
  /** Configured sample rate */
  rate: number;
  /** Total requests checked */
  totalChecked: number;
  /** Total requests sampled */
  totalSampled: number;
  /** Actual observed rate */
  actualRate: number;
}

/**
 * Simple function for one-off sampling decisions
 * @param rate Sample rate 0.0-1.0
 * @returns true if should sample
 */
export function shouldSample(rate: number): boolean {
  return Math.random() < Math.max(0, Math.min(1, rate));
}
