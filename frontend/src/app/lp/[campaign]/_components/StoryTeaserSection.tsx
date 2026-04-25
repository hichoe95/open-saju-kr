'use client';

import type { StoryTeaserConfig } from '../../types';
import styles from './StoryTeaserSection.module.css';

interface StoryTeaserSectionProps {
  storyTeaser: StoryTeaserConfig;
  ctaHref: string;
}

export default function StoryTeaserSection({ storyTeaser, ctaHref }: StoryTeaserSectionProps) {
  return (
    <section className={styles.section}>
      {/* Section label with accent border */}
      <div className={styles.label}>{storyTeaser.label}</div>
      
      {/* Headline */}
      <h2 className={styles.headline}>{storyTeaser.headline}</h2>
      
      {/* Body text */}
      <p className={styles.body}>{storyTeaser.body}</p>
      
      {/* Micro CTA */}
      <a href={ctaHref} className={styles.microCta}>
        {storyTeaser.microCta}
        <span className={styles.arrow} aria-hidden="true">→</span>
      </a>
    </section>
  );
}
