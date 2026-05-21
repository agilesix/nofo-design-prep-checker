import { describe, it, expect } from 'vitest';
import { applyTimeFormatsToText } from '../timeFormat';

// ─── Single-time corrections ──────────────────────────────────────────────────

describe('applyTimeFormatsToText: single-time normalization', () => {
  it('11:59PM ET → 11:59 p.m. ET', () => {
    expect(applyTimeFormatsToText('11:59PM ET')).toBe('11:59 p.m. ET');
  });

  it('11:59 PM ET → 11:59 p.m. ET', () => {
    expect(applyTimeFormatsToText('11:59 PM ET')).toBe('11:59 p.m. ET');
  });

  it('11:59PM ET. (trailing period) → 11:59 p.m. ET.', () => {
    expect(applyTimeFormatsToText('11:59PM ET.')).toBe('11:59 p.m. ET.');
  });

  it('9AM ET → 9 a.m. ET', () => {
    expect(applyTimeFormatsToText('9AM ET')).toBe('9 a.m. ET');
  });

  it('9 AM ET → 9 a.m. ET', () => {
    expect(applyTimeFormatsToText('9 AM ET')).toBe('9 a.m. ET');
  });

  it('at 11:59PM ET. (mid-sentence) → at 11:59 p.m. ET.', () => {
    expect(applyTimeFormatsToText('at 11:59PM ET.')).toBe('at 11:59 p.m. ET.');
  });

  it('date placeholder + time → time still corrected', () => {
    expect(applyTimeFormatsToText('Due on XXX, 2026 at 11:59PM ET.')).toBe(
      'Due on XXX, 2026 at 11:59 p.m. ET.'
    );
  });

  it('parenthetical placeholder + time → time still corrected', () => {
    expect(applyTimeFormatsToText('Due on (insert date) at 11:59PM ET.')).toBe(
      'Due on (insert date) at 11:59 p.m. ET.'
    );
  });
});

// ─── Timezone normalization ───────────────────────────────────────────────────

describe('applyTimeFormatsToText: timezone normalization', () => {
  it('EST → ET after a time', () => {
    expect(applyTimeFormatsToText('11:00 AM EST')).toBe('11 a.m. ET');
  });

  it('EDT → ET after a time', () => {
    expect(applyTimeFormatsToText('3:30 PM EDT')).toBe('3:30 p.m. ET');
  });

  it('already-correct ET is preserved', () => {
    expect(applyTimeFormatsToText('11:59 p.m. ET')).toBe('11:59 p.m. ET');
  });
});

// ─── noon / midnight substitution ────────────────────────────────────────────

describe('applyTimeFormatsToText: noon and midnight', () => {
  it('12:00 PM → noon', () => {
    expect(applyTimeFormatsToText('12:00 PM')).toBe('noon');
  });

  it('12:00 AM → midnight', () => {
    expect(applyTimeFormatsToText('12:00 AM')).toBe('midnight');
  });

  it('12:00 p.m. → noon', () => {
    expect(applyTimeFormatsToText('12:00 p.m.')).toBe('noon');
  });

  it('12:00 a.m. → midnight', () => {
    expect(applyTimeFormatsToText('12:00 a.m.')).toBe('midnight');
  });

  it('12:00 PM ET → noon ET', () => {
    expect(applyTimeFormatsToText('12:00 PM ET')).toBe('noon ET');
  });
});

// ─── :00 removal ─────────────────────────────────────────────────────────────

describe('applyTimeFormatsToText: :00 removal', () => {
  it('8:00 AM → 8 a.m.', () => {
    expect(applyTimeFormatsToText('8:00 AM')).toBe('8 a.m.');
  });

  it('8:00 a.m. → 8 a.m.', () => {
    expect(applyTimeFormatsToText('8:00 a.m.')).toBe('8 a.m.');
  });

  it('3:30 p.m. → 3:30 p.m. (non-zero minutes unchanged)', () => {
    expect(applyTimeFormatsToText('3:30 p.m.')).toBe('3:30 p.m.');
  });
});

// ─── Time range corrections ───────────────────────────────────────────────────

describe('applyTimeFormatsToText: time ranges', () => {
  it('8:00 AM to 5:30 PM ET → 8 a.m. to 5:30 p.m. ET', () => {
    expect(applyTimeFormatsToText('8:00 AM to 5:30 PM ET')).toBe(
      '8 a.m. to 5:30 p.m. ET'
    );
  });

  it('9AM to 11AM ET → 9 to 11 a.m. ET (shared meridiem)', () => {
    expect(applyTimeFormatsToText('9AM to 11AM ET')).toBe('9 to 11 a.m. ET');
  });

  it('8:00 AM to 12:00 PM ET → 8 a.m. to noon ET', () => {
    expect(applyTimeFormatsToText('8:00 AM to 12:00 PM ET')).toBe(
      '8 a.m. to noon ET'
    );
  });

  it('8:30 a.m.–9:30 a.m. ET → 8:30 to 9:30 a.m. ET (en-dash, correct forms)', () => {
    expect(applyTimeFormatsToText('8:30 a.m.–9:30 a.m. ET')).toBe(
      '8:30 to 9:30 a.m. ET'
    );
  });

  it('9 a.m. to 11 a.m. ET → 9 to 11 a.m. ET (correct forms, redundant first meridiem)', () => {
    expect(applyTimeFormatsToText('9 a.m. to 11 a.m. ET')).toBe(
      '9 to 11 a.m. ET'
    );
  });

  it('8:00 AM to 5:30 PM (no TZ) → 8 a.m. to 5:30 p.m.', () => {
    expect(applyTimeFormatsToText('8:00 AM to 5:30 PM')).toBe(
      '8 a.m. to 5:30 p.m.'
    );
  });

  it('9AM to 11AM (no TZ) → 9 to 11 a.m.', () => {
    expect(applyTimeFormatsToText('9AM to 11AM')).toBe('9 to 11 a.m.');
  });

  it('range with hyphen instead of en-dash', () => {
    expect(applyTimeFormatsToText('8:30 a.m.-9:30 a.m. ET')).toBe(
      '8:30 to 9:30 a.m. ET'
    );
  });
});

// ─── Already-correct forms are unchanged ─────────────────────────────────────

describe('applyTimeFormatsToText: no-ops', () => {
  it('already-correct single time is unchanged', () => {
    expect(applyTimeFormatsToText('3:30 p.m. ET')).toBe('3:30 p.m. ET');
  });

  it('already-correct range with different meridiem is unchanged', () => {
    expect(applyTimeFormatsToText('8 a.m. to 5:30 p.m. ET')).toBe(
      '8 a.m. to 5:30 p.m. ET'
    );
  });

  it('already-correct noon is unchanged', () => {
    expect(applyTimeFormatsToText('noon ET')).toBe('noon ET');
  });

  it('text without times is unchanged', () => {
    expect(applyTimeFormatsToText('No time references here.')).toBe(
      'No time references here.'
    );
  });
});
