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
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

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

          {isIOS && (
            <p className="font-body-sm text-base-dark margin-bottom-2">
              On iOS, your document will open in a new tab. Tap the Share button, then choose <strong>Save to Files</strong> or <strong>Open in Word</strong>.
            </p>
          )}

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
