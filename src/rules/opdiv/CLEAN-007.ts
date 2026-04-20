import type { Rule, AutoAppliedChange, ParsedDocument, RuleRunnerOptions } from '../../types';
import { DGHT_STEP1_ANCHOR } from './CLEAN-007-constants';

/**
 * CLEAN-007: Remove CDC preamble content (auto-apply)
 *
 * CDC NOFO templates often begin with editorial instructions, content-guide
 * reference tables, or other scaffolding that is not part of the NOFO itself.
 * This rule detects that preamble by checking whether any non-empty content
 * appears before the heading whose text is exactly "Step 1: Review the
 * Opportunity" (any heading level, case-insensitive) and, when found, silently
 * removes everything from the start of the document up to — but not including
 * — that heading.
 *
 * Safe to apply across all CDC content guides because CDC NOFO metadata
 * (Author, Subject, Keywords, Tagline) lives inside the document body under
 * the Step 1 heading, not before it.
 *
 * Scoped to all CDC content guides: cdc, cdc-research, cdc-dght-ssj,
 * cdc-dght-competitive, cdc-dghp.
 */
const CLEAN_007: Rule = {
  id: 'CLEAN-007',
  autoApply: true,
  contentGuideIds: ['cdc', 'cdc-research', 'cdc-dght-ssj', 'cdc-dght-competitive', 'cdc-dghp'],
  check(doc: ParsedDocument, _options: RuleRunnerOptions): AutoAppliedChange[] {
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(doc.html, 'text/html');

    // Find the Step 1 anchor heading among direct body children.
    const bodyChildren = Array.from(htmlDoc.body.children);
    const step1Idx = bodyChildren.findIndex(
      el =>
        /^h[1-6]$/i.test(el.tagName) &&
        (el.textContent ?? '').trim().toLowerCase() === DGHT_STEP1_ANCHOR
    );

    // Safety: only remove if the Step 1 heading is present.
    if (step1Idx === -1) return [];

    // No-op: Step 1 is already the first body element — nothing to remove.
    if (step1Idx === 0) return [];

    // Only fire when at least one non-empty element precedes Step 1.
    const hasPreamble = bodyChildren
      .slice(0, step1Idx)
      .some(el => (el.textContent ?? '').trim().length > 0);
    if (!hasPreamble) return [];

    return [
      {
        ruleId: 'CLEAN-007',
        description: 'CDC preamble removed from beginning of document.',
        targetField: 'struct.dght.removescaffolding',
      },
    ];
  },
};

export default CLEAN_007;
