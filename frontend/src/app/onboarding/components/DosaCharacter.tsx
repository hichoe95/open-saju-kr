'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { dosaVariants, dosaFloatVariants, useAnimationConfig } from '../animations/variants';

interface DosaCharacterProps {
  src: string;
  alt: string;
  size?: number;
  floating?: boolean;
  className?: string;
}

export default function DosaCharacter({
  src,
  alt,
  size = 200,
  floating = true,
  className = '',
}: DosaCharacterProps) {
  const { shouldReduceMotion, getVariants } = useAnimationConfig();

  return (
    <motion.div
      className={className}
      variants={getVariants(dosaVariants)}
      initial="hidden"
      animate={floating && !shouldReduceMotion ? ['visible', 'float'] : 'visible'}
      whileTap={shouldReduceMotion ? undefined : 'tap'}
      whileHover={shouldReduceMotion ? undefined : 'hover'}
      style={{ cursor: 'pointer' }}
    >
      <motion.div
        variants={floating && !shouldReduceMotion ? dosaFloatVariants : undefined}
        animate={floating && !shouldReduceMotion ? 'float' : undefined}
      >
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          priority
          style={{ 
            objectFit: 'contain',
            filter: 'drop-shadow(0 20px 40px rgba(124, 58, 237, 0.15))',
          }}
        />
      </motion.div>
    </motion.div>
  );
}
