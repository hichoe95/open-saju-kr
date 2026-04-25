'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './page.module.css';
import type { CampaignConfig } from '../types';
import HeroSection from './_components/HeroSection';
import StoryTeaserSection from './_components/StoryTeaserSection';
import HowItWorksSection from './_components/HowItWorksSection';
import PreviewCardsSection from './_components/PreviewCardsSection';
import TrustSection from './_components/TrustSection';
import PersonaSection from './_components/PersonaSection';
import FinalCtaSection from './_components/FinalCtaSection';
import StickyCta from './_components/StickyCta';

interface LandingPageClientProps {
  config: CampaignConfig;
}

export default function LandingPageClient({ config }: LandingPageClientProps) {
  const [showStickyCta, setShowStickyCta] = useState(false);
  
  // Refs for scroll-triggered animations
  const storyTeaserRef = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const previewCardsRef = useRef<HTMLDivElement>(null);
  const trustRef = useRef<HTMLDivElement>(null);
  const personaRef = useRef<HTMLDivElement>(null);
  const finalCtaRef = useRef<HTMLDivElement>(null);
  
  // Track visibility state for each section
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());

  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    const threshold = window.innerHeight * 0.75;
    setShowStickyCta(scrollY > threshold);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);
  
  // Intersection Observer for scroll-triggered animations
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };
    
    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute('data-section-id');
          if (sectionId) {
            setVisibleSections((prev) => new Set(prev).add(sectionId));
          }
        }
      });
    };
    
    const observer = new IntersectionObserver(observerCallback, observerOptions);
    
    // Observe all section refs
    const refs = [
      { ref: storyTeaserRef, id: 'storyTeaser' },
      { ref: howItWorksRef, id: 'howItWorks' },
      { ref: previewCardsRef, id: 'previewCards' },
      { ref: trustRef, id: 'trust' },
      { ref: personaRef, id: 'persona' },
      { ref: finalCtaRef, id: 'finalCta' }
    ];
    
    refs.forEach(({ ref, id }) => {
      if (ref.current) {
        ref.current.setAttribute('data-section-id', id);
        observer.observe(ref.current);
      }
    });
    
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <HeroSection
          hero={config.hero}
          primaryCta={config.primaryCta}
          ctaHref={config.ctaHref}
        />

        <div
          ref={storyTeaserRef}
          className={styles.sectionWrapper}
          data-visible={visibleSections.has('storyTeaser')}
        >
          <StoryTeaserSection
            storyTeaser={config.storyTeaser}
            ctaHref={config.ctaHref}
          />
        </div>

        <div
          ref={howItWorksRef}
          className={styles.sectionWrapper}
          data-visible={visibleSections.has('howItWorks')}
        >
          <HowItWorksSection howItWorks={config.howItWorks} />
        </div>

        <div
          ref={previewCardsRef}
          className={styles.sectionWrapper}
          data-visible={visibleSections.has('previewCards')}
        >
          <PreviewCardsSection
            previewCards={config.previewCards}
            ctaHref={config.ctaHref}
          />
        </div>

        <div
          ref={trustRef}
          className={styles.sectionWrapper}
          data-visible={visibleSections.has('trust')}
        >
          <TrustSection trust={config.trust} />
        </div>

        <div
          ref={personaRef}
          className={styles.sectionWrapper}
          data-visible={visibleSections.has('persona')}
        >
          <PersonaSection persona={config.persona} />
        </div>

        <div
          ref={finalCtaRef}
          className={styles.sectionWrapper}
          data-visible={visibleSections.has('finalCta')}
        >
          <FinalCtaSection
            finalCta={config.finalCta}
            primaryCta={config.primaryCta}
            ctaHref={config.ctaHref}
          />
        </div>
        <footer className={styles.footer}>
          <p className={styles.disclaimer}>{config.disclaimer}</p>
          <div className={styles.footerLinks}>
            <a href="/privacy" className={styles.footerLink}>개인정보처리방침</a>
            <span className={styles.footerDivider}>|</span>
            <a href="/terms" className={styles.footerLink}>이용약관</a>
          </div>
        </footer>
      </div>

      <StickyCta
        visible={showStickyCta}
        primaryCta={config.primaryCta}
        ctaHref={config.ctaHref}
      />
    </div>
  );
}
