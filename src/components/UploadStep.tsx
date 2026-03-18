import React, { useRef, useState, useCallback, useId } from 'react';
import { content } from '../content';

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
      <h1 className="usa-h1">{content.steps.upload.heading}</h1>

      <div className="usa-prose margin-bottom-3">
        <p>{content.upload.helperText}</p>
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
    </div>
  );
}
