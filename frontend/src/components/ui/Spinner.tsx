import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div 
      className={`${styles.spinner} ${styles[size]} ${className || ''}`}
      role="status"
      aria-label="로딩 중"
    >
      <span className={styles.srOnly}>로딩 중...</span>
    </div>
  );
}
