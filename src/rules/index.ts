import type { Rule } from '../types';

// Universal rules
import META_001 from './universal/META-001';
import META_002 from './universal/META-002';
import META_003 from './universal/META-003';
import LINK_001 from './universal/LINK-001';
import LINK_002 from './universal/LINK-002';
import LINK_003 from './universal/LINK-003';
import LINK_004 from './universal/LINK-004';
import LINK_006 from './universal/LINK-006';
import LINK_007 from './universal/LINK-007';
import LINK_008 from './universal/LINK-008';
import LINK_009 from './universal/LINK-009';
import TABLE_002 from './universal/TABLE-002';
import TABLE_003 from './universal/TABLE-003';
import NOTE_001 from './universal/NOTE-001';
import NOTE_004 from './universal/NOTE-004';
import IMG_001 from './universal/IMG-001';
import LIST_001 from './universal/LIST-001';
import FORMAT_002 from './universal/FORMAT-002';
import FORMAT_003 from './universal/FORMAT-003';
import CLEAN_004 from './universal/CLEAN-004';
import CLEAN_005 from './universal/CLEAN-005';
import CLEAN_008 from './universal/CLEAN-008';
import CLEAN_009 from './universal/CLEAN-009';
import CLEAN_010 from './universal/CLEAN-010';
import CLEAN_011 from './universal/CLEAN-011';
import CLEAN_012 from './universal/CLEAN-012';
import CLEAN_013 from './universal/CLEAN-013';
import CLEAN_014 from './universal/CLEAN-014';
import CLEAN_015 from './universal/CLEAN-015';
import CLEAN_016 from './universal/CLEAN-016';
import HEAD_001 from './universal/HEAD-001';
import HEAD_002 from './universal/HEAD-002';
import HEAD_003 from './universal/HEAD-003';
import HEAD_004 from './universal/HEAD-004';

// OpDiv-specific rules
import STRUCT_001 from './opdiv/STRUCT-001';
import STRUCT_002 from './opdiv/STRUCT-002';
import STRUCT_003 from './opdiv/STRUCT-003';
import STRUCT_004 from './opdiv/STRUCT-004';
import STRUCT_005 from './opdiv/STRUCT-005';
import STRUCT_006 from './opdiv/STRUCT-006';
import STRUCT_007 from './opdiv/STRUCT-007';
import STRUCT_008 from './opdiv/STRUCT-008';
import STRUCT_009 from './opdiv/STRUCT-009';
import STRUCT_010 from './opdiv/STRUCT-010';
import STRUCT_020 from './opdiv/STRUCT-020';
import STRUCT_021 from './opdiv/STRUCT-021';
import STRUCT_022 from './opdiv/STRUCT-022';
import STRUCT_023 from './opdiv/STRUCT-023';
import STRUCT_024 from './opdiv/STRUCT-024';
import STRUCT_025 from './opdiv/STRUCT-025';
import STRUCT_026 from './opdiv/STRUCT-026';
import CLEAN_006 from './opdiv/CLEAN-006';
import CLEAN_007 from './opdiv/CLEAN-007';

/**
 * All rules in execution order.
 * Auto-apply rules are run first (handled by RuleRunner).
 * Within each category, rules are ordered by severity impact.
 */
export const allRules: Rule[] = [
  // Auto-apply rules (run first)
  CLEAN_004,
  CLEAN_005,
  CLEAN_006,
  CLEAN_007,
  CLEAN_008,
  CLEAN_009,
  CLEAN_010,
  CLEAN_011,
  CLEAN_012,
  CLEAN_014,
  CLEAN_015,
  CLEAN_016,
  LINK_007,
  LINK_009,
  FORMAT_002,
  FORMAT_003,

  // Heading rules
  HEAD_001,
  HEAD_002,
  HEAD_003,
  HEAD_004,

  // Metadata rules
  META_001,
  META_002,
  META_003,

  // Link rules
  LINK_001,
  LINK_002,
  LINK_003,
  LINK_004,
  LINK_006,
  LINK_008,

  // Table rules
  TABLE_002,
  TABLE_003,

  // Note rules
  NOTE_001,
  NOTE_004,

  // Image rules
  IMG_001,

  // List rules
  LIST_001,

  // Document readiness warning rules (non-auto-apply)
  CLEAN_013,

  // Structure rules (OpDiv-specific)
  STRUCT_001,
  STRUCT_002,
  STRUCT_003,
  STRUCT_004,
  STRUCT_005,
  STRUCT_006,
  STRUCT_007,
  STRUCT_008,
  STRUCT_009,
  STRUCT_010,
  STRUCT_020,
  STRUCT_021,
  STRUCT_022,
  STRUCT_023,
  STRUCT_024,
  STRUCT_025,
  STRUCT_026,
];

export {
  HEAD_001, HEAD_002, HEAD_003, HEAD_004,
  META_001, META_002, META_003,
  LINK_001, LINK_002, LINK_003, LINK_004, LINK_006, LINK_007, LINK_008, LINK_009,
  TABLE_002, TABLE_003,
  NOTE_001, NOTE_004,
  IMG_001,
  LIST_001,
  FORMAT_002, FORMAT_003,
  CLEAN_004, CLEAN_005, CLEAN_006, CLEAN_007, CLEAN_008, CLEAN_009, CLEAN_010, CLEAN_011, CLEAN_012, CLEAN_013, CLEAN_014, CLEAN_015, CLEAN_016,
  STRUCT_001, STRUCT_002, STRUCT_003, STRUCT_004, STRUCT_005, STRUCT_006,
  STRUCT_007, STRUCT_008, STRUCT_009, STRUCT_010,
  STRUCT_020, STRUCT_021, STRUCT_022, STRUCT_023, STRUCT_024, STRUCT_025, STRUCT_026,
};
