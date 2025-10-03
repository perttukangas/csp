import { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';

interface ScrapeResponse {
  id: string;
  url: string;
  prompt: string;
  response: string;
  timestamp: number;
  status: 'completed' | 'failed';
  validationStatus?: 'pending' | 'validated' | 'invalid';
}

interface ResponsesListProps {
  isVisible: boolean;
  onValidationUpdate?: () => void;
}

function ResponsesList({ isVisible, onValidationUpdate }: ResponsesListProps) {
  const [responses, setResponses] = useState<ScrapeResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [validatingIds, setValidatingIds] = useState<Set<string>>(new Set());

  const loadResponses = async () => {
    if (!isVisible) return;

    setIsLoading(true);
    try {
      const result = await browser.runtime.sendMessage({
        type: 'GET_RESPONSES',
      });

      if (result.success) {
        setResponses(result.responses || []);
      } else {
        console.error('Failed to load responses:', result.error);
      }
    } catch (error) {
      console.error('Failed to load responses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateValidation = async (responseId: string, validationStatus: 'validated' | 'invalid') => {
    setValidatingIds(prev => new Set(prev).add(responseId));

    try {
      const result = await browser.runtime.sendMessage({
        type: 'UPDATE_VALIDATION',
        responseId,
        validationStatus,
      });

      if (result.success) {
        // Update local state immediately
        setResponses(prev => prev.map(r =>
          r.id === responseId
            ? { ...r, validationStatus }
            : r
        ));

        // Notify parent of validation update
        onValidationUpdate?.();
      } else {
        console.error('Failed to update validation:', result.error);
        alert('Failed to update validation. Please try again.');
      }
    } catch (error) {
      console.error('Failed to update validation:', error);
      alert('Failed to update validation. Please try again.');
    } finally {
      setValidatingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(responseId);
        return newSet;
      });
    }
  };

  const handleRemoveResponse = async (responseId: string) => {
    setRemovingIds(prev => new Set(prev).add(responseId));

    try {
      const result = await browser.runtime.sendMessage({
        type: 'REMOVE_RESPONSE',
        responseId,
      });

      if (result.success) {
        // Remove from local state immediately
        setResponses(prev => prev.filter(r => r.id !== responseId));
        // Notify parent to update badge count
        onValidationUpdate?.();
      } else {
        console.error('Failed to remove response:', result.error);
        alert('Failed to remove response. Please try again.');
      }
    } catch (error) {
      console.error('Failed to remove response:', error);
      alert('Failed to remove response. Please try again.');
    } finally {
      setRemovingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(responseId);
        return newSet;
      });
    }
  };

  useEffect(() => {
    loadResponses();
  }, [isVisible]);

  // Auto-refresh when tab becomes visible or every 30 seconds when visible
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      loadResponses();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [isVisible]);

  const getValidationStatusColor = (status?: string) => {
    switch (status) {
      case 'validated': return '#28a745';
      case 'invalid': return '#dc3545';
      case 'pending':
      default: return '#ffc107';
    }
  };

  const getValidationStatusText = (status?: string) => {
    switch (status) {
      case 'validated': return '✅ Validated';
      case 'invalid': return '❌ Invalid';
      case 'pending':
      default: return '⏳ Pending Validation';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const truncateUrl = (url: string, maxLength: number = 50) => {
    if (url.length <= maxLength) return url;
    return '...' + url.substring(url.length - maxLength + 3);
  };

  useEffect(() => {
    loadResponses();
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="tab-content">
      <div className="responses-header">
        <h3>Stored Responses</h3>
      </div>

      {isLoading && responses.length === 0 ? (
        <div className="loading-state">
          Loading responses...
        </div>
      ) : responses.length === 0 ? (
        <div className="empty-state">
          No responses stored yet. Visit some pages to see them here!
        </div>
      ) : (
        <div className="responses-container">
          {responses.map(response => (
            <div key={response.id} className="response-card">
              <div className="response-header">
                <div className="response-url">
                  {truncateUrl(response.url)}
                </div>
                <div className={`validation-${response.validationStatus || 'pending'}`}>
                  {getValidationStatusText(response.validationStatus)}
                </div>
              </div>

              <div className="response-meta">
                <div className="response-id">
                  ID: {response.id.split('_').pop()}
                </div>
                <div className="response-timestamp">
                  {formatTimestamp(response.timestamp)}
                </div>
              </div>

              <div className="response-content">
                <div className="response-text">
                  {truncateText(response.response, 200)}
                </div>
              </div>

              <div className="response-actions">
                {response.validationStatus === 'pending' && (
                  <>
                    <button
                      className="btn-primary"
                      onClick={() => handleUpdateValidation(response.id, 'validated')}
                      disabled={validatingIds.has(response.id)}
                    >
                      {validatingIds.has(response.id) ? '⟳' : '✅'} Valid
                    </button>
                    <button
                      className="btn-warning"
                      onClick={() => handleUpdateValidation(response.id, 'invalid')}
                      disabled={validatingIds.has(response.id)}
                    >
                      {validatingIds.has(response.id) ? '⟳' : '❌'} Invalid
                    </button>
                  </>
                )}
                <button
                  className="btn-danger"
                  onClick={() => handleRemoveResponse(response.id)}
                  disabled={removingIds.has(response.id)}
                >
                  {removingIds.has(response.id) ? '⟳' : '🗑️'} Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ResponsesList;