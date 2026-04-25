'use client';

declare global {
  interface Window {
    Kakao?: {
      init: (appKey: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (options: KakaoShareOptions) => void;
      };
    };
  }
}

export interface KakaoShareOptions {
  objectType: 'feed';
  content: {
    title: string;
    description: string;
    imageUrl: string;
    link: { webUrl: string; mobileWebUrl: string };
  };
  buttons?: Array<{
    title: string;
    link: { webUrl: string; mobileWebUrl: string };
  }>;
}

interface ShareWithFallbackOptions {
  title: string;
  description: string;
  imageUrl: string;
  shareUrl: string;
}

function getKakao(): Window['Kakao'] | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.Kakao;
}

function getNavigator(): (Navigator & {
  share?: (data?: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
}) | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  return navigator;
}

export function initKakao(): boolean {
  const kakao = getKakao();
  if (!kakao) {
    return false;
  }

  if (kakao.isInitialized()) {
    return true;
  }

  const appKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? '';
  if (!appKey) {
    return false;
  }

  try {
    kakao.init(appKey);
    return kakao.isInitialized();
  } catch {
    return false;
  }
}

export function isKakaoAvailable(): boolean {
  const kakao = getKakao();
  return Boolean(kakao && kakao.isInitialized());
}

export function shareViaKakao({
  title,
  description,
  imageUrl,
  shareUrl,
}: ShareWithFallbackOptions): boolean {
  const kakao = getKakao();

  if (!kakao && !initKakao()) {
    return false;
  }

  const initializedKakao = getKakao();
  if (!initializedKakao || !initializedKakao.isInitialized()) {
    return false;
  }

  try {
    initializedKakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title,
        description,
        imageUrl,
        link: {
          webUrl: shareUrl,
          mobileWebUrl: shareUrl,
        },
      },
      buttons: [
        {
          title: '자세히 보기',
          link: {
            webUrl: shareUrl,
            mobileWebUrl: shareUrl,
          },
        },
      ],
    });

    return true;
  } catch {
    return false;
  }
}

async function shareViaWebShare({ title, description, shareUrl }: ShareWithFallbackOptions): Promise<boolean> {
  const webNavigator = getNavigator();
  if (!webNavigator || typeof webNavigator.share !== 'function') {
    return false;
  }

  const shareData: ShareData = {
    title,
    text: description,
    url: shareUrl,
  };

  if (typeof webNavigator.canShare === 'function' && !webNavigator.canShare(shareData)) {
    return false;
  }

  try {
    await webNavigator.share(shareData);
    return true;
  } catch {
    return false;
  }
}

async function copyToClipboard(shareUrl: string): Promise<boolean> {
  const webNavigator = getNavigator();
  if (!webNavigator?.clipboard?.writeText) {
    return false;
  }

  try {
    await webNavigator.clipboard.writeText(shareUrl);
    return true;
  } catch {
    return false;
  }
}

export async function shareWithFallback(options: ShareWithFallbackOptions): Promise<'kakao' | 'webshare' | 'clipboard' | 'failed'> {
  if (shareViaKakao(options)) {
    return 'kakao';
  }

  if (await shareViaWebShare(options)) {
    return 'webshare';
  }

  if (await copyToClipboard(options.shareUrl)) {
    return 'clipboard';
  }

  return 'failed';
}
