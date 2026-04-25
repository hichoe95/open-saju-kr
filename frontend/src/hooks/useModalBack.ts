'use client';

import { useEffect, useCallback, useRef } from 'react';

/**
 * 모달에 하드웨어 뒤로가기 버튼 지원을 추가하는 훅
 *
 * @param isOpen - 모달 열림 상태
 * @param onClose - 모달 닫기 함수
 */
export function useModalBack(isOpen: boolean, onClose: () => void) {
  const hasAddedHistoryRef = useRef(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      hasAddedHistoryRef.current = false;
      return;
    }

    // 히스토리에 모달 상태 추가
    if (!hasAddedHistoryRef.current) {
      window.history.pushState({ modal: true, timestamp: Date.now() }, '');
      hasAddedHistoryRef.current = true;
    }

    const handlePopState = () => {
      // 모달이 열려있을 때만 처리
      if (isOpen) {
        handleClose();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, handleClose]);

  // 모달이 닫힐 때 히스토리 정리
  useEffect(() => {
    if (!isOpen && hasAddedHistoryRef.current) {
      // 이미 뒤로가기로 닫혔을 수 있으므로 체크
      if (window.history.state?.modal) {
        window.history.back();
      }
      hasAddedHistoryRef.current = false;
    }
  }, [isOpen]);
}

/**
 * Esc 키로 모달 닫기를 지원하는 훅
 *
 * @param isOpen - 모달 열림 상태
 * @param onClose - 모달 닫기 함수
 */
export function useEscapeClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}

/**
 * 모달 뒤로가기 + Esc 키 지원을 함께 제공하는 훅
 *
 * @param isOpen - 모달 열림 상태
 * @param onClose - 모달 닫기 함수
 */
export function useModalClose(isOpen: boolean, onClose: () => void) {
  useModalBack(isOpen, onClose);
  useEscapeClose(isOpen, onClose);
}

export default useModalBack;
