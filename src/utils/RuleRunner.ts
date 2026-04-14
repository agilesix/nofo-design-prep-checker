import type { Rule, ParsedDocument, RuleRunnerOptions, Issue, AutoAppliedChange } from '../types';

export interface RuleRunnerResult {
  issues: Issue[];
  autoAppliedChanges: AutoAppliedChange[];
}

/**
 * Type guard that distinguishes an AutoAppliedChange from an Issue.
 *
 * Both types carry `ruleId`, so that field is not a useful discriminator.
 * The reliable signal is that AutoAppliedChange deliberately has no `severity`
 * field, while every Issue requires one.
 */
function isAutoAppliedChange(item: Issue | AutoAppliedChange): item is AutoAppliedChange {
  return !('severity' in item);
}

export class RuleRunner {
  private rules: Rule[];

  constructor(rules: Rule[]) {
    this.rules = rules;
  }

  run(doc: ParsedDocument, options: RuleRunnerOptions): RuleRunnerResult {
    const issues: Issue[] = [];
    const autoAppliedChanges: AutoAppliedChange[] = [];

    // Separate auto-apply rules and run them first
    const autoRules = this.rules.filter(r => r.autoApply === true && this.shouldRunRule(r, options));
    const regularRules = this.rules.filter(r => r.autoApply !== true && this.shouldRunRule(r, options));

    for (const rule of [...autoRules, ...regularRules]) {
      try {
        const result = rule.check(doc, options);
        for (const item of result) {
          if (isAutoAppliedChange(item)) {
            autoAppliedChanges.push(item);
          } else {
            issues.push(item);
          }
        }
      } catch (err) {
        console.error(`Rule ${rule.id} failed:`, err);
      }
    }

    return { issues, autoAppliedChanges };
  }

  private shouldRunRule(rule: Rule, options: RuleRunnerOptions): boolean {
    if (!rule.contentGuideIds || rule.contentGuideIds.length === 0) {
      return true; // universal rule
    }
    if (options.contentGuideId === null) {
      return false; // OpDiv rule, no guide selected
    }
    return rule.contentGuideIds.includes(options.contentGuideId);
  }
}
