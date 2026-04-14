import type { Rule, ParsedDocument, RuleRunnerOptions, Issue, AutoAppliedChange } from '../types';

export interface RuleRunnerResult {
  issues: Issue[];
  autoAppliedChanges: AutoAppliedChange[];
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

    for (const rule of autoRules) {
      try {
        const result = rule.check(doc, options);
        for (const item of result) {
          if ('ruleId' in item && !('severity' in item)) {
            autoAppliedChanges.push(item as AutoAppliedChange);
          } else {
            issues.push(item as Issue);
          }
        }
      } catch (err) {
        console.error(`Rule ${rule.id} failed:`, err);
      }
    }

    for (const rule of regularRules) {
      try {
        const result = rule.check(doc, options);
        for (const item of result) {
          // Use the same discriminator as auto-apply rules: absence of severity
          // means the item is an AutoAppliedChange (e.g. LINK-006 anchor fmt fixes),
          // not an Issue.
          if ('ruleId' in item && !('severity' in item)) {
            autoAppliedChanges.push(item as AutoAppliedChange);
          } else {
            issues.push(item as Issue);
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
