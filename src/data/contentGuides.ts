import type { ContentGuideEntry } from '../types';

export const contentGuides: ContentGuideEntry[] = [
  {
    id: 'acf',
    displayName: 'ACF Content Guide',
    opDiv: 'ACF',
    version: 'FY26 Interim, December 2, 2025',
    updatedAt: '2025-12-02',
    detectionSignals: {
      names: ['Administration for Children and Families'],
      abbreviations: ['ACF'],
      contactOffice: 'ACF Office of Grants Policy',
      uniqueSections: [],
    },
  },
  {
    id: 'acl',
    displayName: 'ACL Content Guide',
    opDiv: 'ACL',
    version: 'December 2, 2025',
    updatedAt: '2025-12-02',
    detectionSignals: {
      names: ['Administration for Community Living'],
      abbreviations: ['ACL'],
      uniqueSections: [],
    },
  },
  {
    id: 'cdc',
    displayName: 'CDC Content Guide',
    opDiv: 'CDC',
    subType: 'Standard',
    version: 'September 24, 2025',
    updatedAt: '2025-09-24',
    detectionSignals: {
      names: ['Centers for Disease Control and Prevention'],
      abbreviations: ['CDC'],
      contactOffice: 'CDC Office of Grants Services',
      uniqueSections: [],
    },
  },
  {
    id: 'cdc-research',
    displayName: 'CDC Research Content Guide',
    opDiv: 'CDC',
    subType: 'Research',
    version: 'September 24, 2025',
    updatedAt: '2025-09-24',
    detectionSignals: {
      names: ['Centers for Disease Control and Prevention'],
      abbreviations: ['CDC'],
      contactOffice: 'CDC Office of Grants Services',
      uniqueSections: ['eRA Commons', 'PHS 398', 'principal investigator'],
    },
  },
  {
    id: 'cms',
    displayName: 'CMS Content Guide',
    opDiv: 'CMS',
    version: 'June 10, 2025',
    updatedAt: '2025-06-10',
    detectionSignals: {
      names: ['Centers for Medicare & Medicaid Services', 'Centers for Medicare and Medicaid Services'],
      abbreviations: ['CMS'],
      uniqueSections: [],
    },
  },
  {
    id: 'ihs',
    displayName: 'IHS Content Guide',
    opDiv: 'IHS',
    version: 'July 28, 2025',
    updatedAt: '2025-07-28',
    detectionSignals: {
      names: ['Indian Health Service'],
      abbreviations: ['IHS'],
      uniqueSections: ['Tribal Resolution'],
    },
  },
  {
    id: 'hrsa-bhw',
    displayName: 'HRSA BHW R&R Content Guide',
    opDiv: 'HRSA',
    subType: 'BHW R&R',
    version: 'February 2026',
    updatedAt: '2026-02-01',
    detectionSignals: {
      names: ['Health Resources and Services Administration', 'Bureau of Health Workforce'],
      abbreviations: ['HRSA', 'BHW'],
      uniqueSections: ['Before You Begin', 'Trainee eligibility'],
    },
  },
  {
    id: 'hrsa-bphc',
    displayName: 'HRSA BPHC Content Guide',
    opDiv: 'HRSA',
    subType: 'BPHC',
    version: 'January 2026',
    updatedAt: '2026-01-01',
    detectionSignals: {
      names: ['Health Resources and Services Administration', 'Bureau of Primary Health Care'],
      abbreviations: ['HRSA', 'BPHC'],
      uniqueSections: ['Before You Begin'],
    },
  },
  {
    id: 'hrsa-construction',
    displayName: 'HRSA Construction Content Guide',
    opDiv: 'HRSA',
    subType: 'Construction',
    version: 'February 2026',
    updatedAt: '2026-02-01',
    detectionSignals: {
      names: ['Health Resources and Services Administration'],
      abbreviations: ['HRSA'],
      uniqueSections: ['Before You Begin', 'Project description'],
    },
  },
  {
    id: 'hrsa-mchb',
    displayName: 'HRSA MCHB R&R Content Guide',
    opDiv: 'HRSA',
    subType: 'MCHB R&R',
    version: 'February 2026',
    updatedAt: '2026-02-01',
    detectionSignals: {
      names: ['Health Resources and Services Administration', 'Maternal and Child Health Bureau'],
      abbreviations: ['HRSA', 'MCHB'],
      uniqueSections: ['Before You Begin', 'Trainee eligibility'],
    },
  },
  {
    id: 'hrsa-rr',
    displayName: 'HRSA R&R Content Guide',
    opDiv: 'HRSA',
    subType: 'R&R',
    version: 'February 2026',
    updatedAt: '2026-02-01',
    detectionSignals: {
      names: ['Health Resources and Services Administration'],
      abbreviations: ['HRSA'],
      uniqueSections: ['Before You Begin', 'Trainee eligibility'],
    },
  },
];

export function getContentGuideById(id: string): ContentGuideEntry | undefined {
  return contentGuides.find(g => g.id === id);
}
