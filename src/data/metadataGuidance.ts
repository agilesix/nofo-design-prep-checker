export const metadataGuidance = {
  author: {
    format: "Full OpDiv Name (ABBREVIATION)",
    examples: [
      "Administration for Children and Families (ACF)",
      "Health Resources and Services Administration (HRSA)",
      "Administration for Community Living (ACL)",
      "Centers for Medicare & Medicaid Services (CMS)",
      "Centers for Disease Control and Prevention (CDC)",
      "Indian Health Service (IHS)",
    ],
  },
  subject: {
    formula: 'A notice of funding opportunity from the [Agency or OpDiv] [purpose of the NOFO].',
    suggestedLength: "One line, ~25 words or less.",
    notes: [
      "Broad, high-level statement of purpose.",
      "May name the OpDiv only, or both the OpDiv and sub-agency — follow precedent within the OpDiv.",
    ],
    examples: [
      "A notice of funding opportunity from the Maternal and Child Health Bureau that improves care for Hereditary Hemorrhagic Telangiectasia (HHT) by helping clinical centers and developing a patient registry.",
      "A notice of funding opportunity from the Administration for Children and Families on funding states to make improvements to their early childhood systems.",
      "A notice of funding opportunity from the Health Resources and Services Administration to fund technical assistance providers to improve mental health and engagement in care among people with HIV.",
    ],
  },
  tagline: {
    description: "A one-line summary that captures the core purpose of the NOFO.",
    suggestedLength: "~15–20 words.",
    examples: [
      "Supporting rural health research under the Rural Health Research Dissemination Program to inform policy at national, state, and local levels.",
      "Funding states to strengthen early childhood systems and promote parent choice.",
      "Adapting interventions to better serve people with co-occurring HIV and mental health conditions.",
    ],
  },
  keywords: {
    description: "Specific terms or phrases that come directly from the language of the NOFO.",
    suggestedCount: "8–10 keywords",
    separator: "Separate terms with commas.",
    notes: [
      "Address finer-grained details — not high-level category terms.",
      "Choose terms you would type into a search bar to find this specific NOFO.",
      "Some OpDivs prepend standard terms (e.g. HRSA prepends 'Application guide' or 'R&R Application guide').",
    ],
    examples: [
      "Administration for Children and Families, Office of Family Assistance, READY4Life, youth, parenting youth, healthy marriage and relationship education, pregnant youth",
      "Application guide, HRSA HIV/AIDS Bureau, mental health, people with HIV, notice of funding opportunity, HIV and mental health, mental health care",
    ],
  },
} as const;
