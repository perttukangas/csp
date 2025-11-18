import { useState, useEffect } from 'react';
import './App.css';
import { browser } from 'wxt/browser';
import { extensionStorage } from '../../utils/storage';
import UrlsList from './UrlsList';
import { ScrapeResponse } from '../background/BackgroundService';

export enum Step {
  START_SCRAPING = 1,
  VALIDATE_CONTENT = 2,
  CONFIGURE_EXTRACTION = 3,
  CONFIGURE_MODES = 4,
  VERIFY_AND_SEND = 5,
}

function App() {
  const [currentStep, setCurrentStep] = useState<Step>(Step.START_SCRAPING);
  const [isScrapingSession, setIsScrapingSession] = useState(false);
  const [forceHtmlStorage, setForceHtmlStorage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [totalResponses, setTotalResponses] = useState(0);
  const [validatedCount, setValidatedCount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isCrawlingMode, setIsCrawlingMode] = useState(false);
  const [isAnalysisMode, setIsAnalysisMode] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [storageUsage, setStorageUsage] = useState(0);

  const loadResponsesCount = async () => {
    console.log('Loading responses count...');
    try {
      const result = await browser.runtime.sendMessage<
        any,
        { success: boolean; responses: ScrapeResponse[] }
      >({
        type: 'GET_RESPONSES',
      });

      console.log('Responses result:', result);

      if (result.success) {
        const allResponses = result.responses || [];
        const validated = allResponses.filter(
          (r: any) => r.validationStatus === 'validated'
        );

        setTotalResponses(allResponses.length);
        setValidatedCount(validated.length);
      }
    } catch (error) {
      console.error('Failed to load responses:', error);
    }
  };

  const loadStorageUsage = async () => {
    try {
      const result = await browser.runtime.sendMessage<
        any,
        { success: boolean; storageInfo: any }
      >({
        type: 'GET_STORAGE_USAGE',
      });

      if (result.success && result.storageInfo) {
        setStorageUsage(result.storageInfo.percentageUsed);
        setStorageWarning(result.storageInfo.percentageUsed > 80);
      }
    } catch (error) {
      console.error('Failed to load storage usage:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const trackingEnabled = await extensionStorage.get(
          'urlTrackingEnabled',
          false
        );
        const storedPrompt = await extensionStorage.get('prompt', '');
        const crawlingMode = await extensionStorage.get('crawlingMode', false);
        const analysisMode = await extensionStorage.get('analysisMode', false);
        const htmlStorage = await extensionStorage.get('forceHtmlStorage', false);

        setPrompt(storedPrompt || '');
        setIsScrapingSession(trackingEnabled || false);
        setIsCrawlingMode(crawlingMode);
        setIsAnalysisMode(analysisMode);
        setForceHtmlStorage(htmlStorage);

        await loadResponsesCount();
        await loadStorageUsage();
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (!isScrapingSession) return;

    const interval = setInterval(() => {
      loadStorageUsage();
      loadResponsesCount();
    }, 10000);

    return () => clearInterval(interval);
  }, [isScrapingSession]);

  const handleStartScraping = async () => {
    try {
      setIsScrapingSession(true);
      await extensionStorage.set('urlTrackingEnabled', true);
      await extensionStorage.set('forceHtmlStorage', forceHtmlStorage);

      await browser.runtime.sendMessage({
        type: 'TRACKING_TOGGLED',
        enabled: true,
      });

      console.log('Scraping session started');
    } catch (error) {
      console.error('Failed to start scraping session:', error);
    }
  };

  const handleEndScraping = async () => {
    try {
      setIsScrapingSession(false);
      await extensionStorage.set('urlTrackingEnabled', false);

      await browser.runtime.sendMessage({
        type: 'TRACKING_TOGGLED',
        enabled: false,
      });

      if (totalResponses > 0) {
        setCurrentStep(Step.VALIDATE_CONTENT);
      }

      console.log('Scraping session ended');
    } catch (error) {
      console.error('Failed to end scraping session:', error);
    }
  };

  const handlePromptChange = async (newPrompt: string) => {
    try {
      setPrompt(newPrompt);
      await extensionStorage.set('prompt', newPrompt);
    } catch (error) {
      console.error('Failed to update prompt:', error);
    }
  };

  const handleToggleCrawling = async (enabled: boolean) => {
    try {
      setIsCrawlingMode(enabled);
      await extensionStorage.set('crawlingMode', enabled);

      if (enabled && isAnalysisMode) {
        setIsAnalysisMode(false);
        await extensionStorage.set('analysisMode', false);
        await browser.runtime.sendMessage({
          type: 'ANALYSIS_TOGGLED',
          enabled: false,
        });
      }

      await browser.runtime.sendMessage({
        type: 'CRAWLING_TOGGLED',
        enabled: enabled,
      });
    } catch (error) {
      console.error('Failed to update crawling mode:', error);
    }
  };

  const handleToggleAnalysis = async (enabled: boolean) => {
    try {
      setIsAnalysisMode(enabled);
      await extensionStorage.set('analysisMode', enabled);

      if (enabled && isCrawlingMode) {
        setIsCrawlingMode(false);
        await extensionStorage.set('crawlingMode', false);
        await browser.runtime.sendMessage({
          type: 'CRAWLING_TOGGLED',
          enabled: false,
        });
      }

      await browser.runtime.sendMessage({
        type: 'ANALYSIS_TOGGLED',
        enabled: enabled,
      });
    } catch (error) {
      console.error('Failed to update analysis mode:', error);
    }
  };

  const handleVerifySample = async () => {
    if (validatedCount === 0) {
      alert('No validated responses to verify!');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await browser.runtime.sendMessage({
        type: 'VERIFY_SAMPLE',
      });

      if (result.success) {
        setShowVerification(true);
        if (result.csvData) {
          const blob = new Blob([result.csvData], {
            type: 'text/csv;charset=utf-8;',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'scraping_results_sample.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        await loadResponsesCount();
      } else {
        alert('Failed to verify sample: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to verify sample:', error);
      alert('Failed to verify sample. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSendAll = async () => {
    if (validatedCount === 0) {
      alert('No validated responses to send!');
      return;
    }

    setIsSending(true);
    try {
      const result = await browser.runtime.sendMessage({
        type: 'SEND_VALIDATED',
      });

      if (result.success) {
        if (result.csvData) {
          const blob = new Blob([result.csvData], {
            type: 'text/csv;charset=utf-8;',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'scraping_results_all.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        await loadResponsesCount();
        setCurrentStep(Step.START_SCRAPING);
        setShowVerification(false);
      } else {
        alert('Failed to send responses: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to send validated responses:', error);
      alert('Failed to send responses. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleNext = () => {
    if (currentStep < Step.VERIFY_AND_SEND) {
      setCurrentStep((currentStep + 1) as Step);
    }
  };

  const handlePrevious = () => {
    if (currentStep > Step.START_SCRAPING) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  const canProceedFromStep = (step: Step): boolean => {
    switch (step) {
      case Step.START_SCRAPING:
        return !isScrapingSession && totalResponses > 0;
      case Step.VALIDATE_CONTENT:
        return validatedCount > 0;
      case Step.CONFIGURE_EXTRACTION:
        return prompt.trim().length > 0;
      case Step.CONFIGURE_MODES:
        return true;
      case Step.VERIFY_AND_SEND:
        return false;
      default:
        return false;
    }
  };

  if (isLoading) {
    return <div className="loading-state">Loading...</div>;
  }

  return (
    <>
      <h1>Web ScrAIper</h1>

      <div className="step-indicator">
        <div className="step-progress">
          Step {currentStep} of {Step.VERIFY_AND_SEND}
        </div>
        <div className="step-dots">
          {[1, 2, 3, 4, 5].map(step => (
            <span
              key={step}
              className={'dot' + (step === currentStep ? ' active' : '') + (step < currentStep ? ' completed' : '')}
            />
          ))}
        </div>
      </div>

      {currentStep === Step.START_SCRAPING && (
        <div className="step-content">
          <h2>1. Start Scraping Session</h2>
          <p>Begin collecting sites you visit.</p>

          <div className="checkbox-container">
            <input
              type="checkbox"
              checked={forceHtmlStorage}
              onChange={e => setForceHtmlStorage(e.target.checked)}
              disabled={isScrapingSession}
            />
            <div>
              <span>Force all content to be stored as HTML</span>
              <small style={{ display: 'block', marginTop: '4px', color: '#7d8590', fontSize: '12px' }}>
                Use this if you're scraping authenticated sites that aren't automatically detected by the app
              </small>
            </div>
          </div>

          {storageWarning && (
            <div className="storage-warning">
              ⚠️ Storage is {storageUsage.toFixed(1)}% full! Consider clearing old data before continuing.
            </div>
          )}

          {isScrapingSession && (
            <div className="scraping-status">
              <div className="status-badge active">
                🟢 Scraping Session Active
              </div>
              <div className="session-stats">
                <div>Total collected: {totalResponses}</div>
                <div>Storage usage: {storageUsage.toFixed(1)}%</div>
              </div>
            </div>
          )}

          <div className="action-buttons">
            {!isScrapingSession ? (
              <button className="btn-primary" onClick={handleStartScraping}>
                🚀 Start Scraping Session
              </button>
            ) : (
              <button className="btn-danger" onClick={handleEndScraping}>
                ⏹️ End Scraping Session
              </button>
            )}
          </div>
        </div>
      )}

      {currentStep === Step.VALIDATE_CONTENT && (
        <div className="step-content">
          <h2>2. Validate Scraped Content</h2>
          <p>Review and validate the collected sites during the scraping session.</p>

          <div className="validation-stats">
            <div className="stat">
              <span className="stat-label">Total:</span>
              <span className="stat-value">{totalResponses}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Validated:</span>
              <span className="stat-value">{validatedCount}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Pending:</span>
              <span className="stat-value">{totalResponses - validatedCount}</span>
            </div>
          </div>

          <UrlsList
            isVisible={true}
            onValidationUpdate={loadResponsesCount}
            tab={null}
          />
        </div>
      )}

      {currentStep === Step.CONFIGURE_EXTRACTION && (
        <div className="step-content">
          <h2>3. What Do You Want to Extract?</h2>
          <p>Describe what information you want to extract from the scraped content.</p>

          <div className="prompt-section">
            <label htmlFor="prompt">Extraction Prompt:</label>
            <textarea
              id="prompt"
              name="prompt"
              value={prompt}
              placeholder="Example: Extract product names, prices, and descriptions from the pages..."
              onChange={e => handlePromptChange(e.target.value)}
              rows={6}
            />
            <small>Be specific about what data you want to extract. Explicitly define if some field must not be missing.</small>
          </div>
        </div>
      )}

      {currentStep === Step.CONFIGURE_MODES && (
        <div className="step-content">
          <h2>4. Configure Processing Modes</h2>
          <p>Choose how you want to process the scraped content.</p>

          <div className="modes-section">
            <div
              className={'mode-card' + (isCrawlingMode ? ' active' : '')}
              onClick={() => handleToggleCrawling(!isCrawlingMode)}
            >
              <div className="mode-header">
                <input
                  type="checkbox"
                  checked={isCrawlingMode}
                  onChange={e => handleToggleCrawling(e.target.checked)}
                  onClick={e => e.stopPropagation()}
                />
                <h3>🔗 Crawling Mode</h3>
              </div>
              <p>Follow links found in the content to discover and scrape additional pages.</p>
            </div>

            <div
              className={'mode-card' + (isAnalysisMode ? ' active' : '')}
              onClick={() => handleToggleAnalysis(!isAnalysisMode)}
            >
              <div className="mode-header">
                <input
                  type="checkbox"
                  checked={isAnalysisMode}
                  onChange={e => handleToggleAnalysis(e.target.checked)}
                  onClick={e => e.stopPropagation()}
                />
                <h3>🔍 Analysis Mode</h3>
              </div>
              <p>Perform deeper AI-powered analysis on the content to extract insights.</p>
            </div>
          </div>

          <div className="mode-note">
            <small>Note: Crawling and Analysis modes are mutually exclusive. Only one can be active at a time.</small>
          </div>
        </div>
      )}

      {currentStep === Step.VERIFY_AND_SEND && (
        <div className="step-content">
          <h2>5. Verify and Send to Processing</h2>
          <p>Verify your configuration with a sample, then send all validated content for processing.</p>

          <div className="summary-section">
            <h3>Configuration Summary</h3>
            <div className="summary-item">
              <strong>Validated items:</strong> {validatedCount}
            </div>
            <div className="summary-item">
              <strong>Extraction prompt:</strong> {prompt.substring(0, 100)}{prompt.length > 100 ? '...' : ''}
            </div>
            <div className="summary-item">
              <strong>Crawling mode:</strong> {isCrawlingMode ? '✅ Enabled' : '❌ Disabled'}
            </div>
            <div className="summary-item">
              <strong>Analysis mode:</strong> {isAnalysisMode ? '✅ Enabled' : '❌ Disabled'}
            </div>
          </div>

          <div className="verify-section">
            <button
              className="btn-secondary"
              onClick={handleVerifySample}
              disabled={isVerifying || validatedCount === 0}
            >
              {isVerifying ? '⟳ Verifying...' : '🔍 Verify Sample (3 items)'}
            </button>

            {showVerification && (
              <div className="verification-result">
                <p>✅ Sample CSV downloaded. Check the results!</p>
                <button
                  className="btn-link"
                  onClick={() => setCurrentStep(Step.CONFIGURE_EXTRACTION)}
                >
                  ✏️ Adjust Prompt
                </button>
              </div>
            )}
          </div>

          <div className="send-section">
            <button
              className="btn-primary btn-large"
              onClick={handleSendAll}
              disabled={isSending || validatedCount === 0}
            >
              {isSending ? '⟳ Sending...' : '📤 Send All ' + validatedCount + ' Items to Server'}
            </button>
          </div>
        </div>
      )}

      <div className="navigation-buttons">
        {currentStep > Step.START_SCRAPING && (
          <button
            className="btn-secondary"
            onClick={handlePrevious}
          >
            ← Previous
          </button>
        )}
        {currentStep < Step.VERIFY_AND_SEND && (
          <button
            className="btn-primary"
            onClick={handleNext}
            disabled={!canProceedFromStep(currentStep)}
          >
            Next →
          </button>
        )}
      </div>
    </>
  );
}

export default App;
