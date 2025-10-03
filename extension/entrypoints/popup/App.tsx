import { useState, useEffect } from 'react';
import './App.css';
import { browser } from 'wxt/browser';
import ResponsesList from './ResponsesList';

function App() {
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'controls' | 'responses'>('controls');
  const [pendingValidations, setPendingValidations] = useState(0);

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
        setPendingValidations(pendingCount);
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
        const result = await browser.storage.sync.get(['urlTrackingEnabled']);
        const propmtResult = await browser.storage.sync.get(['prompt']);
        setPrompt(propmtResult.prompt || '');
        setIsTrackingEnabled(result.urlTrackingEnabled || false);

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
      await browser.storage.sync.set({ urlTrackingEnabled: enabled });

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
      await browser.storage.sync.set({ prompt: newPrompt });
      console.log('Prompt updated:', newPrompt);
    } catch (error) {
      console.error('Failed to update prompt:', error);
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
          className={`tab-button ${activeTab === 'responses' ? 'active' : ''}`}
          onClick={() => setActiveTab('responses')}
        >
          Responses
          {pendingValidations > 0 && (
            <span className="badge">
              {pendingValidations}
            </span>
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
            <span className={`status-text ${isTrackingEnabled ? 'enabled' : 'disabled'}`}>
              {isTrackingEnabled
                ? '🟢 URL Tracking Enabled'
                : '🔴 URL Tracking Disabled'}
            </span>
          </div>

          <div className={`status-description ${isTrackingEnabled ? 'enabled' : 'disabled'}`}>
            {isTrackingEnabled
              ? '✅ We are now scraping data from the pages you are visiting'
              : '❌ URL tracking is paused'}
          </div>
        </div>
      )}

      {/* Responses Tab */}
      <ResponsesList
        isVisible={activeTab === 'responses'}
        onValidationUpdate={loadPendingValidations}
      />
    </>
  );
}

export default App;
