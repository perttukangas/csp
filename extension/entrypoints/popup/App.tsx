import { useState, useEffect } from 'react';
import reactLogo from '@/assets/react.svg';
import wxtLogo from '/wxt.svg';
import './App.css';
import { browser } from 'wxt/browser';

function App() {
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [prompt, setPrompt] = useState('');

  // Load settings and current URL on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load tracking setting from storage
        const result = await browser.storage.sync.get(['urlTrackingEnabled']);
        const propmtResult = await browser.storage.sync.get(['prompt']);
        setPrompt(propmtResult.prompt || '');
        setIsTrackingEnabled(result.urlTrackingEnabled || false);
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
    return <div style={{ padding: '20px' }}>Loading...</div>;
  }

  return (
    <>
      <div>
        <a href="https://wxt.dev" target="_blank">
          <img src={wxtLogo} className="logo" alt="WXT logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Web ScrAIper</h1>

      {/* URL Tracking Toggle */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginTop: '20px',
        }}
      >
        <div>
          <label htmlFor="prompt">Prompt:</label>
          <textarea
            id="prompt"
            name="prompt"
            value={prompt}
            onChange={async e => await handlePromptChange(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={isTrackingEnabled}
              onChange={e => handleToggleTracking(e.target.checked)}
              style={{ transform: 'scale(1.2)' }}
            />
            <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
              {isTrackingEnabled
                ? '🟢 URL Tracking Enabled'
                : '🔴 URL Tracking Disabled'}
            </span>
          </label>
        </div>

        <div style={{ fontSize: '14px', color: '#666' }}>
          {isTrackingEnabled
            ? '✅ We are now scraping data from the pages you are visiting'
            : '❌ URL tracking is paused'}
        </div>
      </div>
    </>
  );
}

export default App;
