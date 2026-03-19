import React, { useState, useId } from 'react';
import type { Issue, IssueResolution, AcceptedFix } from '../types';
import { content } from '../content';
import HeadingCard from './HeadingCard';

interface IssueCardProps {
  issue: Issue;
  resolution: IssueResolution;
  onAccept: (fix: AcceptedFix) => void;
  onSkip: () => void;
  onKeepAsBold?: () => void;
  onUndo: () => void;
}

const SEVERITY_CLASSES: Record<string, string> = {
  error: 'usa-alert--error',
  warning: 'usa-alert--warning',
  suggestion: 'usa-alert--info',
};

const SEVERITY_LABELS: Record<string, string> = {
  error: content.review.severity.error,
  warning: content.review.severity.warning,
  suggestion: content.review.severity.suggestion,
};

export default function IssueCard({
  issue,
  resolution,
  onAccept,
  onSkip,
  onKeepAsBold,
  onUndo,
}: IssueCardProps): React.ReactElement {
  const [inputValue, setInputValue] = useState(issue.inputRequired?.prefill ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputId = useId();

  const alertClass = SEVERITY_CLASSES[issue.severity] ?? 'usa-alert--info';
  const severityLabel = SEVERITY_LABELS[issue.severity] ?? issue.severity;

  const isResolved = resolution !== 'unreviewed';

  const termCount = issue.inputRequired?.termCountRange !== undefined
    ? inputValue.split(',').filter(t => t.trim().length > 0).length
    : null;

  const belowMinTerms =
    issue.inputRequired?.minTermCount !== undefined &&
    termCount !== null &&
    termCount < issue.inputRequired.minTermCount;

  function handleAccept(): void {
    if (issue.inputRequired && !issue.instructionOnly) {
      // Validate input
      if (issue.inputRequired.validationPattern) {
        const pattern = new RegExp(issue.inputRequired.validationPattern);
        if (!pattern.test(inputValue)) {
          setValidationError(
            issue.inputRequired.validationMessage ?? 'Invalid input format.'
          );
          return;
        }
      }
      if (!inputValue.trim() && !issue.instructionOnly) {
        setValidationError('Please enter a value before accepting.');
        return;
      }
    }

    setValidationError(null);

    onAccept({
      issueId: issue.id,
      ruleId: issue.ruleId,
      targetField: issue.inputRequired?.targetField,
      value: issue.inputRequired ? inputValue.trim() : undefined,
    });
  }

  const resolvedBgStyle: React.CSSProperties = isResolved
    ? { backgroundColor: resolution === 'accepted' ? '#ecf3ec' : '#f0f0f0' }
    : {};

  function handleUndo(): void {
    setValidationError(null);
    onUndo();
  }

  return (
    <div
      className={`usa-alert ${alertClass} issue-card margin-bottom-3`}
      style={resolvedBgStyle}
      aria-labelledby={`issue-title-${issue.id}`}
    >
      <div className="usa-alert__body">
        <div className="display-flex flex-align-center flex-gap-1 margin-bottom-1">
          <span className="usa-tag font-body-3xs">{severityLabel}</span>
          {isResolved && (
            <span className="usa-tag usa-tag--big bg-base text-white font-body-3xs">
              {content.review.resolution[resolution]}
            </span>
          )}
        </div>

        <h3
          className="usa-alert__heading font-body-md"
          id={`issue-title-${issue.id}`}
        >
          {issue.title}
        </h3>

        <p className="usa-alert__text">{issue.description}</p>

        {issue.location && (
          <p className="font-mono-xs text-base margin-top-1">
            <span className="text-bold">Location:</span> {issue.location}
          </p>
        )}

        {issue.nearestHeading && (
          <p className="font-body-xs text-base margin-top-1">
            <span className="text-bold">Near:</span> {issue.nearestHeading}
          </p>
        )}

        {issue.headingCard && (
          <HeadingCard headingCard={issue.headingCard} />
        )}

        {issue.suggestedFix && (
          <div className="margin-top-2">
            <p className="font-body-sm text-bold margin-0">Suggested fix:</p>
            <p className="font-body-sm margin-top-05">{issue.suggestedFix}</p>
          </div>
        )}

        {issue.inputRequired && !issue.instructionOnly && !isResolved && (
          <div className="usa-form-group margin-top-2">
            <label className="usa-label font-body-sm" htmlFor={inputId}>
              {issue.inputRequired.label}
              {issue.inputRequired.fieldDescription && (
                <span className="usa-hint display-block font-body-xs margin-top-05">
                  {issue.inputRequired.fieldDescription}
                </span>
              )}
            </label>

            {issue.inputRequired.prefillNote && (
              <div className="usa-alert usa-alert--info usa-alert--slim margin-bottom-1">
                <div className="usa-alert__body">
                  <p className="usa-alert__text font-body-xs">{issue.inputRequired.prefillNote}</p>
                </div>
              </div>
            )}

            {issue.inputRequired.hint && (
              <span
                className="usa-hint font-body-xs"
                id={`${inputId}-hint`}
              >
                {issue.inputRequired.hint}
              </span>
            )}

            {validationError && (
              <span
                className="usa-error-message font-body-xs"
                id={`${inputId}-error`}
                role="alert"
              >
                {validationError}
              </span>
            )}

            {issue.inputRequired.type === 'textarea' ? (
              <textarea
                className={`usa-textarea font-body-sm${validationError ? ' usa-input--error' : ''}`}
                id={inputId}
                value={inputValue}
                onChange={e => {
                  setInputValue(e.target.value);
                  setValidationError(null);
                }}
                placeholder={issue.inputRequired.placeholder}
                maxLength={issue.inputRequired.maxLength}
                aria-describedby={[
                  issue.inputRequired.hint ? `${inputId}-hint` : '',
                  validationError ? `${inputId}-error` : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined}
                rows={4}
              />
            ) : (
              <input
                className={`usa-input font-body-sm${validationError ? ' usa-input--error' : ''}`}
                type="text"
                id={inputId}
                value={inputValue}
                onChange={e => {
                  setInputValue(e.target.value);
                  setValidationError(null);
                }}
                placeholder={issue.inputRequired.placeholder}
                maxLength={issue.inputRequired.maxLength}
                aria-describedby={[
                  issue.inputRequired.hint ? `${inputId}-hint` : '',
                  validationError ? `${inputId}-error` : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined}
              />
            )}

            {issue.inputRequired.termCountRange && termCount !== null && (
              <span
                role="status"
                className="display-block font-body-xs text-base margin-top-05"
              >
                {termCount} of {issue.inputRequired.termCountRange} keywords entered
              </span>
            )}
          </div>
        )}

        {isResolved && issue.inputRequired && !issue.instructionOnly && inputValue.trim() && (
          <p className="font-body-sm margin-top-2" style={{ color: '#2e7d32' }}>
            ✓ Value recorded: {inputValue.trim()}
          </p>
        )}

        {!isResolved && (
          <div className="margin-top-3 display-flex flex-gap-2 flex-wrap">
            {!issue.instructionOnly && (
              <button
                type="button"
                className="usa-button usa-button--small"
                onClick={handleAccept}
                disabled={belowMinTerms}
              >
                {content.review.actions.accept}
              </button>
            )}

            {onKeepAsBold && (
              <button
                type="button"
                className="usa-button usa-button--outline usa-button--small"
                onClick={onKeepAsBold}
              >
                {content.review.actions.keepAsBold}
              </button>
            )}

            <button
              type="button"
              className="usa-button usa-button--unstyled usa-button--small"
              onClick={onSkip}
            >
              {issue.instructionOnly ? 'Mark reviewed' : content.review.actions.skip}
            </button>
          </div>
        )}

        {isResolved && (
          <div className="margin-top-2">
            <button
              type="button"
              className="usa-button usa-button--unstyled font-body-sm"
              onClick={handleUndo}
            >
              ↩ Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
