'use client';

import type { HowItWorksConfig } from '../../types';
import styles from './HowItWorksSection.module.css';

interface HowItWorksSectionProps {
  howItWorks: HowItWorksConfig;
}

export default function HowItWorksSection({ howItWorks }: HowItWorksSectionProps) {
  return (
    <section className={styles.section}>
      {/* Headline */}
      <h2 className={styles.headline}>{howItWorks.headline}</h2>
      
      {/* Steps timeline */}
      <div className={styles.timeline}>
        {howItWorks.steps.map((step, index) => (
          <div key={step.number} className={styles.step}>
            {/* Number circle */}
            <div className={styles.stepNumber}>{step.number}</div>
            
            {/* Connecting line - not on last step */}
            {index < howItWorks.steps.length - 1 && (
              <div className={styles.connector} />
            )}
            
            {/* Step content */}
            <div className={styles.stepContent}>
              <h3 className={styles.stepLabel}>{step.label}</h3>
              <p className={styles.stepDescription}>{step.description}</p>
            </div>
          </div>
        ))}
      </div>
      
      {/* Supporting line */}
      <p className={styles.supportingLine}>{howItWorks.supportingLine}</p>
    </section>
  );
}
