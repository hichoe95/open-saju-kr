'use client';

import type { TrustConfig } from '../../types';
import styles from './TrustSection.module.css';

interface TrustSectionProps {
  trust: TrustConfig;
}

export default function TrustSection({ trust }: TrustSectionProps) {
  return (
    <section className={styles.section}>
      {/* Headline */}
      <h2 className={styles.headline}>{trust.headline}</h2>
      
      {/* Trust bullets */}
      <div className={styles.bullets}>
        {trust.bullets.map((bullet, index) => (
          <div key={index} className={styles.bullet}>
            {/* Icon badge with number */}
            <div className={styles.iconBadge}>
              <span className={styles.iconNumber}>{String(index + 1).padStart(2, '0')}</span>
            </div>
            
            {/* Bullet content */}
            <div className={styles.bulletContent}>
              <h3 className={styles.bulletTitle}>{bullet.title}</h3>
              <p className={styles.bulletDescription}>{bullet.description}</p>
            </div>
          </div>
        ))}
      </div>
      
      {/* Supporting line */}
      <p className={styles.supportingLine}>{trust.supportingLine}</p>
    </section>
  );
}
