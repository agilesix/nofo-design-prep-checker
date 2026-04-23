import React from 'react';
import { useFocusHeading } from '../hooks/useFocusHeading';
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
  const headingRef = useFocusHeading();
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [hasDownloaded, setHasDownloaded] = React.useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as Record<string, unknown>).MSStream;

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
      <h1 className="usa-h1" tabIndex={-1} ref={headingRef}>
        {hasDownloaded ? 'Download complete' : 'Download your corrected document'}
      </h1>

      <div className="usa-alert usa-alert--info usa-alert--slim margin-bottom-3">
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
          {isIOS && (
            <div
              className="margin-bottom-3"
              style={{
                background: '#fff8e1',
                borderLeft: '4px solid #f9c642',
                borderRadius: '0 4px 4px 0',
                padding: '0.875rem 1.125rem',
              }}
            >
              <p className="margin-0 margin-bottom-05 font-body-sm text-bold">
                📱 On iPhone or iPad?
              </p>
              <p className="margin-0 margin-bottom-1 font-body-sm">
                After tapping download, your document opens in a new tab. To save it:
              </p>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.375rem' }}>
                  <span style={{
                    flexShrink: 0,
                    background: '#f9c642',
                    borderRadius: '50%',
                    width: '1.25rem',
                    height: '1.25rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    marginTop: '0.1rem',
                  }}>1</span>
                  <span className="font-body-sm">
                    In the new tab, tap the Share{' '}
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ verticalAlign: 'middle', display: 'inline-block' }}
                    >
                      <line x1="12" y1="2" x2="12" y2="14"/>
                      <polyline points="8 6 12 2 16 6"/>
                      <path d="M20 16v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4"/>
                    </svg>
                    {' '}button
                  </span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span style={{
                    flexShrink: 0,
                    background: '#f9c642',
                    borderRadius: '50%',
                    width: '1.25rem',
                    height: '1.25rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    marginTop: '0.1rem',
                  }}>2</span>
                  <span className="font-body-sm">
                    Choose <strong>Open in Word</strong> or <strong>Save to Files</strong>
                  </span>
                </li>
              </ol>
            </div>
          )}

          <button
            type="button"
            className="usa-button usa-button--big margin-bottom-2"
            onClick={handleDownloadClick}
            disabled={isDownloading}
            aria-live="polite"
            aria-busy={isDownloading}
          >
            {isDownloading
              ? (isIOS ? 'Preparing your document…' : content.accessibility.loadingSpinner)
              : `↓ Download ${downloadName}`}
          </button>

          <p className="font-body-sm text-base-dark margin-bottom-3">{fixCountLabel}</p>

          <p className="font-body-sm margin-bottom-1">
            <strong>This file is ready for design handoff.</strong>{' '}
            Once you download your corrected document, hand it off to your designer or import it directly into NOFO Builder to begin the design process.
          </p>

          <p className="font-body-sm margin-bottom-4">
            <strong>NOFO Design Prep Checker and NOFO Builder will not know if bold text needs to be a heading.</strong>{' '}
            After you download your corrected document, open the Navigation Pane in Word (View → Navigation Pane) to check that bold text hasn't been used in place of a heading style.
          </p>

          <p className="font-body-xs margin-top-1 margin-bottom-4 maxw-tablet text-base">
            Word content controls from your original document are not preserved in the downloaded file.
            This is expected and consistent with how files behave throughout the design process.
            Your original NOFO Word document retains all content controls.
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
        className="usa-button usa-button--unstyled padding-0 margin-0 text-decoration-underline"
      >
        Check another document
      </button>
    </div>
  );
}
