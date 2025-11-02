import { browser } from 'wxt/browser';

/**
 * Cross-browser storage utility that handles Firefox compatibility issues
 */
export class ExtensionStorage {
  /**
   * Try storage.sync first, fallback to storage.local for Firefox compatibility
   */
  private async getStorageApi() {
    try {
      // Test if sync storage is available
      await browser.storage.sync.get({});
      return browser.storage.sync;
    } catch (error) {
      console.warn(
        'Storage.sync not available, falling back to storage.local:',
        error
      );
      return browser.storage.local;
    }
  }

  // Overloaded signatures for better typing
  async get<T>(key: string, defaultValue: T): Promise<T>;
  async get<T>(key: string): Promise<T | undefined>;
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const storage = await this.getStorageApi();
      const result = await storage.get([key]);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (error) {
      console.error(`Failed to get storage key "${key}":`, error);
      return defaultValue;
    }
  }

  async set(key: string, value: any): Promise<void> {
    try {
      const storage = await this.getStorageApi();
      await storage.set({ [key]: value });
      console.log(`Storage key "${key}" updated successfully`);
    } catch (error) {
      console.error(`Failed to set storage key "${key}":`, error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const storage = await this.getStorageApi();
      await storage.remove([key]);
    } catch (error) {
      console.error(`Failed to remove storage key "${key}":`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      const storage = await this.getStorageApi();
      await storage.clear();
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw error;
    }
  }

  /**
   * Get multiple keys at once
   */
  async getMultiple(keys: string[]): Promise<Record<string, any>> {
    try {
      const storage = await this.getStorageApi();
      return await storage.get(keys);
    } catch (error) {
      console.error('Failed to get multiple storage keys:', error);
      return {};
    }
  }

  /**
   * Set multiple values at once
   */
  async setMultiple(items: Record<string, any>): Promise<void> {
    try {
      const storage = await this.getStorageApi();
      await storage.set(items);
    } catch (error) {
      console.error('Failed to set multiple storage items:', error);
      throw error;
    }
  }

  /**
   * Get storage usage information
   */
  async getStorageUsage(): Promise<{
    bytesInUse: number;
    quotaBytes: number;
    percentageUsed: number;
    isLocal: boolean;
  }> {
    try {
      const storage = await this.getStorageApi();
      console.log('Got storage api: ', storage);
      const isLocal = storage === browser.storage.local;

      console.log('Storage API:', isLocal ? 'local' : 'sync');

      // Get bytes in use - note: this might not work in development/Firefox
      let bytesInUse: number;
      try {
        bytesInUse = await storage.getBytesInUse();
        const allData = await storage.get();
        const serialized = JSON.stringify(allData);
        bytesInUse = new Blob([serialized]).size;
      } catch (error) {
        console.warn(
          'getBytesInUse() not supported, calculating manually:',
          error
        );
        // Fallback: calculate size manually
        const allData = await storage.get();
        const serialized = JSON.stringify(allData);
        bytesInUse = new Blob([serialized]).size;
      }

      // Storage quota limits (approximate)
      // Chrome sync: 102,400 bytes, Chrome local: 5,242,880 bytes
      // Firefox: varies, but typically much larger for local
      let quotaBytes: number;
      if (isLocal) {
        // Local storage has much higher limits
        quotaBytes = 5242880; // ~5MB for Chrome local storage
      } else {
        // Sync storage has lower limits
        quotaBytes = 102400; // ~100KB for Chrome sync storage
      }

      const percentageUsed = (bytesInUse / quotaBytes) * 100;

      return {
        bytesInUse,
        quotaBytes,
        percentageUsed: Math.min(percentageUsed, 100), // Cap at 100%
        isLocal,
      };
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      // Return fallback data
      return {
        bytesInUse: 0,
        quotaBytes: 0,
        percentageUsed: 0,
        isLocal: true,
      };
    }
  }

  /**
   * Get detailed breakdown of storage by key
   */
  async getStorageBreakdown(): Promise<
    Array<{
      key: string;
      size: number;
      percentage: number;
    }>
  > {
    try {
      const storage = await this.getStorageApi();
      const allData = await storage.get();

      // Try to get total bytes, fallback to manual calculation
      let totalBytes: number;
      try {
        totalBytes = await storage.getBytesInUse();
      } catch (error) {
        console.warn(
          'getBytesInUse() not supported for breakdown, calculating manually'
        );
        const serialized = JSON.stringify(allData);
        totalBytes = new Blob([serialized]).size;
      }

      const breakdown: Array<{
        key: string;
        size: number;
        percentage: number;
      }> = [];

      for (const [key, value] of Object.entries(allData)) {
        try {
          // Estimate size by serializing to JSON
          const serialized = JSON.stringify(value);
          const size = new Blob([serialized]).size;
          const percentage = totalBytes > 0 ? (size / totalBytes) * 100 : 0;

          breakdown.push({
            key,
            size,
            percentage,
          });

          console.log(
            `Storage item "${key}": ${size} bytes (${percentage.toFixed(1)}%)`
          );
        } catch (error) {
          console.warn(`Failed to calculate size for key "${key}":`, error);
        }
      }

      // Sort by size (largest first)
      breakdown.sort((a, b) => b.size - a.size);

      return breakdown;
    } catch (error) {
      console.error('Failed to get storage breakdown:', error);
      return [];
    }
  }

  /**
   * Format bytes to human-readable string
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Create a singleton instance
export const extensionStorage = new ExtensionStorage();
