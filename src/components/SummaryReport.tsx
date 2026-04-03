import React from 'react';
import type { ReviewState, AcceptedFix, IssueResolution, Issue } from '../types';
import { content } from '../content';
import { getCategoryLabel } from '../utils/getCategoryLabel';
import ContentGuideBadge from './ContentGuideBadge';

interface SummaryReportProps {
  reviewState: ReviewState;
  acceptedFixes: AcceptedFix[];
  onProceedToDownload: () => void;
}

const SEVERITY_GROUPS = ['error', 'warning', 'suggestion'] as const;
type Severity = (typeof SEVERITY_GROUPS)[number];

const SEVERITY_LABELS: Record<Severity, string> = {
  error: 'Errors',
  warning: 'Warnings',
  suggestion: 'Suggestions',
};

export default function SummaryReport({
  reviewState,
  acceptedFixes,
  onProceedToDownload,
}: SummaryReportProps): React.ReactElement {
  const { issues, autoAppliedChanges, resolutions, activeContentGuide } = reviewState;

  const acceptedIssues = issues.filter(i => resolutions[i.id] === 'accepted');
  const unreviewedIssues = issues.filter(i => resolutions[i.id] === 'unreviewed');

  const totalFixed = acceptedFixes.length + autoAppliedChanges.length;

  return (
    <div className="margin-top-4">
      <h1 className="usa-h1 margin-bottom-1">{content.steps.summary.heading}</h1>
      {activeContentGuide && (
        <div className="margin-bottom-2">
          <ContentGuideBadge guide={activeContentGuide} />
        </div>
      )}

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
          <div className="usa-card__body padding-3 text-center" style={{ backgroundColor: '#f8e1e1' }}>
            <p className="font-heading-xl margin-0" style={{ color: '#b50909' }}>{unreviewedIssues.length}</p>
            <p className="font-body-sm margin-0" style={{ color: '#b50909' }}>Unreviewed</p>
          </div>
        </div>
      </div>

      {/* Auto-applied changes */}
      {autoAppliedChanges.length > 0 && (
        <div className="usa-alert usa-alert--success margin-bottom-4">
          <div className="usa-alert__body">
            <h2 className="usa-alert__heading">Changes applied automatically</h2>
            <p className="usa-alert__text">
              The following changes were made to your document without requiring your input. They are included in your download.
            </p>
            <ul className="usa-list margin-top-2">
              {autoAppliedChanges.map((change, i) => (
                <li key={i}>
                  <strong>{getCategoryLabel(change.ruleId)}</strong> &mdash; {change.description}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Issues grouped by severity */}
      {SEVERITY_GROUPS.map(severity => {
        const severityIssues = issues.filter(i => i.severity === severity);
        if (severityIssues.length === 0) return null;
        return (
          <div key={severity} className="margin-bottom-4">
            <h2 className="bg-base-lightest border-left-05 border-base-light padding-y-1 padding-x-2 font-sans text-bold text-base-darker margin-0">
              {SEVERITY_LABELS[severity]} ({severityIssues.length})
            </h2>
            <table className="usa-table usa-table--borderless width-full">
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '40%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Issue</th>
                  <th scope="col">Location</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {severityIssues.map(issue => {
                  const resolution = resolutions[issue.id] ?? null;
                  return (
                    <tr key={issue.id} style={getRowStyle(resolution)}>
                      <td>{getCategoryLabel(issue.ruleId)}</td>
                      <td>{issue.title}</td>
                      <td>{getLocationText(issue)}</td>
                      <td>{getStatusDisplay(resolution, issue.instructionOnly)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

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

function getRowStyle(resolution: IssueResolution | null): React.CSSProperties {
  if (resolution === 'accepted') return { backgroundColor: '#ecf3ec' };
  if (resolution === 'unreviewed') return { backgroundColor: '#f8e1e1' };
  return {};
}

function getLocationText(issue: Issue): string {
  const parts: string[] = [];
  if (issue.page != null) parts.push(`Page ${issue.page}`);
  if (issue.nearestHeading) parts.push(`Near: ${issue.nearestHeading}`);
  return parts.length > 0 ? parts.join(' · ') : '\u2014';
}

function getStatusDisplay(resolution: IssueResolution | null, instructionOnly?: boolean): React.ReactElement {
  switch (resolution) {
    case 'accepted':
      return <span style={{ color: '#1a7a1a', fontWeight: 'bold' }}>✓ Accepted</span>;
    case 'keptAsBold':
      return <span style={{ color: '#71767a' }}>Kept as bold text</span>;
    case 'skipped':
      return instructionOnly
        ? <span style={{ color: '#71767a' }}>I&apos;ll do it later</span>
        : <span style={{ color: '#71767a' }}>Skipped</span>;
    default:
      return <span style={{ color: '#71767a', fontStyle: 'italic' }}>Unreviewed</span>;
  }
}
