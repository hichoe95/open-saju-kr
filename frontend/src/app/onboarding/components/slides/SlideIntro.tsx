'use client';

import { motion } from 'framer-motion';
import DosaCharacter from '../DosaCharacter';
import { staggerContainerVariants, staggerItemVariants, useAnimationConfig } from '../../animations/variants';
import styles from '../../page.module.css';

interface SlideIntroProps {
  onGoToLogin?: () => void;
}

export default function SlideIntro({ onGoToLogin }: SlideIntroProps) {
  const { getVariants } = useAnimationConfig();

  return (
    <motion.div 
      className={styles.slideContainer}
      variants={getVariants(staggerContainerVariants)}
      initial="hidden"
      animate="visible"
    >
      <div className={styles.imageWrapper}>
        <DosaCharacter 
          src="/icons/onboarding/dosa_welcome.png"
          alt="AI 도사" 
          size={200} 
          floating={true}
        />
        <div className={styles.interactiveWelcome}>
          <div className={styles.yinyangOrbit}>
            <div className={styles.orbitRing} />
            <div className={styles.orbitDot} />
          </div>
        </div>
      </div>
      
      <motion.div className={styles.content}>
        <motion.h1 
          className={styles.title}
          variants={getVariants(staggerItemVariants)}
        >
          허허, 어서 오거라
        </motion.h1>
        <motion.p 
          className={styles.description}
          variants={getVariants(staggerItemVariants)}
        >
          천 년을 기다렸느니라
        </motion.p>
        {onGoToLogin && (
          <motion.button
            className={styles.loginShortcut}
            variants={getVariants(staggerItemVariants)}
            onClick={onGoToLogin}
          >
            바로 로그인 하러가기 →
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
