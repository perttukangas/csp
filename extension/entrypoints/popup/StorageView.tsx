import { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';

interface StorageUsage {
  bytesInUse: number;
  quotaBytes: number;
  percentageUsed: number;
  isLocal: boolean;
}

interface StorageBreakdownItem {
  key: string;
  size: number;
  percentage: number;
  storageType?: 'sync' | 'local';
}

interface StorageViewProps {
  isVisible: boolean;
  onStorageUpdate?: () => void;
}

function StorageView({ isVisible, onStorageUpdate }: StorageViewProps) {
  console.log('Is this called ?');
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [storageBreakdown, setStorageBreakdown] = useState<
    StorageBreakdownItem[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  // Format bytes to human-readable string
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Load storage usage information via background script
  const loadStorageUsage = async () => {
    try {
      setIsLoading(true);

      const result = await browser.runtime.sendMessage<
        any,
        { success: boolean; storageInfo: any }
      >({
        type: 'GET_STORAGE_USAGE',
      });

      if (result.success && result.storageInfo) {
        const { storageInfo } = result;

        setStorageUsage({
          bytesInUse: storageInfo.bytesInUse,
          quotaBytes: storageInfo.quotaBytes,
          percentageUsed: storageInfo.percentageUsed,
          isLocal: storageInfo.isLocal,
        });

        setStorageBreakdown(storageInfo.breakdown || []);

        console.log('StorageView: Storage data updated successfully');
      } else {
        console.error('StorageView: Failed to get storage info');
      }
    } catch (error) {
      console.error('Failed to load storage usage:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load storage data when component becomes visible
  useEffect(() => {
    if (isVisible) {
      loadStorageUsage();
    }
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="tab-content storage-tab">
      {isLoading ? (
        <div className="storage-loading">Loading storage information...</div>
      ) : storageUsage ? (
        <>
          <div className="storage-overview">
            <h3>Storage Usage</h3>
            <div className="storage-info">
              <div className="storage-type">
                📦 Using {storageUsage.isLocal ? 'Local' : 'Sync'} Storage
              </div>
              <div className="storage-usage">
                {formatBytes(storageUsage.bytesInUse)} /{' '}
                {formatBytes(storageUsage.quotaBytes)}
              </div>
              <div className="storage-percentage">
                {storageUsage.percentageUsed.toFixed(1)}% used
              </div>
              <div className="storage-debug">
                <small>
                  Bytes: {storageUsage.bytesInUse.toLocaleString()} /{' '}
                  {storageUsage.quotaBytes.toLocaleString()}
                </small>
              </div>
            </div>

            <div className="progress-bar">
              <div
                className={`progress-fill ${
                  storageUsage.percentageUsed > 80
                    ? 'warning'
                    : storageUsage.percentageUsed > 60
                      ? 'caution'
                      : 'normal'
                }`}
                style={{
                  width: `${Math.min(storageUsage.percentageUsed, 100)}%`,
                }}
              ></div>
            </div>

            {storageUsage.percentageUsed > 80 && (
              <div className="storage-warning">
                ⚠️ Storage is getting full! Consider clearing old data.
              </div>
            )}
          </div>

          {storageBreakdown.length > 0 && (
            <div className="storage-breakdown">
              <h4>Storage Breakdown</h4>
              {storageBreakdown.map(item => (
                <div key={item.key} className="storage-item">
                  <div className="item-info">
                    <span className="item-key">
                      {item.key}
                      {item.storageType && (
                        <span className="storage-type-badge">
                          {item.storageType === 'local' ? '📱' : '☁️'}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="item-size">{formatBytes(item.size)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="storage-loading">
          Failed to load storage information.
        </div>
      )}
    </div>
  );
}

export default StorageView;
