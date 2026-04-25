import styles from '../about/content.module.css';
import legalStyles from '../legal.module.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { publicCompanyName, publicContactEmail, publicRepresentativeName, publicSiteUrl } from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

export const metadata: Metadata = {
    title: '개인정보처리방침',
    description: '사주 리포트 개인정보처리방침. 수집 항목, 이용 목적, 보관 기간, 파기 절차를 안내합니다.',
    alternates: {
        canonical: `${siteUrl}/privacy`,
    },
};

export default function PrivacyPage() {
    return (
        <main className={styles.container}>
            <Link href="/" className={styles.backLink}>← 홈으로</Link>
            <article className={styles.article}>
                <h1>개인정보처리방침</h1>
                <p>
                    {publicCompanyName}(이하 &quot;회사&quot;)가 운영하는 사주 리포트(이하 &quot;서비스&quot;)는
                    「개인정보 보호법」 제30조에 따라 이용자의 개인정보를 보호하고
                    이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록
                    다음과 같이 개인정보 처리방침을 수립·공개합니다.
                </p>

                <section>
                    <h2>1. 개인정보 수집 항목</h2>
                    <p>서비스는 회원 관리 및 맞춤형 서비스 제공을 위해 아래와 같은 개인정보를 수집합니다.</p>

                    <h3>가. 필수 수집 항목</h3>
                    <table className={legalStyles.table}>
                        <thead>
                            <tr className={legalStyles.headerRow}>
                                <th className={legalStyles.headerCell}>수집 항목</th>
                                <th className={legalStyles.headerCell}>수집 목적</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>소셜 로그인 고유 식별자 (ID)</td>
                                <td className={legalStyles.cell}>회원 식별 및 서비스 이용 권한 확인</td>
                            </tr>
                        </tbody>
                    </table>

                    <h3>나. 선택 수집 항목</h3>
                    <ul>
                        <li><strong>이름 (닉네임)</strong>: 사주 분석 결과 표시, 서비스 내 식별</li>
                        <li><strong>성별, 출생년월일, 출생시간, 양력/음력</strong>: 사주 분석 및 맞춤형 콘텐츠 제공</li>
                        <li><strong>상담 주제/세부 내용</strong>: AI 맞춤형 조언 생성</li>
                    </ul>

                    <h3>다. 소셜 로그인 시 수집 항목</h3>
                    <p><strong>카카오 로그인</strong></p>
                    <table className={legalStyles.tableSmall}>
                        <thead>
                            <tr className={legalStyles.headerRow}>
                                <th className={legalStyles.headerCellSmall}>수집 항목</th>
                                <th className={legalStyles.headerCellNarrow}>필수/선택</th>
                                <th className={legalStyles.headerCellSmall}>수집 목적</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>카카오 계정 고유 ID</td>
                                <td className={legalStyles.cellSmallCenter}>필수</td>
                                <td className={legalStyles.cellSmall}>회원 식별 및 중복 가입 방지</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>이름</td>
                                <td className={legalStyles.cellSmallCenter}>필수</td>
                                <td className={legalStyles.cellSmall}>회원가입 및 본인 확인</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>성별</td>
                                <td className={legalStyles.cellSmallCenter}>필수</td>
                                <td className={legalStyles.cellSmall}>회원가입</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>생일 (월/일)</td>
                                <td className={legalStyles.cellSmallCenter}>선택</td>
                                <td className={legalStyles.cellSmall}>회원가입</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>출생년도</td>
                                <td className={legalStyles.cellSmallCenter}>선택</td>
                                <td className={legalStyles.cellSmall}>회원가입</td>
                            </tr>
                            <tr>
                                <td className={legalStyles.cellSmall}>프로필 이미지</td>
                                <td className={legalStyles.cellSmallCenter}>선택</td>
                                <td className={legalStyles.cellSmall}>서비스 내 프로필 표시</td>
                            </tr>
                        </tbody>
                    </table>

                    <p><strong>네이버 로그인</strong></p>
                    <table className={legalStyles.tableSmall}>
                        <thead>
                            <tr className={legalStyles.headerRow}>
                                <th className={legalStyles.headerCellSmall}>수집 항목</th>
                                <th className={legalStyles.headerCellNarrow}>필수/선택</th>
                                <th className={legalStyles.headerCellSmall}>수집 목적</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>네이버 계정 고유 ID</td>
                                <td className={legalStyles.cellSmallCenter}>필수</td>
                                <td className={legalStyles.cellSmall}>회원 식별 및 중복 가입 방지</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>이름</td>
                                <td className={legalStyles.cellSmallCenter}>필수</td>
                                <td className={legalStyles.cellSmall}>회원가입 및 본인 확인</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>성별</td>
                                <td className={legalStyles.cellSmallCenter}>필수</td>
                                <td className={legalStyles.cellSmall}>회원가입</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>생일 (월/일)</td>
                                <td className={legalStyles.cellSmallCenter}>선택</td>
                                <td className={legalStyles.cellSmall}>회원가입</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cellSmall}>출생년도</td>
                                <td className={legalStyles.cellSmallCenter}>선택</td>
                                <td className={legalStyles.cellSmall}>회원가입</td>
                            </tr>
                            <tr>
                                <td className={legalStyles.cellSmall}>프로필 이미지</td>
                                <td className={legalStyles.cellSmallCenter}>선택</td>
                                <td className={legalStyles.cellSmall}>서비스 내 프로필 표시</td>
                            </tr>
                        </tbody>
                    </table>

                    <p className={legalStyles.smallText}>
                        * 소셜 로그인 정보는 각 플랫폼의 개인정보 제공 동의에 따라 수집되며, 플랫폼별 제공 범위가 상이할 수 있습니다.
                    </p>

                    <h3>라. 결제 시 수집 항목</h3>
                    <ul>
                        <li><strong>결제 정보</strong>: 결제 수단 정보, 결제 금액, 거래 일시</li>
                        <li><strong>엽전 거래 내역</strong>: 충전/사용 내역, 잔액</li>
                    </ul>
                    <p className={legalStyles.smallText}>
                        * 카드번호 등 민감한 결제정보는 토스페이먼츠에서 직접 처리하며, 회사는 보관하지 않습니다.
                    </p>

                    <h3>마. 자동 수집 정보</h3>
                    <ul>
                        <li>접속 IP, 브라우저 종류, 접속 일시, 서비스 이용 기록</li>
                    </ul>
                </section>

                <section>
                    <h2>2. 개인정보의 처리 목적</h2>
                    <p>수집된 개인정보는 다음의 목적으로만 이용됩니다.</p>
                    <ul>
                        <li><strong>회원 가입 및 관리</strong>: 회원 식별, 본인 확인, 중복 가입 방지, 부정 이용 방지</li>
                        <li><strong>맞춤형 콘텐츠 제공</strong>: 회원 특성에 맞는 콘텐츠 개인화</li>
                        <li><strong>유료 서비스 제공</strong>: 엽전 충전, 결제 처리, 유료 콘텐츠 이용</li>
                        <li><strong>서비스 개선</strong>: 이용 통계 분석(익명화), 신규 서비스 개발</li>
                    </ul>
                </section>

                <section>
                    <h2>3. 개인정보의 보유 및 이용 기간</h2>
                    <table className={legalStyles.table}>
                        <thead>
                            <tr className={legalStyles.headerRow}>
                                <th className={legalStyles.headerCell}>구분</th>
                                <th className={legalStyles.headerCell}>보유 기간</th>
                                <th className={legalStyles.headerCell}>비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>회원 정보</td>
                                <td className={legalStyles.cell}>회원 탈퇴 시까지</td>
                                <td className={legalStyles.cell}>탈퇴 즉시 영구 삭제</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>사주 프로필</td>
                                <td className={legalStyles.cell}>회원 탈퇴 시까지</td>
                                <td className={legalStyles.cell}>AES-GCM 암호화 저장</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>결제 기록</td>
                                <td className={legalStyles.cell}>5년</td>
                                <td className={legalStyles.cell}>전자상거래법 의무 보관</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>접속 기록</td>
                                <td className={legalStyles.cell}>3개월</td>
                                <td className={legalStyles.cell}>통신비밀보호법</td>
                            </tr>
                            <tr>
                                <td className={legalStyles.cell}>분석용 데이터</td>
                                <td className={legalStyles.cell}>분석 완료 즉시</td>
                                <td className={legalStyles.cell}>메모리에서 삭제</td>
                            </tr>
                        </tbody>
                    </table>
                </section>

                <section>
                    <h2>4. 개인정보의 제3자 제공</h2>
                    <p>
                        회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.
                        다만, 아래의 경우에는 예외로 합니다.
                    </p>
                    <ul>
                        <li>이용자가 사전에 동의한 경우</li>
                        <li>법령의 규정에 의한 경우</li>
                        <li>수사 목적으로 법령에 정해진 절차에 따라 요청이 있는 경우</li>
                    </ul>
                </section>

                <section>
                    <h2>5. 개인정보 처리 위탁</h2>
                    <p>서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁합니다.</p>
                    <table className={legalStyles.table}>
                        <thead>
                            <tr className={legalStyles.headerRow}>
                                <th className={legalStyles.headerCell}>수탁 업체</th>
                                <th className={legalStyles.headerCell}>위탁 업무</th>
                                <th className={legalStyles.headerCell}>보유 기간</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>Supabase Inc.</td>
                                <td className={legalStyles.cell}>회원 정보 저장, 인증 처리</td>
                                <td className={legalStyles.cell}>위탁 계약 종료 시</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>토스페이먼츠(주)</td>
                                <td className={legalStyles.cell}>
                                    전자지급결제대행(PG) 서비스<br/>
                                    <span className={legalStyles.smallText}>
                                        - 카드 결제, 간편결제 처리<br/>
                                        - 결제 승인/취소 처리<br/>
                                        - 결제 정보 암호화 전송
                                    </span>
                                </td>
                                <td className={legalStyles.cell}>
                                    전자금융거래법에 따름<br/>
                                    <span className={legalStyles.smallText}>
                                        (결제 기록 5년 보관)
                                    </span>
                                </td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>OpenAI LP</td>
                                <td className={legalStyles.cell}>AI 텍스트 생성</td>
                                <td className={legalStyles.cell}>처리 즉시 삭제</td>
                            </tr>

                            <tr>
                                <td className={legalStyles.cell}>Anthropic PBC</td>
                                <td className={legalStyles.cell}>AI 텍스트 생성</td>
                                <td className={legalStyles.cell}>처리 즉시 삭제</td>
                            </tr>
                        </tbody>
                    </table>
                    <p className={legalStyles.smallTextMargin}>
                        * AI 업체에는 생년월일시 및 성별만 익명화되어 전송되며, 각 업체는 API 데이터를 모델 학습에 사용하지 않습니다.<br/>
                        * 토스페이먼츠에는 결제 처리에 필요한 최소한의 정보만 암호화되어 전송되며, 카드번호 등 민감한 결제정보는 회사가 보관하지 않습니다.
                    </p>
                </section>

                <section>
                    <h2>6. 개인정보의 국외 이전</h2>
                    <p>서비스 제공을 위해 아래와 같이 개인정보가 국외로 이전됩니다.</p>
                    <table className={legalStyles.table}>
                        <thead>
                            <tr className={legalStyles.headerRow}>
                                <th className={legalStyles.headerCell}>이전받는 자</th>
                                <th className={legalStyles.headerCell}>이전 국가</th>
                                <th className={legalStyles.headerCell}>이전 항목</th>
                                <th className={legalStyles.headerCell}>이전 목적</th>
                                <th className={legalStyles.headerCell}>보유 기간</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>Supabase Inc.</td>
                                <td className={legalStyles.cell}>미국</td>
                                <td className={legalStyles.cell}>회원 정보(암호화), 서비스 이용 기록</td>
                                <td className={legalStyles.cell}>회원 정보 저장, 인증 처리</td>
                                <td className={legalStyles.cell}>서비스 이용 기간</td>
                            </tr>
                            <tr className={legalStyles.row}>
                                <td className={legalStyles.cell}>OpenAI LP</td>
                                <td className={legalStyles.cell}>미국</td>
                                <td className={legalStyles.cell}>익명화된 생년월일시, 성별</td>
                                <td className={legalStyles.cell}>AI 텍스트 생성</td>
                                <td className={legalStyles.cell}>처리 즉시 삭제</td>
                            </tr>

                            <tr>
                                <td className={legalStyles.cell}>Anthropic PBC</td>
                                <td className={legalStyles.cell}>미국</td>
                                <td className={legalStyles.cell}>익명화된 생년월일시, 성별</td>
                                <td className={legalStyles.cell}>AI 텍스트 생성</td>
                                <td className={legalStyles.cell}>처리 즉시 삭제</td>
                            </tr>
                        </tbody>
                    </table>
                    <p className={legalStyles.smallTextMargin}>
                        * 이용자는 국외 이전에 대한 동의를 거부할 수 있으나, 이 경우 서비스 이용이 제한될 수 있습니다.<br/>
                        * 각 업체의 개인정보 처리방침은 해당 업체 웹사이트에서 확인하실 수 있습니다.
                    </p>
                </section>

                <section>
                    <h2>7. 개인정보의 안전성 확보 조치</h2>
                    <p>회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</p>
                    <ul>
                        <li><strong>암호화</strong>: 생년월일 등 민감 정보는 AES-GCM 방식으로 암호화하여 저장</li>
                        <li><strong>접근 통제</strong>: 개인정보에 대한 접근 권한을 최소화하고 접근 기록 관리</li>
                        <li><strong>보안 프로토콜</strong>: HTTPS(TLS 1.3) 암호화 통신 적용</li>
                        <li><strong>비밀번호 암호화</strong>: JWT 토큰 기반 인증, 비밀번호는 단방향 해시 처리</li>
                        <li><strong>보안 업데이트</strong>: 정기적인 보안 취약점 점검 및 패치 적용</li>
                    </ul>
                </section>

                <section>
                    <h2>8. 이용자의 권리와 행사 방법</h2>
                    <p>이용자는 언제든지 다음과 같은 개인정보 보호 관련 권리를 행사할 수 있습니다.</p>
                    <ul>
                        <li><strong>개인정보 열람 요구</strong>: 마이페이지에서 본인의 정보를 확인할 수 있습니다.</li>
                        <li><strong>개인정보 정정·삭제 요구</strong>: 저장된 사주 프로필을 수정·삭제할 수 있습니다.</li>
                        <li><strong>개인정보 처리정지 요구</strong>: 회원 탈퇴를 통해 처리를 정지할 수 있습니다.</li>
                        <li><strong>회원 탈퇴</strong>: 마이페이지 &gt; 회원 탈퇴를 통해 즉시 탈퇴 및 모든 개인정보 영구 삭제가 가능합니다.</li>
                    </ul>
                </section>

                <section>
                    <h2>9. 개인정보 자동 수집 장치의 설치·운영 및 거부</h2>
                    <p>
                        서비스는 이용자에게 개별적인 맞춤서비스를 제공하기 위해
                        쿠키(cookie) 및 로컬 스토리지(localStorage)를 사용합니다.
                    </p>
                    <ul>
                        <li><strong>사용 목적</strong>: 로그인 상태 유지, 사용자 설정 저장, 분석 기록 임시 저장</li>
                        <li><strong>거부 방법</strong>: 브라우저 설정에서 쿠키 저장을 거부할 수 있습니다. 단, 거부 시 일부 서비스 이용이 제한될 수 있습니다.</li>
                    </ul>
                </section>

                <section>
                    <h2>10. 개인정보 보호책임자</h2>
                    <p>
                        회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고,
                        개인정보 처리와 관련한 이용자의 불만처리 및 피해구제 등을 위하여
                        아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
                    </p>
                    <div className={legalStyles.infoBox}>
                        <p className={legalStyles.infoLabel}>개인정보 보호책임자</p>
                        <p className={legalStyles.infoDetail}>성명: {publicRepresentativeName}</p>
                        <p className={legalStyles.infoDetail}>직책: 대표</p>
                        <p className={legalStyles.infoDetail}>이메일: {publicContactEmail}</p>
                    </div>
                </section>

                <section>
                    <h2>11. 권익침해 구제방법</h2>
                    <p>
                        이용자는 개인정보침해로 인한 구제를 받기 위하여
                        아래의 기관에 분쟁해결이나 상담 등을 신청할 수 있습니다.
                    </p>
                    <ul>
                        <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
                        <li>개인정보침해신고센터: 118 (privacy.kisa.or.kr)</li>
                        <li>대검찰청 사이버수사과: 1301 (www.spo.go.kr)</li>
                        <li>경찰청 사이버안전국: 182 (cyberbureau.police.go.kr)</li>
                    </ul>
                </section>

                <section>
                    <h2>12. 개인정보 처리방침 변경</h2>
                    <p>
                        이 개인정보 처리방침은 법령, 정책 또는 보안기술의 변경에 따라
                        내용이 추가, 삭제 및 수정될 수 있으며, 변경 시 서비스 내 공지사항을 통해
                        변경 사항을 사전 고지합니다.
                    </p>
                </section>

                <p className={legalStyles.footnote}>
                    공고일자: 2026년 1월 30일<br />
                    시행일자: 2026년 1월 30일
                </p>
            </article>

            <nav className={styles.nav}>
                <Link href="/terms">이용약관 →</Link>
                <Link href="/refund">환불정책 →</Link>
                <Link href="/">홈으로 →</Link>
            </nav>
        </main>
    );
}
