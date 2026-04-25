import { useState, useEffect, useCallback, startTransition } from 'react';
import { API_BASE_URL } from '@/lib/apiBase';

export function useAuthUrls() {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const retry = useCallback(() => {
    startTransition(() => {
      setIsLoading(true);
      setError(null);
    });
    fetch(`${API_BASE_URL}/api/auth/urls`)
      .then(res => {
        if (!res.ok) throw new Error('인증 URL 로드 실패');
        return res.json();
      })
      .then(data => {
        startTransition(() => {
          setUrls(data);
          setIsLoading(false);
        });
      })
      .catch(() => {
        startTransition(() => {
          setError('로그인 서비스에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
          setIsLoading(false);
        });
      });
  }, []);

  useEffect(() => {
    retry();
  }, [retry]);

  return { urls, isLoading, error, retry };
}
