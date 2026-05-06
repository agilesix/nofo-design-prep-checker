import { describe, it, expect } from 'vitest';
import { slugifyHeading } from '../anchorUtils';

describe('slugifyHeading', () => {
  it('replaces spaces with underscores', () => {
    expect(slugifyHeading('Maintenance of Effort')).toBe('Maintenance_of_Effort');
  });

  it('replaces a colon and adjacent space with a single underscore', () => {
    expect(slugifyHeading('Attachment 1: Accreditation documentation')).toBe(
      'Attachment_1_Accreditation_documentation'
    );
  });

  it('replaces slash and colon in the same heading', () => {
    expect(slugifyHeading('Step 3/4: Overview')).toBe('Step_3_4_Overview');
  });

  it('collapses consecutive special characters into a single underscore', () => {
    // Two colons produce two underscores that must be collapsed
    expect(slugifyHeading('A::B')).toBe('A_B');
  });

  it('strips leading underscores produced by a leading special character', () => {
    expect(slugifyHeading(':Leading colon')).toBe('Leading_colon');
  });

  it('strips trailing underscores produced by a trailing special character', () => {
    expect(slugifyHeading('Trailing colon:')).toBe('Trailing_colon');
  });

  it('trims leading and trailing whitespace before slugifying', () => {
    expect(slugifyHeading('  hello world  ')).toBe('hello_world');
  });

  it('collapses a run of multiple spaces into a single underscore', () => {
    expect(slugifyHeading('a  b')).toBe('a_b');
  });

  it('replaces parentheses with underscores and collapses them', () => {
    expect(slugifyHeading('Section (A)')).toBe('Section_A');
  });
});
