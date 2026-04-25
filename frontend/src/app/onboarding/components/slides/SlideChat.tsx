'use client';

import { motion } from 'framer-motion';
import DosaCharacter from '../DosaCharacter';
import { staggerContainerVariants, staggerItemVariants, useAnimationConfig } from '../../animations/variants';
import styles from '../../page.module.css';

export default function SlideChat() {
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
          src="/icons/onboarding/dosa_listening.png"
          alt="경청하는 도사"
          floating={true}
        />
        
        <div className={styles.interactiveChat}>
          <div className={styles.typingIndicator}>
            <div className={styles.typingDot} />
            <div className={styles.typingDot} />
            <div className={styles.typingDot} />
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <motion.h2 
          className={styles.title}
          variants={getVariants(staggerItemVariants)}
        >
          궁금한 것이 있으면<br />무엇이든 물어보거라
        </motion.h2>
        <motion.p 
          className={styles.description}
          variants={getVariants(staggerItemVariants)}
        >
          퇴사각인가? 연애운이 궁금한가?<br />
          내가 직접 답해주리라
        </motion.p>
      </div>
    </motion.div>
  );
}
