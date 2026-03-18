import React, { useState } from 'react';
import type { ActiveContentGuide, ContentGuideId } from '../types';
import { contentGuides } from '../data/contentGuides';

interface ContentGuideBadgeProps {
  guide: ActiveContentGuide;
  onGuideChange?: (guideId: ContentGuideId) => void;
}

export default function ContentGuideBadge({
  guide,
  onGuideChange,
}: ContentGuideBadgeProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<ContentGuideId>(guide.id);

  // Keep selectedId in sync if guide prop changes (e.g. after re-run)
  const currentGuideId = guide.id;
  const stateGuideId = selectedId;
  if (stateGuideId !== currentGuideId && !expanded) {
    // Only sync when panel is closed to avoid clobbering in-progress selection
    // This is handled via key reset — see usage in ReviewStep
  }

  function handleApply(): void {
    onGuideChange?.(selectedId);
    setExpanded(false);
  }

  function handleCancel(): void {
    setSelectedId(guide.id);
    setExpanded(false);
  }

  const sourceLabel = guide.source === 'detected' ? 'Auto-detected' : 'Manually selected';

  return (
    <div className="content-guide-badge margin-bottom-4" role="region" aria-label="Active content guide">
      <div className="content-guide-badge__header display-flex flex-align-center flex-justify flex-wrap flex-gap-2">
        <div className="display-flex flex-align-center flex-gap-1 flex-wrap">
          <span className="usa-tag">{guide.entry.opDiv}{guide.entry.subType ? ` \u00b7 ${guide.entry.subType}` : ''}</span>
          <span className="font-body-sm text-bold">{guide.entry.displayName}</span>
          <span className="font-body-xs text-base">{guide.entry.version}</span>
          <span className="font-body-3xs text-base-light">({sourceLabel})</span>
        </div>
        {onGuideChange && (
          <button
            type="button"
            className="usa-button usa-button--unstyled font-body-xs text-primary-darker"
            aria-expanded={expanded}
            aria-controls="content-guide-change-panel"
            onClick={() => setExpanded(e => !e)}
          >
            Wrong content guide?&nbsp;{expanded ? '\u25b4' : '\u25be'}
          </button>
        )}
      </div>

      {expanded && onGuideChange && (
        <div
          id="content-guide-change-panel"
          className="content-guide-badge__panel border-top-1px border-base-light padding-top-3 margin-top-2"
        >
          <div className="usa-form-group margin-bottom-2">
            <label className="usa-label font-body-sm" htmlFor="badge-guide-select">
              Select a different content guide
            </label>
            <select
              className="usa-select"
              id="badge-guide-select"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value as ContentGuideId)}
            >
              {contentGuides.map(g => (
                <option key={g.id} value={g.id}>
                  {g.displayName} ({g.version})
                </option>
              ))}
            </select>
          </div>
          <div className="display-flex flex-gap-2">
            <button
              type="button"
              className="usa-button usa-button--small"
              disabled={selectedId === guide.id}
              onClick={handleApply}
            >
              Apply and re-run checks
            </button>
            <button
              type="button"
              className="usa-button usa-button--outline usa-button--small"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
