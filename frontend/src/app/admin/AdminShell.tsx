'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard,
    Settings,
    Users,
    MessageSquare,
    CreditCard,
    LogOut,
    Menu,
    X,
    Shield,
    BarChart3,
    TrendingUp,
    FileText,
    Activity,
    ClipboardList,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { checkAdminStatus } from '@/lib/adminApi';
import { ToastProvider } from '@/components/admin/Toast';
import styles from './layout.module.css';

interface NavItem {
    href: string;
    label: string;
    icon: React.ReactNode;
}

const navItems: NavItem[] = [
    { href: '/admin', label: '대시보드', icon: <LayoutDashboard size={20} /> },
    { href: '/admin/analytics', label: '분석 통계', icon: <BarChart3 size={20} /> },
    { href: '/admin/tracking-report', label: '추적 리포트', icon: <ClipboardList size={20} /> },
    { href: '/admin/stats', label: '바이럴 통계', icon: <TrendingUp size={20} /> },
    { href: '/admin/config', label: '설정', icon: <Settings size={20} /> },
    { href: '/admin/audit', label: '감사 로그', icon: <FileText size={20} /> },
    { href: '/admin/activity', label: '활동 로그', icon: <Activity size={20} /> },
    { href: '/admin/users', label: '사용자', icon: <Users size={20} /> },
    { href: '/admin/feedbacks', label: '피드백', icon: <MessageSquare size={20} /> },
    { href: '/admin/payments', label: '결제', icon: <CreditCard size={20} /> },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, isLoading: isAuthLoading, logout } = useAuth();
    const userId = user?.user_id;
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function verifyAdmin() {
            if (isAuthLoading) return;

            setIsAdmin(null);

            if (!userId) {
                if (!cancelled) {
                    setIsAdmin(false);
                }
                router.push('/onboarding');
                return;
            }

            try {
                const result = await checkAdminStatus();
                if (cancelled) return;
                if (!result.is_admin) {
                    setIsAdmin(false);
                    router.push('/');
                    return;
                }
                setIsAdmin(true);
            } catch {
                if (!cancelled) {
                    setIsAdmin(false);
                }
                router.push('/');
            }
        }

        verifyAdmin();
        return () => {
            cancelled = true;
        };
    }, [userId, isAuthLoading, router]);

    const handleLogout = () => {
        logout();
        router.push('/onboarding');
    };

    // 로딩 중이거나 권한 확인 전
    if (isAuthLoading || isAdmin === null) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinner} />
                <p>권한 확인 중...</p>
            </div>
        );
    }

    // 관리자가 아니면 렌더링하지 않음
    if (!isAdmin) {
        return null;
    }

    return (
        <div className={styles.layout} data-testid="admin-layout">
            {/* Mobile Header */}
            <header className={styles.mobileHeader}>
                <button
                    type="button"
                    className={styles.menuToggle}
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
                >
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
                <div className={styles.mobileTitle}>
                    <Shield size={20} />
                    <span>Admin</span>
                </div>
            </header>

            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.logo}>
                        <Shield size={28} />
                        <span>마이사주 Admin</span>
                    </div>
                </div>

                <nav className={styles.nav}>
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navItem} ${
                                pathname === item.href ? styles.navItemActive : ''
                            }`}
                            onClick={() => setIsMobileMenuOpen(false)}
                            data-testid={`admin-nav-${item.href.replace('/admin', '').replace('/', '') || 'dashboard'}`}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className={styles.sidebarFooter}>
                    <div className={styles.userInfo}>
                        <div className={styles.userAvatar}>
                            {user?.name?.charAt(0) || 'A'}
                        </div>
                        <div className={styles.userDetails}>
                            <span className={styles.userName}>{user?.name || '관리자'}</span>
                            <span className={styles.userRole}>Administrator</span>
                        </div>
                    </div>
                    <button type="button" className={styles.logoutButton} onClick={handleLogout}>
                        <LogOut size={18} />
                        <span>로그아웃</span>
                    </button>
                </div>
            </aside>

            {/* Mobile Overlay */}
            {isMobileMenuOpen && (
                <button
                    type="button"
                    className={styles.overlay}
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-label="모바일 메뉴 닫기"
                />
            )}

            {/* Main Content */}
            <main className={styles.main}>
                <ToastProvider>
                    {children}
                </ToastProvider>
            </main>
        </div>
    );
}
