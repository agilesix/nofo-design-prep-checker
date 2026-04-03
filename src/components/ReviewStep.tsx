import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { ParsedDocument, ReviewState, AcceptedFix, IssueResolution, Issue, ContentGuideId } from '../types';
import { content } from '../content';
import { getCategoryLabel } from '../utils/getCategoryLabel';
import IssueCard from './IssueCard';
import ContentGuideBadge from './ContentGuideBadge';

interface ReviewStepProps {
  doc: ParsedDocument;
  reviewState: ReviewState;
  onComplete: (fixes: AcceptedFix[], resolutions: Record<string, IssueResolution>) => void;
  onGuideChange: (guideId: ContentGuideId) => void;
  onStartOver: () => void;
  bannerDismissed: boolean;
  onDismissBanner: (val: boolean) => void;
}

type SeverityFilter = 'all' | 'error' | 'warning' | 'suggestion';

export default function ReviewStep({
  doc,
  reviewState,
  onComplete,
  onGuideChange,
  onStartOver,
  bannerDismissed,
  onDismissBanner,
}: ReviewStepProps): React.ReactElement {
  const [resolutions, setResolutions] = useState<Record<string, IssueResolution>>(
    reviewState.resolutions
  );
  const [acceptedFixes, setAcceptedFixes] = useState<AcceptedFix[]>([]);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const { issues, autoAppliedChanges, activeContentGuide } = reviewState;

  const sectionIndexMap = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    doc.sections.forEach((s, i) => map.set(s.id, i));
    return map;
  }, [doc.sections]);

  const severityRank: Record<string, number> = { error: 0, warning: 1, suggestion: 2 };

  function issuePosition(issue: Issue): number {
    if (issue.page != null) return issue.page * 10000;
    const sectionIdx = sectionIndexMap.get(issue.sectionId) ?? Infinity;
    return sectionIdx * 10000;
  }

  const severityCounts = useMemo<Record<SeverityFilter, number>>(() => {
    const counts = { all: issues.length, error: 0, warning: 0, suggestion: 0 };
    for (const issue of issues) {
      if (issue.severity === 'error') counts.error++;
      else if (issue.severity === 'warning') counts.warning++;
      else if (issue.severity === 'suggestion') counts.suggestion++;
    }
    return counts;
  }, [issues]);

  // Derived filter used for rendering: falls back to 'all' immediately when the selected
  // severity has 0 issues, preventing a transient blank state between renders.
  const effectiveSeverityFilter: SeverityFilter =
    severityFilter !== 'all' && severityCounts[severityFilter] === 0 ? 'all' : severityFilter;

  // Sync state to match the effective filter so the radio buttons stay consistent.
  useEffect(() => {
    if (effectiveSeverityFilter !== severityFilter) {
      setSeverityFilter(effectiveSeverityFilter);
    }
  }, [effectiveSeverityFilter, severityFilter]);

  const filteredIssues = issues.filter(issue => {
    if (effectiveSeverityFilter === 'all') return true;
    return issue.severity === effectiveSeverityFilter;
  });

  const sortedIssues = [...filteredIssues].sort((a, b) => {
    const severityDiff = (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3);
    if (severityDiff !== 0) return severityDiff;
    return issuePosition(a) - issuePosition(b);
  });

  // Group by category
  const groupedIssues = groupByCategory(sortedIssues);

  const reviewedCount = Object.values(resolutions).filter(r => r !== 'unreviewed').length;
  const unreviewedCount = issues.length - reviewedCount;

  const handleAccept = useCallback((fix: AcceptedFix) => {
    setResolutions(prev => ({ ...prev, [fix.issueId]: 'accepted' }));
    setAcceptedFixes(prev => {
      const filtered = prev.filter(f => f.issueId !== fix.issueId);
      return [...filtered, fix];
    });
  }, []);

  const handleSkip = useCallback((issueId: string) => {
    setResolutions(prev => ({ ...prev, [issueId]: 'skipped' }));
    setAcceptedFixes(prev => prev.filter(f => f.issueId !== issueId));
  }, []);

  const handleKeepAsBold = useCallback((issueId: string) => {
    setResolutions(prev => ({ ...prev, [issueId]: 'keptAsBold' }));
    setAcceptedFixes(prev => prev.filter(f => f.issueId !== issueId));
  }, []);

  const handleUndo = useCallback((issueId: string) => {
    setResolutions(prev => ({ ...prev, [issueId]: 'unreviewed' }));
    setAcceptedFixes(prev => prev.filter(f => f.issueId !== issueId));
  }, []);

  const handleContinue = useCallback(() => {
    onComplete(acceptedFixes, resolutions);
  }, [onComplete, acceptedFixes, resolutions]);

  return (
    <div className="margin-top-4">
      <h1 className="usa-h1 margin-bottom-2">{content.steps.review.heading}</h1>

      <p className="usa-intro">{content.review.intro}</p>

      {!bannerDismissed && (
        <div className="usa-alert usa-alert--info margin-bottom-4" role="alert">
          <div className="usa-alert__body">
            <div className="display-flex flex-justify flex-align-start">
              <p className="usa-alert__text margin-0">
                <strong>Nothing is saved automatically.</strong> Your changes exist only in this browser tab. If you
                close or refresh the tab, you'll need to start over. Download your corrected
                document before leaving.
              </p>
              <button
                type="button"
                className="usa-button usa-button--unstyled margin-left-2 flex-no-shrink"
                aria-label="Dismiss alert"
                onClick={() => onDismissBanner(true)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {autoAppliedChanges.length > 0 && (
        <div className="usa-alert usa-alert--success margin-bottom-4">
          <div className="usa-alert__body">
            <h2 className="usa-alert__heading">{content.review.autoApplied.heading}</h2>
            <p className="usa-alert__text">{content.review.autoApplied.intro}</p>
            <ul className="usa-list">
              {autoAppliedChanges.map((change, i) => (
                <li key={i}>{change.description}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {issues.length === 0 ? (
        <div className="usa-alert usa-alert--success margin-bottom-4">
          <div className="usa-alert__body">
            <h2 className="usa-alert__heading">{content.review.noIssues.heading}</h2>
            <p className="usa-alert__text">{content.review.noIssues.body}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="display-flex flex-align-center flex-gap-3 margin-bottom-3 flex-wrap">
            <p className="margin-0 font-body-sm">
              <strong>{content.review.issueCount(issues.length)}</strong>
            </p>
            <p className="margin-0 font-body-sm text-base">
              {content.review.progress.label(reviewedCount, issues.length)}
            </p>
          </div>

          <div className="usa-form-group margin-bottom-4">
            <fieldset className="usa-fieldset">
              <legend className="usa-legend usa-legend--large font-body-sm">
                {content.review.filters.label}
              </legend>
              <div className="display-flex flex-gap-2 flex-wrap">
                {(['all', 'error', 'warning', 'suggestion'] as SeverityFilter[]).map(filter => {
                  if (filter !== 'all' && severityCounts[filter] === 0) return null;
                  const label =
                    filter === 'all'
                      ? content.review.filters.all
                      : content.review.filters[filter];
                  return (
                    <div key={filter} className="usa-radio display-inline-block">
                      <input
                        className="usa-radio__input usa-radio__input--tile"
                        type="radio"
                        id={`filter-${filter}`}
                        name="severity-filter"
                        value={filter}
                        checked={effectiveSeverityFilter === filter}
                        onChange={() => setSeverityFilter(filter)}
                      />
                      <label className="usa-radio__label" htmlFor={`filter-${filter}`}>
                        {label} ({severityCounts[filter]})
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {activeContentGuide && (
            <ContentGuideBadge
              key={activeContentGuide.id}
              guide={activeContentGuide}
              onGuideChange={onGuideChange}
            />
          )}

          {Object.entries(groupedIssues).map(([category, categoryIssues]) => (
            <div key={category} className="margin-bottom-5">
              <h2 className="usa-h3 border-bottom-1px border-base-light padding-bottom-1">
                {category}
                <span className="font-body-xs text-base margin-left-1">
                  ({categoryIssues.length})
                </span>
              </h2>

              {categoryIssues.map(issue => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  resolution={resolutions[issue.id] ?? 'unreviewed'}
                  onAccept={handleAccept}
                  onSkip={() => handleSkip(issue.id)}
                  onKeepAsBold={
                    issue.ruleId.startsWith('FORMAT-')
                      ? () => handleKeepAsBold(issue.id)
                      : undefined
                  }
                  onUndo={() => handleUndo(issue.id)}
                />
              ))}
            </div>
          ))}
        </>
      )}

      <div className="margin-top-4 padding-top-3" style={{ borderTop: '1px solid #c9c7c3' }}>
        {unreviewedCount > 0 && (
          <p className="font-body-sm margin-bottom-2" style={{ color: '#4a4944' }}>
            {content.review.continueWarning(unreviewedCount)}
          </p>
        )}

        <div className="display-flex flex-gap-2 flex-align-center flex-wrap">
          <button
            type="button"
            className="usa-button"
            onClick={handleContinue}
          >
            {content.review.continueButton}
          </button>
          <button
            type="button"
            className="usa-button usa-button--unstyled"
            onClick={onStartOver}
          >
            {content.review.startOverButton}
          </button>
        </div>
      </div>
    </div>
  );
}

function groupByCategory(issues: Issue[]): Record<string, Issue[]> {
  const groups: Record<string, Issue[]> = {};
  for (const issue of issues) {
    const label = getCategoryLabel(issue.ruleId);
    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(issue);
  }
  return groups;
}
