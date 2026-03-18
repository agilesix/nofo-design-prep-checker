import React from 'react';
import type { AcceptedFix } from '../types';
import { content } from '../content';

interface DownloadStepProps {
  acceptedFixes: AcceptedFix[];
  autoAppliedCount: number;
  fileName: string;
  onDownload: () => Promise<void>;
  onStartOver: () => void;
}

export default function DownloadStep({
  acceptedFixes,
  autoAppliedCount,
  fileName,
  onDownload,
  onStartOver,
}: DownloadStepProps): React.ReactElement {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [hasDownloaded, setHasDownloaded] = React.useState(false);

  const downloadName = fileName.replace(/\.docx$/i, `${content.download.filename.suffix}.docx`);
  const acceptedCount = acceptedFixes.length;

  const handleDownloadClick = async (): Promise<void> => {
    setIsDownloading(true);
    try {
      await onDownload();
      setHasDownloaded(true);
    } finally {
      setIsDownloading(false);
    }
  };

  const fixCountLabel = (() => {
    const parts: string[] = [];
    if (acceptedCount > 0) {
      parts.push(`${acceptedCount} fix${acceptedCount === 1 ? '' : 'es'} accepted`);
    }
    if (autoAppliedCount > 0) {
      parts.push(`${autoAppliedCount} change${autoAppliedCount === 1 ? '' : 's'} applied automatically`);
    }
    return parts.length > 0 ? parts.join(' + ') : 'No manual fixes accepted';
  })();

  return (
    <div className="margin-top-4">
      <h1 className="usa-h1">
        {hasDownloaded ? 'Download complete' : 'Download your corrected document'}
      </h1>

      <div className="usa-alert usa-alert--info usa-alert--slim margin-bottom-3">
        <div className="usa-alert__body">
          <p className="usa-alert__text">
            <strong>This file is ready for design handoff.</strong>{' '}
            Hand it off to your designer or import it directly into NOFO Builder to begin the design process.
          </p>
        </div>
      </div>

      <div className="usa-alert usa-alert--info usa-alert--slim margin-bottom-4">
        <div className="usa-alert__body">
          <p className="usa-alert__text">
            <strong>Your original Word document remains your source of truth.</strong>{' '}
            Continue using it for internal review, routing, SharePoint uploads, and Grant Solutions.
            The downloaded file is a design-ready copy — not a replacement for your original content guide document.
          </p>
        </div>
      </div>

      {!hasDownloaded ? (
        <>
          {/* File card */}
          <div
            className="radius-md padding-3 margin-bottom-3 bg-white border-1px border-base-light"
          >
            {/* Original file row */}
            <div
              className="padding-bottom-2 margin-bottom-2 border-bottom-1px border-base-lighter"
            >
              <div className="display-flex flex-align-center">
                <span className="margin-right-1" aria-hidden="true">📄</span>
                <span
                  className="font-body-3xs text-uppercase text-base-dark letter-spacing-2"
                  style={{ fontSize: '0.7rem' }}
                >
                  Original file
                </span>
              </div>
              <p className="margin-0 margin-top-05 font-body-sm text-bold">{fileName}</p>
            </div>

            {/* Output filename row */}
            <div
              className="radius-sm padding-105"
              style={{ background: '#e8f5fb' }}
            >
              <span className="font-body-sm text-base-dark">
                <strong>Download as:</strong> {downloadName}
              </span>
            </div>
          </div>

          <p className="font-body-sm text-base-dark margin-bottom-3">{fixCountLabel}</p>

          <button
            type="button"
            className="usa-button usa-button--big margin-bottom-2"
            onClick={handleDownloadClick}
            disabled={isDownloading}
            aria-live="polite"
            aria-busy={isDownloading}
          >
            {isDownloading
              ? content.accessibility.loadingSpinner
              : `↓ Download ${downloadName}`}
          </button>

          <p
            className="font-body-xs margin-top-1 margin-bottom-4 maxw-tablet"
            style={{ color: '#71767a' }}
          >
            Word content controls from your original document are not preserved in the downloaded file.
            This is expected and consistent with how files behave throughout the design process.
            Your original document retains all content controls.
          </p>

          <div
            className="radius-md padding-3 margin-bottom-4"
            style={{ background: '#f0f0f0' }}
          >
            <p className="margin-0 font-body-sm">
              If you find issues later, you can re-upload your original document here and run the checks again.
            </p>
          </div>
        </>
      ) : (
        <div className="usa-alert usa-alert--success margin-bottom-4">
          <div className="usa-alert__body">
            <p className="usa-alert__text">
              <strong>{downloadName}</strong> has been downloaded to your computer.
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onStartOver}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textDecoration: 'underline',
          color: 'inherit',
          font: 'inherit',
        }}
      >
        ← Check another document
      </button>
    </div>
  );
}
