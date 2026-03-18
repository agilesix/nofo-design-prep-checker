import React from 'react';
import type { Issue } from '../types';

interface HeadingCardProps {
  headingCard: NonNullable<Issue['headingCard']>;
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: 'Exact match in content guide',
  partial: 'Partial match in content guide',
  positional: 'Positional match — heading present but may differ',
  none: 'Not found in content guide',
};

const MATCH_TYPE_CLASSES: Record<string, string> = {
  exact: 'usa-tag bg-green text-white',
  partial: 'usa-tag bg-gold text-ink',
  positional: 'usa-tag bg-blue text-white',
  none: 'usa-tag bg-red text-white',
};

export default function HeadingCard({ headingCard }: HeadingCardProps): React.ReactElement {
  const { boldText, matchType, matchGuideName, suggestedLevel, precedingLevel, precedingText } = headingCard;
  const matchLabel = MATCH_TYPE_LABELS[matchType] ?? matchType;
  const matchClass = MATCH_TYPE_CLASSES[matchType] ?? 'usa-tag';

  return (
    <div className="usa-card__body padding-2 bg-base-lightest border-left-05 border-primary margin-bottom-2">
      <div className="display-flex flex-align-center flex-gap-1 margin-bottom-1">
        <span className="font-body-sm text-bold">Heading:</span>
        <code className="font-mono-sm bg-white padding-x-05">{boldText}</code>
        <span className={matchClass} aria-label={`Match type: ${matchLabel}`}>
          {matchLabel}
        </span>
      </div>

      {matchGuideName && matchType !== 'none' && (
        <p className="font-body-xs text-base margin-0 margin-bottom-05">
          <span className="text-bold">Content guide heading:</span> {matchGuideName}
        </p>
      )}

      {suggestedLevel !== undefined && (
        <p className="font-body-xs text-base margin-0 margin-bottom-05">
          <span className="text-bold">Suggested heading level:</span> H{suggestedLevel}
        </p>
      )}

      {precedingLevel !== undefined && precedingText && (
        <p className="font-body-xs text-base margin-0">
          <span className="text-bold">Preceding heading:</span>{' '}
          H{precedingLevel} — "{precedingText}"
        </p>
      )}
    </div>
  );
}
