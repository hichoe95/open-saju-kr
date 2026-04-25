'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { 
  dosaLeftVariants, 
  dosaRightVariants, 
  heartBurstVariants,
  staggerContainerVariants,
  useAnimationConfig 
} from '../../animations/variants';
import styles from '../../page.module.css';

export default function SlideCompatibility() {
  const { shouldReduceMotion } = useAnimationConfig();

  const HeartIcon = () => (
    <Image
      src="/icons/onboarding/heart_saju_cutout.png"
      alt="Heart"
      width={28}
      height={28}
      style={{ objectFit: 'contain' }}
      priority
    />
  );

  return (
    <motion.div 
      className={styles.slideContainer}
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
    >
      <div 
        className={styles.compatibilityContainer}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          height: '220px',
          width: '100%',
          position: 'relative',
          marginBottom: '20px'
        }}
      >
        <motion.div
          variants={dosaLeftVariants}
          style={{
            position: 'relative',
            width: '120px',
            height: '160px',
            zIndex: 1
          }}
        >
          <Image
            src="/icons/onboarding/dosa_female_cutout.png"
            alt="Dosa Female"
            fill
            style={{ objectFit: 'contain' }}
            priority
          />
        </motion.div>

        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2,
          display: 'flex',
          gap: '4px',
          marginTop: '-10px'
        }}>
          {(shouldReduceMotion ? [0] : [0, 1, 2]).map((i) => (
            <motion.div
              key={i}
              variants={heartBurstVariants}
              custom={i}
              style={{ width: '28px', height: '28px' }}
            >
              <HeartIcon />
            </motion.div>
          ))}
        </div>

        <motion.div
          variants={dosaRightVariants}
          style={{
            position: 'relative',
            width: '120px',
            height: '160px',
            zIndex: 1
          }}
        >
          <Image
            src="/icons/onboarding/dosa_male_cutout.png"
            alt="Dosa Male"
            fill
            style={{ objectFit: 'contain' }}
            priority
          />
        </motion.div>
      </div>

      <div className={styles.content}>
        <h2 className={styles.title}>궁합이 궁금하다고?<br />어디 한번 보자꾸나</h2>
        <p className={styles.description}>
          연인, 친구, 그 사람...<br />
          인연의 깊이를 가늠해주마
        </p>
      </div>
    </motion.div>
  );
}
