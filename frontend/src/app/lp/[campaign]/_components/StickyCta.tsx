'use client';

import styles from './StickyCta.module.css';

interface StickyCtaProps {
  visible: boolean;
  primaryCta: string;
  ctaHref: string;
}

export default function StickyCta({ visible, primaryCta, ctaHref }: StickyCtaProps) {
  return (
    <div className={`${styles.stickyBar} ${visible ? styles.visible : ''}`}>
      <a href={ctaHref} className={styles.ctaButton}>
        {primaryCta}
      </a>
    </div>
  );
}
