import { useState, useEffect } from 'react';
import './App.css';
import { browser } from 'wxt/browser';
import { extensionStorage } from '../../utils/storage';
import UrlsList from './UrlsList';
import { ScrapeResponse } from '../background/BackgroundService';

export enum Tab {
  CONTROLS = 'controls',
  URLS = 'urls',
  HTMLS = 'htmls',
}

function App() {
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>(Tab.CONTROLS);
  const [pendingValidations, setPendingValidations] = useState(0);
  const [pendingValidationsHtml, setPendingValidationsHtml] = useState(0);
  const [validatedCount, setValidatedCount] = useState(0);
  const [validatedHtmlCount, setValidatedHtmlCount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isCrawlingMode, setIsCrawlingMode] = useState(false);

  // Load pending validations count
  const loadPendingValidations = async () => {
    console.log('Loading pending validations count...');
    try {
      const result = await browser.runtime.sendMessage<
        any,
        { success: boolean; responses: ScrapeResponse[] }
      >({
        type: 'GET_RESPONSES',
      });

      console.log('Pending validations response:', result);

      if (result.success) {
        const pendingLink = (result.responses || []).filter(
          (r: any) => r.type === 'url'
        );
        const pendingHtmls = (result.responses || []).filter(
          (r: any) => r.type === 'html'
        );
        const pendingCount = pendingLink.filter(
          (r: any) => r.validationStatus === 'pending'
        ).length;
        const validatedCount = pendingLink.filter(
          (r: any) => r.validationStatus === 'validated'
        ).length;

        const pendingHtmlCount = pendingHtmls.filter(
          (r: any) => r.validationStatus === 'pending'
        ).length;
        const validatedHtmlCount = pendingHtmls.filter(
          (r: any) => r.validationStatus === 'validated'
        ).length;

        setPendingValidations(pendingCount);
        setPendingValidationsHtml(pendingHtmlCount);
        setValidatedCount(validatedCount);
        setValidatedHtmlCount(validatedHtmlCount);
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

        const crawlingMode = await extensionStorage.get('crawlingMode', false);
        setIsCrawlingMode(crawlingMode);

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

   const handleToggleCrawling = async (enabled: boolean) => {
    try {
      setIsCrawlingMode(enabled);
      await extensionStorage.set('crawlingMode', enabled);

      await browser.runtime.sendMessage({
        type: 'CRAWLING_TOGGLED',
        enabled: enabled,
      });

      console.log(`Crawling mode ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to update crawling mode:', error);
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
    if (validatedCount === 0 && validatedHtmlCount === 0) {
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

  if (isLoading) {
    return <div className="loading-state">Loading...</div>;
  }

  return (
    <>
      <h1>Web ScrAIper</h1>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === Tab.CONTROLS ? 'active' : ''}`}
          onClick={() => setActiveTab(Tab.CONTROLS)}
        >
          Controls
        </button>
        <button
          className={`tab-button ${activeTab === Tab.URLS ? 'active' : ''}`}
          onClick={() => setActiveTab(Tab.URLS)}
        >
          URLs
          {pendingValidations > 0 && (
            <span className="badge">{pendingValidations}</span>
          )}
        </button>
        <button
          className={`tab-button ${activeTab === Tab.HTMLS ? 'active' : ''}`}
          onClick={() => setActiveTab(Tab.HTMLS)}
        >
          HTMLs
          {pendingValidationsHtml > 0 && (
            <span className="badge">{pendingValidationsHtml}</span>
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

          <div
            className="checkbox-container"
            onClick={() => handleToggleCrawling(!isCrawlingMode)}
          >
            <input
              type="checkbox"
              checked={isCrawlingMode}
              onChange={e => handleToggleCrawling(e.target.checked)}
              onClick={e => e.stopPropagation()}
            />
            <span
              className={`status-text ${isCrawlingMode ? 'enabled' : 'disabled'}`}
            >
              {isCrawlingMode
                ? '🟢 Crawling Mode Enabled'
                : '🔴 Crawling Mode Disabled'}
            </span>
          </div>
          
          <div className="send-section">
            <button
              className="send-button"
              onClick={handleSendValidated}
              disabled={
                isSending || (validatedCount === 0 && validatedHtmlCount === 0)
              }
            >
              {isSending
                ? '⟳ Sending...'
                : `📤 Send ${validatedCount + validatedHtmlCount} URLs to processing`}
            </button>
          </div>
        </div>
      )}

      {/* Urls Tab */}
      <UrlsList
        isVisible={[Tab.URLS].includes(activeTab)}
        onValidationUpdate={loadPendingValidations}
        tab={activeTab}
      />

      <UrlsList
        isVisible={[Tab.HTMLS].includes(activeTab)}
        onValidationUpdate={loadPendingValidations}
        tab={activeTab}
      />
    </>
  );
}

export default App;
