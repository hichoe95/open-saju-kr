import styles from './loading.module.css';
import Spinner from '@/components/ui/Spinner';

export default function Loading() {
  return (
    <div className={styles.container}>
      <Spinner size="lg" />
    </div>
  );
}
