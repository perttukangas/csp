import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { BackgroundService } from '../BackgroundService';

describe('BackgroundService', () => {
  let service: BackgroundService;

  beforeEach(() => {
    fakeBrowser.reset();
    service = new BackgroundService();
  });

  it('should store and retrieve responses correctly', async () => {
    const testResponse = {
      url: 'https://example.com',
      validationStatus: 'pending' as const,
      type: 'url' as const,
    };

    await service.storeResponse(testResponse);

    const storedResponses = await service.getStoredResponses();

    expect(storedResponses).toHaveLength(1);
    expect(storedResponses[0]).toEqual(testResponse);
  });

  it('should update validation status correctly', async () => {
    const testResponse = {
      url: 'https://example.com',
      validationStatus: 'pending' as const,
      type: 'url' as const,
    };

    await service.storeResponse(testResponse);

    const result = await service.updateValidationStatus(
      'https://example.com',
      'validated'
    );

    expect(result).toBe(true);

    const storedResponses = await service.getStoredResponses();
    expect(storedResponses[0].validationStatus).toBe('validated');
  });
});
