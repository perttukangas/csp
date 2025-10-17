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
      console.warn('Storage.sync not available, falling back to storage.local:', error);
      return browser.storage.local;
    }
  }

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
}

// Create a singleton instance
export const extensionStorage = new ExtensionStorage();