'use client';

import Image from 'next/image';
import type { HeroConfig } from '../../types';
import styles from './HeroSection.module.css';

interface HeroSectionProps {
  hero: HeroConfig;
  primaryCta: string;
  ctaHref: string;
}

export default function HeroSection({ hero, primaryCta, ctaHref }: HeroSectionProps) {
  return (
    <section className={styles.hero}>
      {/* Badge pill */}
      <div className={styles.badge}>{hero.badge}</div>
      
      {/* Eyebrow */}
      <p className={styles.eyebrow}>{hero.eyebrow}</p>
      
      {/* Headline */}
      <h1 className={styles.headline}>{hero.headline}</h1>
      
      {/* Subhead */}
      <p className={styles.subhead}>{hero.subhead}</p>
      
      {/* Supporting line */}
      <p className={styles.supportingLine}>{hero.supportingLine}</p>
      
      {/* Character image with aura */}
      <div className={styles.characterWrapper}>
        <div className={styles.aura} />
        <Image
          src={hero.characterImage}
          alt={hero.characterAlt}
          width={200}
          height={200}
          className={styles.character}
          priority
        />
      </div>
      
      {/* CTA Button */}
      <a href={ctaHref} className={styles.ctaButton}>
        {primaryCta}
      </a>
      
      {/* Hint text */}
      <p className={styles.hint}>광고에서 본 그 도사가, 당신의 흐름을 읽어드려요</p>
    </section>
  );
}
