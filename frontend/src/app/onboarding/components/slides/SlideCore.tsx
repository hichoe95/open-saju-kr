'use client';

import { motion } from 'framer-motion';
import DosaCharacter from '../DosaCharacter';
import { textVariants, staggerContainerVariants, staggerItemVariants } from '../../animations/variants';
import styles from '../../page.module.css';

export default function SlideCore() {
  const elements = [
    { char: '木', type: 'wood' },
    { char: '火', type: 'fire' },
    { char: '土', type: 'earth' },
    { char: '金', type: 'metal' },
    { char: '水', type: 'water' },
  ];

  return (
    <div className={styles.slideContainer}>
      <div className={styles.imageWrapper}>
        <DosaCharacter 
          src="/icons/onboarding/dosa_yinyang.png" 
          alt="음양오행 도사"
          floating={true}
        />
        
        <div className={styles.interactiveChart}>
          <motion.div 
            className={styles.elementIcons}
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {elements.map((el, index) => (
              <motion.div
                key={el.type}
                className={`${styles.elementIcon} ${styles[el.type]}`}
                variants={staggerItemVariants}
                custom={index}
              >
                {el.char}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      <div className={styles.content}>
        <motion.h2 
          className={styles.title}
          variants={textVariants}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          사주팔자로<br />타고난 기운을 읽어주마
        </motion.h2>
        <motion.p 
          className={styles.description}
          variants={textVariants}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          연애, 재물, 진로, 건강...<br />
          삶의 모든 것이 여기 있느니라
        </motion.p>
      </div>
    </div>
  );
}
