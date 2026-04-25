// Service Worker for 사주포춘 PWA
// Push Notifications + Offline Support

const CACHE_NAME = 'saju-fortune-v1';

// 캐시할 정적 리소스
const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

// Install 이벤트 - 캐시 초기화
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate 이벤트 - 이전 캐시 정리
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch 이벤트 - 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', (event) => {
    // API 요청은 캐시하지 않음
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 성공 시 캐시에 저장
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // 오프라인이면 캐시에서 반환
                return caches.match(event.request);
            })
    );
});

// Push 이벤트 - 푸시 알림 수신
self.addEventListener('push', (event) => {
    console.log('[SW] Push received:', event);

    let data = {
        title: '사주포춘',
        body: '새로운 알림이 있습니다.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: {},
    };

    if (event.data) {
        try {
            const payload = event.data.json();
            data = {
                title: payload.title || data.title,
                body: payload.body || data.body,
                icon: data.icon,
                badge: data.badge,
                data: payload.data || {},
            };
        } catch (e) {
            console.error('[SW] Push data parse error:', e);
        }
    }

    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        vibrate: [100, 50, 100],
        data: data.data,
        actions: [
            { action: 'open', title: '확인하기' },
            { action: 'close', title: '닫기' },
        ],
        requireInteraction: true,
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// 알림 클릭 이벤트
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action);
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    // 앱 열기
    const urlToOpen = event.notification.data?.job_id
        ? `/?job=${event.notification.data.job_id}`
        : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // 이미 열린 창이 있으면 포커스
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // 없으면 새 창 열기
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
