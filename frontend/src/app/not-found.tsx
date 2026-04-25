import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>페이지를 찾을 수 없습니다</h2>
      <p className={styles.paragraph}>요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
      <Link href="/" className={styles.link}>
        홈으로 돌아가기
      </Link>
    </div>
  );
}
