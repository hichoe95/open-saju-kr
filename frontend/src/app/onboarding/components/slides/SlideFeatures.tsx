'use client';

import { motion } from 'framer-motion';
import { BriefcaseIcon } from '@phosphor-icons/react/dist/csr/Briefcase';
import { CoinsIcon } from '@phosphor-icons/react/dist/csr/Coins';
import { HeartIcon } from '@phosphor-icons/react/dist/csr/Heart';
import { LeafIcon } from '@phosphor-icons/react/dist/csr/Leaf';
import DosaCharacter from '../DosaCharacter';
import { staggerContainerVariants, staggerItemVariants, useAnimationConfig } from '../../animations/variants';
import styles from '../../page.module.css';

export default function SlideFeatures() {
  const { getVariants } = useAnimationConfig();

  const features = [
    { icon: <HeartIcon size={16} weight="fill" />, title: '연애', className: styles.tagLove },
    { icon: <CoinsIcon size={16} weight="fill" />, title: '재물', className: styles.tagMoney },
    { icon: <BriefcaseIcon size={16} weight="fill" />, title: '진로', className: styles.tagCareer },
    { icon: <LeafIcon size={16} weight="fill" />, title: '건강', className: styles.tagHealth },
  ];

  return (
    <motion.div 
      className={styles.slideContainer}
      variants={getVariants(staggerContainerVariants)}
      initial="hidden"
      animate="visible"
    >
      <div className={styles.imageWrapper}>
        <DosaCharacter 
          src="/icons/about/dosa_crystal.png"
          alt="수정구슬 도사"
          floating={true}
        />
      </div>
      
      <div className={styles.interactiveFeatures}>
        <motion.div
          className={styles.featureTags}
          variants={getVariants(staggerContainerVariants)}
          initial="hidden"
          animate="visible"
        >
          {features.map((feature, index) => (
            <motion.span
              key={index}
              className={`${styles.featureTag} ${feature.className}`}
              variants={getVariants(staggerItemVariants)}
            >
              {feature.icon} {feature.title}
            </motion.span>
          ))}
        </motion.div>
      </div>

      <div className={styles.content}>
        <motion.h2 
          className={styles.title}
          variants={getVariants(staggerItemVariants)}
        >
          궁금한 것이 있느냐?<br />
          속 시원히 풀어주마
        </motion.h2>
        <motion.p 
          className={styles.description}
          variants={getVariants(staggerItemVariants)}
        >
          성격표보다 더 깊게,<br />
          지금 흐름을 읽어준다
        </motion.p>
      </div>
    </motion.div>
  );
}
