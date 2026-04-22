import React, { useRef, useState, useCallback, useId } from 'react';
import { useFocusHeading } from '../hooks/useFocusHeading';
import { content } from '../content';
import { RULES_REFERENCE_URL } from '../constants';

interface UploadStepProps {
  onFileSelected: (file: File) => Promise<void>;
  isProcessing: boolean;
  error: string | null;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export default function UploadStep({
  onFileSelected,
  isProcessing,
  error,
}: UploadStepProps): React.ReactElement {
  const headingRef = useFocusHeading();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputId = useId();

  const displayError = error ?? localError;

  const validateAndUpload = useCallback(
    async (file: File) => {
      setLocalError(null);

      if (!file.name.toLowerCase().endsWith('.docx')) {
        setLocalError(content.upload.errors.invalidType);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setLocalError(content.upload.errors.tooLarge);
        return;
      }

      await onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await validateAndUpload(file);
      }
    },
    [validateAndUpload]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        await validateAndUpload(file);
      }
    },
    [validateAndUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    []
  );

  return (
    <div className="margin-top-4">
      <h1 className="usa-h1" tabIndex={-1} ref={headingRef}>{content.steps.upload.heading}</h1>

      <div className="usa-prose margin-bottom-3">
        <p>
          Upload your NOFO Word document to prepare it for design. This tool checks formatting and structural issues against a{' '}
          <a
            href={RULES_REFERENCE_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            rules reference
            <span className="usa-sr-only"> (opens in a new tab)</span>
          </a>{' '}
          — it does not modify your document&apos;s regulatory or policy content. The downloaded file is ready for design handoff; your original remains your source of truth.
        </p>
      </div>

      <div
        className="usa-alert usa-alert--info usa-alert--slim margin-bottom-4"
        role="note"
      >
        <div className="usa-alert__body">
          <p className="usa-alert__text">
            <strong>{content.app.privacy.heading}</strong> — {content.app.privacy.body}
          </p>
        </div>
      </div>

      {displayError && (
        <div className="usa-alert usa-alert--error margin-bottom-3" role="alert">
          <div className="usa-alert__body">
            <p className="usa-alert__text">{displayError}</p>
          </div>
        </div>
      )}

      <div className="usa-form-group">
        <label className="usa-label" htmlFor={fileInputId}>
          {content.upload.dropzone.label}
        </label>
        <span className="usa-hint">{content.upload.dropzone.hint}</span>

        <div
          className={`usa-file-input-dropzone padding-4 border-2px border-dashed text-center margin-top-1${isDragOver ? ' bg-primary-lighter border-primary' : ' bg-base-lightest border-base-light'}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="button"
          aria-label={content.accessibility.fileInput.label}
          aria-disabled={isProcessing}
        >
          {isProcessing ? (
            <p className="margin-0" role="status" aria-live="polite">
              {content.accessibility.loadingSpinner}
            </p>
          ) : isDragOver ? (
            <p className="margin-0 font-body-md text-primary">
              {content.upload.dropzone.dragActiveLabel}
            </p>
          ) : (
            <p className="margin-0">
              {content.upload.dropzone.instruction}{' '}
              <button
                type="button"
                className="usa-button usa-button--unstyled"
                onClick={() => inputRef.current?.click()}
                disabled={isProcessing}
              >
                {content.upload.dropzone.buttonLabel}
              </button>
            </p>
          )}
        </div>

        <input
          ref={inputRef}
          className="usa-sr-only"
          type="file"
          id={fileInputId}
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          disabled={isProcessing}
          aria-label={content.accessibility.fileInput.label}
        />
      </div>

      <div className="margin-top-4">
        <p className="font-body-sm text-base-dark margin-bottom-1">
          <strong>Before you upload</strong>
        </p>
        <ul className="usa-list font-body-sm text-base-dark margin-top-0">
          <li>Resolve all tracked changes and comments in your Word document</li>
          <li>Check that headings are styled as headings in the Style Pane — not bolded normal text</li>
        </ul>
      </div>
    </div>
  );
}
