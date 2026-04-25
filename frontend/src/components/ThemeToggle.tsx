'use client';

import { useState, useEffect, useCallback, startTransition } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import styles from './ThemeToggle.module.css';

type Theme = 'light' | 'dark' | 'system';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  // 실제 적용되는 테마 계산
  const getResolvedTheme = useCallback((themeValue: Theme): 'light' | 'dark' => {
    if (themeValue === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return themeValue;
  }, []);

  // 테마 적용
  const applyTheme = useCallback((themeValue: Theme) => {
    const resolved = getResolvedTheme(themeValue);
    document.documentElement.setAttribute('data-theme', resolved);
  }, [getResolvedTheme]);

  // 초기 로드
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    const initialTheme = savedTheme || 'system';
    startTransition(() => {
      setTheme(initialTheme);
      setMounted(true);
    });
    applyTheme(initialTheme);
  }, [applyTheme]);

  // 시스템 테마 변경 감지
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme]);

  // 테마 토글
  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);
  };

  // SSR 깜빡임 방지
  if (!mounted) {
    return (
      <button className={styles.toggle} aria-label="테마 변경">
        <div className={styles.iconPlaceholder} />
      </button>
    );
  }

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? '라이트 모드' : theme === 'dark' ? '다크 모드' : '시스템 설정';

  return (
    <button
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={`현재 ${label}, 클릭하여 테마 변경`}
      title={label}
    >
      <Icon size={20} className={styles.icon} />
    </button>
  );
}

// 마이페이지용 확장 버전
export function ThemeSelector() {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  const getResolvedTheme = useCallback((themeValue: Theme): 'light' | 'dark' => {
    if (themeValue === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return themeValue;
  }, []);

  const applyTheme = useCallback((themeValue: Theme) => {
    const resolved = getResolvedTheme(themeValue);
    document.documentElement.setAttribute('data-theme', resolved);
  }, [getResolvedTheme]);

   useEffect(() => {
     const savedTheme = localStorage.getItem('theme') as Theme | null;
     const initialTheme = savedTheme || 'system';
     startTransition(() => {
       setTheme(initialTheme);
       setMounted(true);
     });
     applyTheme(initialTheme);
   }, [applyTheme]);

  const selectTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  if (!mounted) {
    return <div className={styles.selectorPlaceholder} />;
  }

  return (
    <div className={styles.selector}>
      <span className={styles.selectorLabel}>화면 테마</span>
      <div className={styles.selectorOptions}>
        <button
          className={`${styles.selectorOption} ${theme === 'light' ? styles.selectorActive : ''}`}
          onClick={() => selectTheme('light')}
        >
          <Sun size={16} />
          <span>라이트</span>
        </button>
        <button
          className={`${styles.selectorOption} ${theme === 'dark' ? styles.selectorActive : ''}`}
          onClick={() => selectTheme('dark')}
        >
          <Moon size={16} />
          <span>다크</span>
        </button>
        <button
          className={`${styles.selectorOption} ${theme === 'system' ? styles.selectorActive : ''}`}
          onClick={() => selectTheme('system')}
        >
          <Monitor size={16} />
          <span>시스템</span>
        </button>
      </div>
    </div>
  );
}
