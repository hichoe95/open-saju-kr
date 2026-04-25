'use client';

import { motion } from 'framer-motion';
import DosaCharacter from '../DosaCharacter';
import { staggerItemVariants, useAnimationConfig } from '../../animations/variants';
import styles from '../../page.module.css';

export default function SlideTimeline() {
  const { shouldReduceMotion } = useAnimationConfig();

  const timelineNodes = [
    { label: '과거', year: '2015' },
    { label: '현재', year: '2025', active: true },
    { label: '미래', year: '2035' },
  ];

  const timelineContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.2,
      },
    },
  };

  return (
    <div className={styles.slideContainer}>
      <div className={styles.imageWrapper}>
        <div className={styles.interactiveFlow}>
          <div className={styles.timeline}>
            <div className={styles.timelineTrack} />

            <motion.div
              className={styles.timelineNodes}
              variants={shouldReduceMotion ? undefined : timelineContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {timelineNodes.map((node) => (
                <motion.div
                  key={node.label}
                  className={`${styles.timelineNode} ${node.active ? styles.timelineNodeActive : ''}`}
                  variants={staggerItemVariants}
                >
                  <div className={`${styles.timelineDot} ${node.active ? styles.active : ''}`} />
                  <div className={styles.timelineLabel}>
                    <div>{node.label}</div>
                    <div className={styles.timelineYear}>({node.year})</div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        <DosaCharacter 
          src="/icons/onboarding/dosa_thinking.png" 
          alt="생각하는 도사" 
        />
      </div>

      <div className={styles.content}>
        <h2 className={styles.title}>10년 대운부터 오늘의 운세까지</h2>
        <p className={styles.description}>
          과거, 현재, 미래...<br />
          인생의 흐름을 꿰뚫어 보리라
        </p>
      </div>
    </div>
  );
}
