import React from 'react';
import type { AcceptedFix } from '../types';
import { content } from '../content';

interface DownloadStepProps {
  acceptedFixes: AcceptedFix[];
  fileName: string;
  onDownload: () => Promise<void>;
  onStartOver: () => void;
}

export default function DownloadStep({
  acceptedFixes,
  fileName: _fileName,
  onDownload,
  onStartOver,
}: DownloadStepProps): React.ReactElement {
  const hasChanges = acceptedFixes.length > 0;

  const [isDownloading, setIsDownloading] = React.useState(false);
  const [hasDownloaded, setHasDownloaded] = React.useState(false);

  const handleDownloadClick = async (): Promise<void> => {
    setIsDownloading(true);
    try {
      await onDownload();
      setHasDownloaded(true);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="margin-top-4">
      <h1 className="usa-h1">{content.steps.download.heading}</h1>

      {hasChanges ? (
        <>
          <p className="usa-intro">{content.download.intro}</p>

          <div className="margin-top-4 margin-bottom-4">
            <button
              type="button"
              className="usa-button usa-button--big"
              onClick={handleDownloadClick}
              disabled={isDownloading}
              aria-live="polite"
            >
              {isDownloading
                ? content.accessibility.loadingSpinner
                : content.download.button}
            </button>
          </div>

          {hasDownloaded && (
            <div className="usa-alert usa-alert--success margin-bottom-4">
              <div className="usa-alert__body">
                <h2 className="usa-alert__heading">{content.download.postDownload.heading}</h2>
                <p className="usa-alert__text">{content.download.postDownload.body}</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="usa-alert usa-alert--info margin-bottom-4">
            <div className="usa-alert__body">
              <h2 className="usa-alert__heading">{content.download.noChanges.heading}</h2>
              <p className="usa-alert__text">{content.download.noChanges.body}</p>
            </div>
          </div>

          <div className="margin-bottom-4">
            <button
              type="button"
              className="usa-button"
              onClick={handleDownloadClick}
              disabled={isDownloading}
            >
              {isDownloading
                ? content.accessibility.loadingSpinner
                : content.download.noChanges.button}
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        className="usa-button usa-button--outline"
        onClick={onStartOver}
      >
        {content.download.startOver}
      </button>
    </div>
  );
}
