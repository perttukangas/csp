import { useState, useEffect } from 'react';
import './App.css';
import { browser } from 'wxt/browser';
import { extensionStorage } from '../../utils/storage';
import UrlsList from './UrlsList';

function App() {
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'controls' | 'urls'>('controls');
  const [pendingValidations, setPendingValidations] = useState(0);
  const [validatedCount, setValidatedCount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<string | null>(null);
  const [showVerification, setShowVerification] = useState(false);

  // Load pending validations count
  const loadPendingValidations = async () => {
    try {
      const result = await browser.runtime.sendMessage({
        type: 'GET_RESPONSES',
      });

      if (result.success) {
        const pendingCount = (result.responses || []).filter(
          (r: any) => r.validationStatus === 'pending'
        ).length;
        const validatedCount = (result.responses || []).filter(
          (r: any) => r.validationStatus === 'validated'
        ).length;
        setPendingValidations(pendingCount);
        setValidatedCount(validatedCount);
      }
    } catch (error) {
      console.error('Failed to load pending validations:', error);
    }
  };

  // Load settings and current URL on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load tracking setting from storage
        const trackingEnabled = await extensionStorage.get(
          'urlTrackingEnabled',
          false
        );
        const prompt = await extensionStorage.get('prompt', '');
        setPrompt(prompt || '');
        setIsTrackingEnabled(trackingEnabled || false);

        // Load pending validations
        await loadPendingValidations();
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleToggleTracking = async (enabled: boolean) => {
    try {
      setIsTrackingEnabled(enabled);
      await extensionStorage.set('urlTrackingEnabled', enabled);

      // Notify background script of the change
      await browser.runtime.sendMessage({
        type: 'TRACKING_TOGGLED',
        enabled: enabled,
      });

      console.log(`URL tracking ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to update tracking setting:', error);
    }
  };

  const handlePromptChange = async (newPrompt: string) => {
    try {
      setPrompt(newPrompt);
      // Should debounce probably. Leave for later.
      await extensionStorage.set('prompt', newPrompt);
      console.log('Prompt updated:', newPrompt);
    } catch (error) {
      console.error('Failed to update prompt:', error);
    }
  };

  const handleSendValidated = async () => {
    if (validatedCount === 0) {
      alert('No validated responses to send!');
      return;
    }

    console.log('🚀 Sending SEND_VALIDATED message to background script');
    setIsSending(true);
    try {
      const result = await browser.runtime.sendMessage({
        type: 'SEND_VALIDATED',
      });

      console.log('📨 Received response from background script:', result);

      if (result.success) {
        alert(
          `Successfully sent ${result.sent} validated responses to server!`
        );
        // Refresh the counts after sending
        await loadPendingValidations();
      } else {
        alert(`Failed to send responses: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to send validated responses:', error);
      alert('Failed to send responses. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleVerifySample = async () => {
    if (validatedCount === 0) {
      alert('No validated responses to verify!');
      return;
    }

    console.log('🔍 Sending VERIFY_SAMPLE message to background script');
    setIsVerifying(true);
    setVerificationResult(null);
    try {
      const result = await browser.runtime.sendMessage({
        type: 'VERIFY_SAMPLE',
      });

      console.log('📨 Received verification response:', result);

      if (result.success) {
        setVerificationResult(result.csvContent);
        setShowVerification(true);
      } else {
        alert(`Failed to verify sample: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to verify sample:', error);
      alert('Failed to verify sample. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return <div className="loading-state">Loading...</div>;
  }

  return (
    <>
      <h1>Web ScrAIper</h1>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'controls' ? 'active' : ''}`}
          onClick={() => setActiveTab('controls')}
        >
          Controls
        </button>
        <button
          className={`tab-button ${activeTab === 'urls' ? 'active' : ''}`}
          onClick={() => setActiveTab('urls')}
        >
          URLs
          {pendingValidations > 0 && (
            <span className="badge">{pendingValidations}</span>
          )}
        </button>
      </div>

      {/* Controls Tab */}
      {activeTab === 'controls' && (
        <div className="tab-content">
          <div>
            <label htmlFor="prompt">Prompt:</label>
            <textarea
              id="prompt"
              name="prompt"
              value={prompt}
              placeholder="Enter your AI prompt for scraping pages..."
              onChange={async e => await handlePromptChange(e.target.value)}
            />
          </div>

          <div
            className="checkbox-container"
            onClick={() => handleToggleTracking(!isTrackingEnabled)}
          >
            <input
              type="checkbox"
              checked={isTrackingEnabled}
              onChange={e => handleToggleTracking(e.target.checked)}
              onClick={e => e.stopPropagation()} // Prevent container click when clicking checkbox
            />
            <span
              className={`status-text ${isTrackingEnabled ? 'enabled' : 'disabled'}`}
            >
              {isTrackingEnabled
                ? '🟢 URL Tracking Enabled'
                : '🔴 URL Tracking Disabled'}
            </span>
          </div>

          <div className="send-section">
            <button
              className="verify-button"
              onClick={handleVerifySample}
              disabled={isVerifying || validatedCount === 0}
            >
              {isVerifying
                ? '⟳ Verifying...'
                : `🔍 Verify Sample (3 URLs)`}
            </button>
            
            <button
              className="send-button"
              onClick={handleSendValidated}
              disabled={isSending || validatedCount === 0}
            >
              {isSending
                ? '⟳ Sending...'
                : `📤 Send ${validatedCount} URLs to processing`}
            </button>
          </div>

          {/* Verification Results Preview */}
          {showVerification && verificationResult && (
            <div className="verification-preview">
              <h3>📊 Verification Results (First 3 URLs):</h3>
              <div className="csv-preview">
                <pre>{verificationResult}</pre>
              </div>
              <div className="verification-actions">
                <button
                  className="adjust-button"
                  onClick={() => setShowVerification(false)}
                >
                  ✏️ Adjust Prompt
                </button>
                <button
                  className="proceed-button"
                  onClick={handleSendValidated}
                  disabled={isSending}
                >
                  ✅ Looks Good - Process All
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Urls Tab */}
      <UrlsList
        isVisible={activeTab === 'urls'}
        onValidationUpdate={loadPendingValidations}
      />
    </>
  );
}

export default App;
