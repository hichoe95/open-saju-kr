/** Campaign-driven landing page type definitions */

export interface CampaignMetadata {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
}

export interface HeroConfig {
  /** Top badge label (e.g. "2026 LOVE FORTUNE") */
  badge: string;
  /** Eyebrow text above headline */
  eyebrow: string;
  /** Primary headline — MUST match ad creative exactly */
  headline: string;
  /** Supporting subhead */
  subhead: string;
  /** Additional context line below subhead */
  supportingLine: string;
  /** Hero character image path (relative to /public) */
  characterImage: string;
  /** Alt text for character image */
  characterAlt: string;
}

export interface StoryTeaserConfig {
  /** Section label (small caps above headline) */
  label: string;
  /** Section headline */
  headline: string;
  /** Body paragraph */
  body: string;
  /** Micro-CTA text */
  microCta: string;
}

export interface HowItWorksStep {
  /** Step number (1-based) */
  number: number;
  /** Step label */
  label: string;
  /** Step description */
  description: string;
}

export interface HowItWorksConfig {
  /** Section headline */
  headline: string;
  /** Steps */
  steps: [HowItWorksStep, HowItWorksStep, HowItWorksStep];
  /** Supporting line below steps */
  supportingLine: string;
}

export interface PreviewCard {
  /** Card title */
  title: string;
  /** Card description */
  description: string;
  /** Accent color CSS variable (e.g. "--color-fire") */
  accentVar: string;
}

export interface PreviewCardsConfig {
  /** Section headline */
  headline: string;
  /** Section body text */
  body: string;
  /** Preview cards (2-4) */
  cards: PreviewCard[];
  /** CTA text below cards */
  ctaText: string;
}

export interface TrustBullet {
  /** Bullet title */
  title: string;
  /** Bullet description */
  description: string;
}

export interface TrustConfig {
  /** Section headline */
  headline: string;
  /** Trust proof bullets (exactly 3) */
  bullets: [TrustBullet, TrustBullet, TrustBullet];
  /** Supporting line */
  supportingLine: string;
}

export interface PersonaConfig {
  /** Section headline */
  headline: string;
  /** Body text */
  body: string;
  /** Persona quote (attributed to the dosa) */
  quote: string;
  /** Persona image path */
  personaImage: string;
  /** Persona image alt text */
  personaAlt: string;
}

export interface FinalCtaConfig {
  /** Final headline */
  headline: string;
  /** Final body */
  body: string;
  /** Reassurance text below CTA */
  reassurance: string;
}

export interface CampaignConfig {
  /** URL slug — must match route param */
  slug: string;
  /** OG / SEO metadata */
  metadata: CampaignMetadata;
  /** Primary CTA text — used in hero, sticky, and final CTA */
  primaryCta: string;
  /** CTA destination URL (with attribution params) */
  ctaHref: string;
  /** Section content */
  hero: HeroConfig;
  storyTeaser: StoryTeaserConfig;
  howItWorks: HowItWorksConfig;
  previewCards: PreviewCardsConfig;
  trust: TrustConfig;
  persona: PersonaConfig;
  finalCta: FinalCtaConfig;
  /** Footer disclaimer */
  disclaimer: string;
}
