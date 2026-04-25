import styles from '../about/content.module.css';
import legalStyles from '../legal.module.css';
import Link from 'next/link';
import { publicCompanyName, publicContactEmail, publicSiteUrl } from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

export const metadata: import('next').Metadata = {
    title: '환불정책',
    description: '사주 리포트 엽전 환불 및 청약철회 정책. 전자상거래법에 따른 환불 기준과 절차를 안내합니다.',
    alternates: {
        canonical: `${siteUrl}/refund`,
    },
};

export default function RefundPage() {
    return (
        <main className={styles.container}>
            <Link href="/" className={styles.backLink}>← 홈으로</Link>
            <article className={styles.article}>
                <h1>환불정책</h1>
                <p>
                    {publicCompanyName}(이하 &quot;회사&quot;)가 운영하는 사주 리포트(이하 &quot;서비스&quot;)의
                    충전형 상품(엽전) 환불 및 청약철회 기준을 안내드립니다.
                </p>

                <section>
                    <h2>1. 법적 근거 및 기본 원칙</h2>
                    <div className={legalStyles.infoBoxTertiary}>
                        <p className={legalStyles.infoLabelAccent}>
                            중요 안내
                        </p>
                        <ul className={legalStyles.infoList}>
                            <li>회사는 전자상거래법 등 관계 법령이 정한 청약철회 및 환불권을 우선 보장합니다.</li>
                            <li>본 정책과 법령이 충돌하는 경우 법령이 우선 적용됩니다.</li>
                            <li>주요 근거: 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조, 제18조, 제35조 및 관련 시행령</li>
                        </ul>
                    </div>
                </section>

                <section>
                    <h2>2. 충전형 상품 안내 (사용 용도 및 결제 사용 경로)</h2>
                    <h3>사용 용도</h3>
                    <ul>
                        <li>사주 재분석</li>
                        <li>AI 도사 상담</li>
                        <li>AI 궁합 분석</li>
                        <li>기운 캘린더 AI 조언</li>
                        <li>기타 서비스 내 고지된 유료 기능</li>
                    </ul>

                    <h3>결제 사용 경로</h3>
                    <ol>
                        <li>충전 페이지에서 결제수단을 선택하여 결제합니다.</li>
                        <li>결제 승인 완료 시 엽전이 계정에 충전됩니다.</li>
                        <li>유료 기능 이용 시 해당 기능 가격만큼 엽전이 차감됩니다.</li>
                    </ol>
                </section>

                <section>
                    <h2>3. 이용기간 및 환불가능기간</h2>
                    <ul>
                        <li><strong>충전된 포인트(엽전)의 이용기간은 결제시점으로부터 1년입니다.</strong></li>
                        <li><strong>환불 신청 가능 기간은 결제시점으로부터 1년 이내입니다.</strong></li>
                        <li>이용기간 경과 시 미사용 엽전은 소멸될 수 있습니다.</li>
                    </ul>
                </section>

                <section>
                    <h2>4. 환불 정책</h2>
                    
                    <h3>환불 가능 사유</h3>
                    <p>다음의 경우 환불이 가능합니다:</p>
                    <table className={legalStyles.table}>
                        <thead>
                            <tr className={legalStyles.headerRow}>
                                <th className={legalStyles.headerCell}>환불 사유</th>
                                <th className={legalStyles.headerCell}>환불 범위</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>결제 오류로 인한 중복/초과 결제</td>
                                <td className={legalStyles.cell}>중복/초과 결제 금액 전액</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>회사 귀책사유로 서비스 이용 불가</td>
                                <td className={legalStyles.cell}>미사용 엽전 해당 금액</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>서비스 전체 종료</td>
                                <td className={legalStyles.cell}>유료 구매 미사용 엽전</td>
                            </tr>
                            <tr>
                                <td className={legalStyles.cell}>법령에 따른 환불 의무 발생</td>
                                <td className={legalStyles.cell}>법령에서 정한 범위</td>
                            </tr>
                        </tbody>
                    </table>
                    <p style={{ marginTop: '12px' }}>
                        엽전은 디지털콘텐츠의 특성상 결제 즉시 사용 가능한 상태로 제공되며,
                        법령상 청약철회 제한 사유에 해당하는 경우 청약철회가 제한될 수 있습니다.
                    </p>
                </section>

                <section>
                    <h2>5. 환불 제외 대상</h2>
                    <ul>
                        <li><strong>이미 사용한 엽전</strong>: 콘텐츠 이용에 사용된 엽전</li>
                        <li><strong>보너스 엽전</strong>: 이벤트, 프로모션 등으로 무료 지급된 엽전</li>
                        <li><strong>법령상 제한 사유 해당</strong>: 전자상거래법 및 관련 법령에 따른 청약철회 제한 요건 충족 시</li>
                    </ul>
                </section>

                <section>
                    <h2>6. 환불 절차</h2>
                    <ol>
                        <li><strong>환불 신청</strong>: 고객센터 이메일({publicContactEmail})로 환불 사유와 함께 신청</li>
                        <li><strong>신청 정보</strong>: 
                            <ul>
                                <li>회원 계정 정보 (가입 이메일 또는 소셜 계정)</li>
                                <li>결제일시 및 결제 금액</li>
                                <li>환불 사유 (증빙자료 첨부 권장)</li>
                            </ul>
                        </li>
                        <li><strong>검토 및 승인</strong>: 영업일 기준 3일 이내 검토 후 결과 안내</li>
                        <li><strong>환불 처리</strong>: 승인 시 영업일 기준 7일 이내 환불 절차 진행</li>
                    </ol>
                </section>

                <section>
                    <h2>7. 환불 방법 및 결제 한도</h2>
                    <ul>
                        <li><strong>환불은 반드시 원결제수단으로 처리</strong>됩니다.</li>
                        <li>카드 결제의 경우 카드사 정책에 따라 승인 취소 또는 환불로 처리될 수 있습니다.</li>
                        <li>카드사 또는 결제사 정책에 따라 결제 가능 금액이 일정 금액 이하로 제한될 수 있습니다.</li>
                    </ul>
                </section>

                <section>
                    <h2>8. 포인트 양도 제한</h2>
                    <ul>
                        <li>충전된 엽전은 사용자 간 양도, 판매, 대여, 상속 기타 일체의 이전이 불가합니다.</li>
                    </ul>
                </section>

                <section>
                    <h2>9. 미성년자 결제</h2>
                    <ul>
                        <li>미성년자의 결제는 법정대리인의 동의가 필요합니다.</li>
                        <li>법정대리인의 동의 없이 이루어진 결제는 법정대리인이 취소할 수 있습니다.</li>
                        <li>미성년자 결제 취소 시 법정대리인임을 증명할 수 있는 서류가 필요합니다.</li>
                    </ul>
                </section>

                <section>
                    <h2>10. 서비스 종료 시 환불</h2>
                    <ul>
                        <li>서비스 전체를 종료하는 경우, 종료일로부터 최소 30일 전에 공지합니다.</li>
                        <li>유료로 구매한 미사용 엽전은 서비스 종료 전까지 신청 시 환불됩니다.</li>
                        <li>환불 신청 기간 내 신청하지 않은 경우 환불 권리가 소멸됩니다.</li>
                    </ul>
                </section>

                <section>
                    <h2>11. 분쟁 해결</h2>
                    <p>환불 관련 분쟁은 다음의 기관을 통해 해결할 수 있습니다:</p>
                    <ul>
                        <li>한국소비자원: 국번없이 1372 (www.kca.go.kr)</li>
                        <li>전자상거래 분쟁조정위원회</li>
                        <li>공정거래위원회 소비자상담센터</li>
                    </ul>
                </section>

                <section>
                    <h2>고객센터 안내</h2>
                    <div className={legalStyles.infoBoxLarge}>
                        <p className={legalStyles.infoLabel}>{publicCompanyName} 고객센터</p>
                        <p className={legalStyles.infoDetail}>이메일: {publicContactEmail}</p>
                        <p className={legalStyles.infoDetail}>운영시간: 평일 10:00 - 18:00 (주말/공휴일 휴무)</p>
                        <p className={legalStyles.infoDetailTertiary}>
                            * 이메일 문의는 영업일 기준 1-2일 내 답변드립니다.
                        </p>
                    </div>
                </section>

                <p className={legalStyles.footnote}>
                    공고일자: 2026년 1월 25일<br />
                    시행일자: 2026년 1월 25일
                </p>
            </article>

            <nav className={styles.nav}>
                <Link href="/terms">이용약관 →</Link>
                <Link href="/privacy">개인정보처리방침 →</Link>
                <Link href="/">홈으로 →</Link>
            </nav>
        </main>
    );
}
