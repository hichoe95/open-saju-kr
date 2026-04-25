import type { NextConfig } from "next";

const resolveApiBaseUrl = (): string | null => {
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003';

  try {
    return new URL(rawApiUrl).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

const resolveApiOrigin = (): string | null => {
  const apiBaseUrl = resolveApiBaseUrl();
  if (!apiBaseUrl) {
    return null;
  }

  return new URL(apiBaseUrl).origin;
};

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'http',
        hostname: 'k.kakaocdn.net',
      },
      {
        protocol: 'https',
        hostname: 'k.kakaocdn.net',
      },
      {
        protocol: 'https',
        hostname: 'phinf.pstatic.net',
      },
    ],
  },
  async rewrites() {
    const apiBaseUrl = resolveApiBaseUrl();
    if (!apiBaseUrl) {
      return [];
    }

    return [
      {
        source: '/backend-proxy/:path*',
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
  async headers() {
    const apiOrigin = resolveApiOrigin();
    const connectSrc = [
      "'self'",
      ...(apiOrigin ? [apiOrigin] : []),
      'https://*.tosspayments.com',
      'https://kauth.kakao.com',
      'https://nid.naver.com',
      'https://*.supabase.co',
    ];

    return [
      {
        source: '/(.*)',
           headers: [
             // TODO FRONT-12: CSP nonce 적용 및 nonce 전파 방안 검토 필요
             {
                key: 'X-Frame-Options',
                value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://js.tosspayments.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://k.kakaocdn.net https://phinf.pstatic.net",
              "font-src 'self' data:",
              `connect-src ${connectSrc.join(' ')}`,
              'frame-src https://*.tosspayments.com',
              "object-src 'none'",
              "base-uri 'self'",
              'report-uri /api/csp-report',
            ].join('; '),
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' https://js.tosspayments.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://k.kakaocdn.net https://phinf.pstatic.net",
              "font-src 'self' data:",
              `connect-src ${connectSrc.join(' ')}`,
              'frame-src https://*.tosspayments.com',
              "object-src 'none'",
              "base-uri 'self'",
              'report-uri /api/csp-report',
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
