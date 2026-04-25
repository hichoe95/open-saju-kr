export const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const publicAppName = process.env.NEXT_PUBLIC_APP_NAME || 'My Saju';
export const publicCompanyName = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Open Source Maintainer';
export const publicRepresentativeName = process.env.NEXT_PUBLIC_REPRESENTATIVE_NAME || 'Your Name';
export const publicBusinessNumber = process.env.NEXT_PUBLIC_BUSINESS_NUMBER || '000-00-00000';
export const publicMailOrderNumber = process.env.NEXT_PUBLIC_MAIL_ORDER_NUMBER || '제0000-지역-0000호';
export const publicBusinessAddress = process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || 'Your business address';
export const publicContactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'support@example.com';
export const publicContactPhone = process.env.NEXT_PUBLIC_CONTACT_PHONE || '000-0000-0000';

export const publicBusinessSummary = `${publicCompanyName} · 대표 ${publicRepresentativeName} · 사업자번호 ${publicBusinessNumber}`;
export const publicContactSummary = `${publicBusinessAddress} · ${publicContactPhone}`;
