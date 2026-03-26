import React from 'react';
import type { ReviewState, AcceptedFix } from '../types';
import { content } from '../content';
import { getCategoryLabel } from '../utils/getCategoryLabel';
import ContentGuideBadge from './ContentGuideBadge';

interface SummaryReportProps {
  reviewState: ReviewState;
  acceptedFixes: AcceptedFix[];
  onProceedToDownload: () => void;
  onStartOver: () => void;
}

export default function SummaryReport({
  reviewState,
  acceptedFixes,
  onProceedToDownload,
  onStartOver,
}: SummaryReportProps): React.ReactElement {
  const { issues, autoAppliedChanges, resolutions, activeContentGuide } = reviewState;

  const acceptedIssues = issues.filter(i => resolutions[i.id] === 'accepted');
  const skippedIssues = issues.filter(i => resolutions[i.id] === 'skipped');
  const keptAsBoldIssues = issues.filter(i => resolutions[i.id] === 'keptAsBold');
  const unreviewedIssues = issues.filter(i => resolutions[i.id] === 'unreviewed');

  const totalFixed = acceptedFixes.length + autoAppliedChanges.length;

  return (
    <div className="margin-top-4">
      <div className="display-flex flex-align-center flex-gap-2 margin-bottom-2">
        <h1 className="usa-h1 margin-0">{content.steps.summary.heading}</h1>
        {activeContentGuide && (
          <ContentGuideBadge guide={activeContentGuide} />
        )}
      </div>

      <p className="usa-intro">{content.summary.intro}</p>

      {/* Summary stats */}
      <div className="grid-row grid-gap-3 margin-bottom-4">
        <div className="grid-col-12 tablet:grid-col-3">
          <div className="usa-card__body bg-primary-lighter padding-3 text-center">
            <p className="font-heading-xl margin-0 text-primary">{totalFixed}</p>
            <p className="font-body-sm margin-0">Total changes</p>
          </div>
        </div>
        <div className="grid-col-12 tablet:grid-col-3">
          <div className="usa-card__body bg-green-cool-5 padding-3 text-center">
            <p className="font-heading-xl margin-0 text-green-cool-60">{acceptedIssues.length}</p>
            <p className="font-body-sm margin-0">{content.summary.sections.accepted}</p>
          </div>
        </div>
        <div className="grid-col-12 tablet:grid-col-3">
          <div className="usa-card__body bg-base-lightest padding-3 text-center">
            <p className="font-heading-xl margin-0 text-base">{autoAppliedChanges.length}</p>
            <p className="font-body-sm margin-0">{content.summary.sections.autoApplied}</p>
          </div>
        </div>
        <div className="grid-col-12 tablet:grid-col-3">
          <div className="usa-card__body bg-gold-5 padding-3 text-center">
            <p className="font-heading-xl margin-0 text-gold-50">{skippedIssues.length + unreviewedIssues.length}</p>
            <p className="font-body-sm margin-0">{content.summary.sections.skipped}</p>
          </div>
        </div>
      </div>

      {/* Auto-applied changes */}
      {autoAppliedChanges.length > 0 && (
        <div className="margin-bottom-4">
          <h2 className="usa-h3">{content.summary.sections.autoApplied}</h2>
          <ul className="usa-list">
            {autoAppliedChanges.map((change, i) => (
              <li key={i}>{change.description}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Accepted fixes */}
      {acceptedIssues.length > 0 && (
        <div className="margin-bottom-4">
          <h2 className="usa-h3">{content.summary.sections.accepted}</h2>
          <table className="usa-table usa-table--borderless width-full">
            <thead>
              <tr>
                <th scope="col">Issue</th>
                <th scope="col">Category</th>
                <th scope="col">Severity</th>
              </tr>
            </thead>
            <tbody>
              {acceptedIssues.map(issue => (
                <tr key={issue.id}>
                  <td>{issue.title}</td>
                  <td>{getCategoryLabel(issue.ruleId)}</td>
                  <td>
                    <span className={`usa-tag font-body-3xs ${getSeverityTagClass(issue.severity)}`}>
                      {issue.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Skipped issues */}
      {skippedIssues.length > 0 && (
        <div className="margin-bottom-4">
          <h2 className="usa-h3">{content.summary.sections.skipped}</h2>
          <ul className="usa-list">
            {skippedIssues.map(issue => (
              <li key={issue.id}>
                <strong>{issue.title}</strong> — {getCategoryLabel(issue.ruleId)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Kept as bold */}
      {keptAsBoldIssues.length > 0 && (
        <div className="margin-bottom-4">
          <h2 className="usa-h3">Kept as bold</h2>
          <ul className="usa-list">
            {keptAsBoldIssues.map(issue => (
              <li key={issue.id}>{issue.title}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Unreviewed */}
      {unreviewedIssues.length > 0 && (
        <div className="usa-alert usa-alert--warning margin-bottom-4">
          <div className="usa-alert__body">
            <h2 className="usa-alert__heading">Unreviewed issues</h2>
            <p className="usa-alert__text">
              {unreviewedIssues.length} issue{unreviewedIssues.length === 1 ? '' : 's'} were not reviewed and will not have fixes applied.
            </p>
            <ul className="usa-list">
              {unreviewedIssues.map(issue => (
                <li key={issue.id}>{issue.title}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="margin-top-4">
        <button
          type="button"
          className="usa-button"
          onClick={onProceedToDownload}
        >
          {content.summary.downloadButton}
        </button>
      </div>
    </div>
  );
}

function getSeverityTagClass(severity: string): string {
  switch (severity) {
    case 'error': return 'bg-red text-white';
    case 'warning': return 'bg-gold text-ink';
    case 'suggestion': return 'bg-blue text-white';
    default: return 'bg-base text-white';
  }
}
