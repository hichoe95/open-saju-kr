'use client';

import Image from 'next/image';
import type { PersonaConfig } from '../../types';
import styles from './PersonaSection.module.css';

interface PersonaSectionProps {
  persona: PersonaConfig;
}

export default function PersonaSection({ persona }: PersonaSectionProps) {
  return (
    <section className={styles.section}>
      {/* Headline */}
      <h2 className={styles.headline}>{persona.headline}</h2>
      
      {/* Persona image */}
      <div className={styles.imageWrapper}>
        <Image
          src={persona.personaImage}
          alt={persona.personaAlt}
          width={120}
          height={120}
          className={styles.personaImage}
        />
      </div>
      
      {/* Body text */}
      <p className={styles.body}>{persona.body}</p>
      
      {/* Quote card - glass effect */}
      <div className={styles.quoteCard}>
        <span className={styles.quoteMark} aria-hidden="true">&ldquo;</span>
        <p className={styles.quote}>{persona.quote}</p>
        <span className={styles.quoteMarkEnd} aria-hidden="true">&rdquo;</span>
      </div>
    </section>
  );
}
