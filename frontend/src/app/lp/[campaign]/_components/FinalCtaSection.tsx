'use client';

import type { FinalCtaConfig } from '../../types';
import styles from './FinalCtaSection.module.css';

interface FinalCtaSectionProps {
  finalCta: FinalCtaConfig;
  primaryCta: string;
  ctaHref: string;
}

export default function FinalCtaSection({ finalCta, primaryCta, ctaHref }: FinalCtaSectionProps) {
  return (
    <section className={styles.section}>
      {/* Headline */}
      <h2 className={styles.headline}>{finalCta.headline}</h2>
      
      {/* Body text */}
      <p className={styles.body}>{finalCta.body}</p>
      
      {/* CTA Button */}
      <a href={ctaHref} className={styles.ctaButton}>
        {primaryCta}
      </a>
      
      {/* Reassurance text */}
      <p className={styles.reassurance}>{finalCta.reassurance}</p>
    </section>
  );
}
