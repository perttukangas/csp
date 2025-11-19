import { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';
import { ScrapeResponse } from '../background/BackgroundService';

interface UrlsListProps {
  isVisible: boolean;
  onValidationUpdate?: () => void;
  tab: any;
}

function UrlsList({ isVisible, onValidationUpdate, tab }: UrlsListProps) {
  const [responses, setResponses] = useState<ScrapeResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [validatingIds, setValidatingIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [isValidatingAll, setIsValidatingAll] = useState(false);
  const [isRemovingAll, setIsRemovingAll] = useState(false);

  const loadResponses = async () => {
    if (!isVisible) return;

    setIsLoading(true);
    try {
      const result = await browser.runtime.sendMessage<
        any,
        { success: boolean; error: any; responses: ScrapeResponse[] }
      >({
        type: 'GET_RESPONSES',
      });

      console.log('Load responses result:', result);

      if (result.success) {
        // Show all responses (both URLs and HTMLs) in the unified view, newest first
        setResponses((result.responses || []).reverse());
      } else {
        console.error('Failed to load responses:', result.error);
      }
    } catch (error) {
      console.error('Failed to load responses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateValidation = async (
    responseUrl: string,
    validationStatus: 'validated' | 'invalid'
  ) => {
    setValidatingIds(prev => new Set(prev).add(responseUrl));

    try {
      const result = await browser.runtime.sendMessage({
        type: 'UPDATE_VALIDATION',
        responseUrl,
        validationStatus,
      });

      if (result.success) {
        // Update local state immediately
        setResponses(prev =>
          prev.map(r =>
            r.url === responseUrl ? { ...r, validationStatus } : r
          )
        );

        // Notify parent of validation update
        onValidationUpdate?.();
      } else {
        console.error('Failed to update validation:', result.error);
      }
    } catch (error) {
      console.error('Failed to update validation:', error);
    } finally {
      setValidatingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(responseUrl);
        return newSet;
      });
    }
  };

  const handleRemoveResponse = async (responseUrl: string) => {
    setRemovingIds(prev => new Set(prev).add(responseUrl));

    try {
      const result = await browser.runtime.sendMessage({
        type: 'REMOVE_RESPONSE',
        responseUrl,
      });

      if (result.success) {
        // Remove from local state immediately
        setResponses(prev => prev.filter(r => r.url !== responseUrl));

        // Notify parent of update
        onValidationUpdate?.();
      } else {
        console.error('Failed to remove response:', result.error);
      }
    } catch (error) {
      console.error('Failed to remove response:', error);
    } finally {
      setRemovingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(responseUrl);
        return newSet;
      });
    }
  };

  const handleValidateAll = async () => {
    const pendingResponses = responses.filter(
      r => r.validationStatus === 'pending'
    );
    if (pendingResponses.length === 0) return;

    setIsValidatingAll(true);

    try {
      const result = await browser.runtime.sendMessage({
        type: 'VALIDATE_ALL_PENDING',
      });

      if (result.success) {
        // Update local state to mark all pending responses as validated
        setResponses(prev =>
          prev.map(r =>
            r.validationStatus === 'pending'
              ? { ...r, validationStatus: 'validated' as const }
              : r
          )
        );

        // Notify parent of update
        onValidationUpdate?.();
      } else {
        console.error('Failed to validate all responses:', result.error);
      }
    } catch (error) {
      console.error('Failed to validate all responses:', error);
    } finally {
      setIsValidatingAll(false);
    }
  };

  const handleRemoveAll = async () => {
    if (responses.length === 0) return;

    setIsRemovingAll(true);

    try {
      const result = await browser.runtime.sendMessage({
        type: 'REMOVE_ALL_RESPONSES',
      });

      if (result.success) {
        // Clear all responses from local state
        setResponses([]);

        // Notify parent of update
        onValidationUpdate?.();
      } else {
        console.error('Failed to remove all responses:', result.error);
      }
    } catch (error) {
      console.error('Failed to remove all responses:', error);
    } finally {
      setIsRemovingAll(false);
    }
  };

  // Auto-refresh when tab becomes visible or every 30 seconds when visible
  useEffect(() => {
    console.log('UrlsList visibility changed:', isVisible, tab);
    if (!isVisible) return;

    const interval = setInterval(() => {
      loadResponses();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [isVisible, tab]);

  const getValidationStatusColor = (status?: string) => {
    switch (status) {
      case 'validated':
        return '#28a745';
      case 'invalid':
        return '#dc3545';
      case 'pending':
      default:
        return '#ffc107';
    }
  };

  const getValidationStatusText = (status?: string) => {
    switch (status) {
      case 'validated':
        return '✅ Validated';
      case 'invalid':
        return '❌ Invalid';
      case 'pending':
      default:
        return '⏳ Pending Validation';
    }
  };

  const truncateUrl = (url: string, maxLength: number = 50) => {
    if (url.length <= maxLength) return url;
    return '...' + url.substring(url.length - maxLength + 3);
  };

  useEffect(() => {
    loadResponses();
  }, [isVisible, tab]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="tab-content">
      <div className="responses-header">
        {responses.length > 0 && (
          <div className="bulk-actions">
            <button
              className="btn-primary"
              onClick={handleValidateAll}
              disabled={
                isValidatingAll ||
                isRemovingAll ||
                responses.filter(r => r.validationStatus === 'pending')
                  .length === 0
              }
              title="Validate all pending sites"
            >
              {isValidatingAll ? '⟳' : '✅'} Validate All
            </button>
            <button
              className="btn-danger"
              onClick={handleRemoveAll}
              disabled={isValidatingAll || isRemovingAll}
              title="Remove all sites from storage"
            >
              {isRemovingAll ? '⟳' : '🗑️'} Remove All
            </button>
          </div>
        )}
      </div>

      {isLoading && responses.length === 0 ? (
        <div className="loading-state">Loading sites...</div>
      ) : responses.length === 0 ? (
        <div className="empty-state">
          No sites stored yet. Visit some pages to see them here!
        </div>
      ) : (
        <div className="responses-container">
          {responses.map(response => (
            <div key={response.url} className="response-card">
              <div className="response-header">
                <div className="response-type-badge">
                  {response.type === 'html' ? '📄 Auth Site' : '🔗 Site'}
                </div>
                <div className="response-url" title={response.url}>
                  {truncateUrl(response.url)}
                </div>
                <div
                  className={`validation-${response.validationStatus || 'pending'}`}
                >
                  {getValidationStatusText(response.validationStatus)}
                </div>
              </div>

              <div className="response-actions">
                {response.validationStatus === 'pending' && (
                  <>
                    <button
                      className="btn-primary"
                      onClick={() =>
                        handleUpdateValidation(response.url, 'validated')
                      }
                      disabled={
                        validatingIds.has(response.url) ||
                        removingIds.has(response.url)
                      }
                    >
                      {validatingIds.has(response.url) ? '⟳' : '✅'} Valid
                    </button>
                    <button
                      className="btn-warning"
                      onClick={() =>
                        handleUpdateValidation(response.url, 'invalid')
                      }
                      disabled={
                        validatingIds.has(response.url) ||
                        removingIds.has(response.url)
                      }
                    >
                      {validatingIds.has(response.url) ? '⟳' : '❌'} Invalid
                    </button>
                  </>
                )}
                <button
                  className="btn-danger"
                  onClick={() => handleRemoveResponse(response.url)}
                  disabled={
                    validatingIds.has(response.url) ||
                    removingIds.has(response.url)
                  }
                  title="Remove this site from storage"
                >
                  {removingIds.has(response.url) ? '⟳' : '🗑️'} Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default UrlsList;
