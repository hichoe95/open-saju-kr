/**
 * PWA 및 푸시 알림 유틸리티
 */

import { API_BASE_URL } from '@/lib/apiBase';
import { AUTH_MODE, buildClientAuthHeaders } from '@/utils/authToken';

// VAPID 공개키 (백엔드와 동일한 키 쌍 사용)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function getAuthHeaders(token?: string): Record<string, string> {
    if (typeof window === 'undefined') return {};
    if (token) return buildClientAuthHeaders(token);
    if (AUTH_MODE === 'cookie') return {};
    return buildClientAuthHeaders(token);
}

/**
 * iOS인지 확인
 */
export function isIOS(): boolean {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * PWA로 설치되었는지 확인 (홈 화면에서 실행)
 */
export function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;

    // iOS Safari
    if ('standalone' in window.navigator) {
        return (window.navigator as { standalone?: boolean }).standalone === true;
    }

    // Android Chrome
    return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * 푸시 알림이 지원되는지 확인
 */
export function isPushSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * iOS에서 푸시가 가능한지 확인
 * - iOS 16.4+ AND 홈 화면 설치 필요
 */
export function canIOSReceivePush(): boolean {
    if (!isIOS()) return true; // iOS가 아니면 true
    return isStandalone(); // iOS는 standalone이어야 함
}

/**
 * 푸시 알림 권한 요청
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
        throw new Error('이 브라우저는 알림을 지원하지 않습니다.');
    }

    const permission = await Notification.requestPermission();
    return permission;
}

/**
 * Service Worker 등록
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
        console.log('[PWA] Service Worker not supported');
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
        });
        console.log('[PWA] Service Worker registered:', registration.scope);
        return registration;
    } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
        return null;
    }
}

async function persistSubscription(subscription: PushSubscription, token?: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        credentials: AUTH_MODE === 'cookie' ? 'include' : undefined,
        body: JSON.stringify(formatPushSubscription(subscription)),
    });

    if (!response.ok) {
        throw new Error(`Push subscription persistence failed: ${response.status}`);
    }
}

async function persistUnsubscribe(endpoint: string, token?: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/push/unsubscribe`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(token),
        },
        credentials: AUTH_MODE === 'cookie' ? 'include' : undefined,
        body: JSON.stringify({ endpoint }),
    });

    if (!response.ok) {
        throw new Error(`Push unsubscribe persistence failed: ${response.status}`);
    }
}

/**
 * 푸시 구독 가져오기 또는 생성
 */
export async function subscribeToPush(token?: string): Promise<PushSubscription | null> {
    if (!VAPID_PUBLIC_KEY) {
        console.warn('[PUSH] VAPID_PUBLIC_KEY not set');
        return null;
    }

    const registration = await registerServiceWorker();
    if (!registration) return null;

    try {
        // 기존 구독 확인
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            // 없으면 새로 생성
            const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey.buffer as ArrayBuffer,
            });
            console.log('[PUSH] Subscribed:', subscription.endpoint);
        }

        if (subscription) {
            try {
                await persistSubscription(subscription, token);
            } catch (persistError) {
                console.error('[PUSH] Server subscription persistence failed:', persistError);
            }
        }

        return subscription;
    } catch (error) {
        console.error('[PUSH] Subscription failed:', error);
        return null;
    }
}

export async function unsubscribePush(token?: string): Promise<boolean> {
    const registration = await registerServiceWorker();
    if (!registration) return false;

    try {
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            return true;
        }

        const endpoint = subscription.endpoint;
        const unsubscribed = await subscription.unsubscribe();

        try {
            await persistUnsubscribe(endpoint, token);
        } catch (persistError) {
            console.error('[PUSH] Server unsubscribe persistence failed:', persistError);
        }

        return unsubscribed;
    } catch (error) {
        console.error('[PUSH] Unsubscribe failed:', error);
        return false;
    }
}

/**
 * 푸시 구독을 서버 전송 형식으로 변환
 */
export function formatPushSubscription(sub: PushSubscription): {
    endpoint: string;
    keys: { p256dh: string; auth: string };
} {
    const json = sub.toJSON();
    return {
        endpoint: sub.endpoint,
        keys: {
            p256dh: json.keys?.p256dh || '',
            auth: json.keys?.auth || '',
        },
    };
}

/**
 * Base64 URL을 Uint8Array로 변환
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * iOS 홈 화면 추가 안내가 필요한지 확인
 */
/**
 * iOS 홈 화면 추가 안내가 필요한지 확인
 */
export function needsIOSInstallPrompt(): boolean {
    if (!isIOS()) return false;
    if (isStandalone()) return false;

    // 영구 무시 확인 ("다시 보지 않기" 클릭 시)
    if (localStorage.getItem('ios_install_permanent_dismiss')) {
        return false;
    }

    return true;
}

/**
 * iOS 홈 화면 추가 안내 영구 무시 처리
 */
export function dismissIOSPermanent(): void {
    localStorage.setItem('ios_install_permanent_dismiss', 'true');
}

/**
 * (Deprecated) 단순 닫기는 저장하지 않음
 */
export function dismissIOSInstallPrompt(): void {
    // 아무것도 하지 않음 (매번 뜨게 하기 위함)
}
