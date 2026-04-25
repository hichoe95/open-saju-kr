'use client';

import type { PreviewCardsConfig } from '../../types';
import styles from './PreviewCardsSection.module.css';

interface PreviewCardsSectionProps {
  previewCards: PreviewCardsConfig;
  ctaHref: string;
}

export default function PreviewCardsSection({ previewCards, ctaHref }: PreviewCardsSectionProps) {
  return (
    <section className={styles.section}>
      {/* Headline */}
      <h2 className={styles.headline}>{previewCards.headline}</h2>
      
      {/* Body text */}
      <p className={styles.body}>{previewCards.body}</p>
      
      {/* Glass cards */}
      <div className={styles.cards}>
        {previewCards.cards.map((card, index) => (
          <div 
            key={index} 
            className={styles.card}
            style={{ '--accent-color': `var(${card.accentVar})` } as React.CSSProperties}
          >
            {/* Left accent strip */}
            <div className={styles.accentStrip} />
            
            {/* Card content */}
            <h3 className={styles.cardTitle}>{card.title}</h3>
            <p className={styles.cardDescription}>{card.description}</p>
          </div>
        ))}
      </div>
      
      {/* CTA Button */}
      <a href={ctaHref} className={styles.ctaButton}>
        {previewCards.ctaText}
      </a>
    </section>
  );
}
