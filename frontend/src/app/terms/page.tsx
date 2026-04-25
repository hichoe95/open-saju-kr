import styles from '../about/content.module.css';
import legalStyles from '../legal.module.css';
import Link from 'next/link';
import {
    publicBusinessAddress,
    publicBusinessNumber,
    publicCompanyName,
    publicContactEmail,
    publicMailOrderNumber,
    publicRepresentativeName,
    publicSiteUrl,
} from '@/lib/publicConfig';

const siteUrl = publicSiteUrl;

export const metadata: import('next').Metadata = {
    title: '이용약관',
    description: '사주 리포트 서비스 이용약관. 서비스 이용 조건, 결제, 환불, 면책 사항을 안내합니다.',
    alternates: {
        canonical: `${siteUrl}/terms`,
    },
};

export default function TermsPage() {
    return (
        <main className={styles.container}>
            <Link href="/" className={styles.backLink}>← 홈으로</Link>
            <article className={styles.article}>
                <h1>이용약관</h1>

                <section>
                    <h2>제1조 (목적)</h2>
                    <p>
                        본 약관은 {publicCompanyName}(이하 &quot;회사&quot;)가 운영하는 사주 리포트 서비스(이하 &quot;서비스&quot;)의 이용조건 및 절차, 이용자와 회사의 권리, 의무, 책임사항을 규정함을 목적으로 합니다.
                    </p>
                </section>

                <section>
                    <h2>제2조 (서비스의 제공 및 변경)</h2>
                    <ol>
                        <li>회사는 다음과 같은 서비스를 제공합니다.
                            <ul>
                                <li>사주 명식 산출 및 오행 분석</li>
                                <li>10년 대운 및 연/월/일 운세 정보 제공</li>
                                <li>생성형 AI 기술을 활용한 맞춤형 운세 해설 및 고민 상담</li>
                                <li>기타 회사가 개발하거나 제휴를 통해 제공하는 일체의 서비스</li>
                            </ul>
                        </li>
                        <li>회사는 기술적 사양의 변경이나 운영상의 필요에 따라 서비스의 내용을 수정하거나 중단할 수 있습니다.</li>
                    </ol>
                </section>

                <section>
                    <h2>제3조 (서비스 이용의 한계)</h2>
                    <ul>
                        <li>본 서비스는 명리학적 이론과 AI 기술을 결합하여 제공되는 <strong>엔터테인먼트 및 상담 보조 자료</strong>입니다.</li>
                        <li>서비스가 제공하는 모든 정보는 과학적으로 검증된 사실이 아니며, 미래를 확정적으로 예언하지 않습니다.</li>
                        <li>회사는 서비스 이용 결과에 따라 발생한 이용자의 손해(금전적 손실, 정신적 피해 등)에 대하여 법적 책임을 지지 않습니다. 특히 의료, 법률, 투자의 중요한 결정은 반드시 전문가와 상의하십시오.</li>
                    </ul>
                </section>

                <section>
                    <h2>제4조 (이용자의 의무)</h2>
                    <ul>
                        <li>이용자는 본인의 정확한 정보를 입력하여야 하며, 타인의 정보를 도용해서는 안 됩니다.</li>
                        <li>이용자는 서비스를 이용하여 얻은 정보를 회사의 사전 승낙 없이 복제, 출판, 방송 등에 사용하거나 제3자에게 제공할 수 없습니다.</li>
                        <li>서비스의 안정적인 운영을 방해하는 행위(해킹, 매크로 사용 등)를 해서는 안 됩니다.</li>
                    </ul>
                </section>

                <section>
                    <h2>제5조 (AI 생성 콘텐츠에 대한 고지)</h2>
                    <p>
                        본 서비스의 일부 결과물은 인공지능(AI)에 의해 생성됩니다. AI의 특성상 때로는 부정확한 정보나 사실과 다른 내용(Hallucination)이 포함될 수 있으며, 회사는 생성된 콘텐츠의 완벽한 정확성을 보장하지 않습니다.
                    </p>
                </section>

                <section>
                    <h2>제6조 (회원 탈퇴 및 자격 상실)</h2>
                    <ol>
                        <li>회원은 언제든지 서비스 내 마이페이지에서 회원 탈퇴를 신청할 수 있으며, 회사는 즉시 탈퇴를 처리합니다.</li>
                        <li>탈퇴 시 해당 회원의 모든 개인정보 및 사주 분석 기록은 즉시 영구 삭제되며, 복구가 불가능합니다.</li>
                        <li>소셜 로그인(카카오, 네이버, 구글)을 통해 가입한 경우, 본 서비스 탈퇴와 해당 소셜 계정은 별개이며, 소셜 계정의 연결 해제는 각 플랫폼에서 별도로 진행해야 합니다.</li>
                        <li>탈퇴 시 보유 중인 엽전은 즉시 소멸되며, 환불되지 않습니다.</li>
                    </ol>
                </section>

                <section>
                    <h2>제7조 (유료 서비스 및 결제)</h2>
                    <ol>
                        <li>회사는 서비스의 일부를 유료로 제공할 수 있으며, 유료 서비스의 종류와 이용 요금은 서비스 내에서 별도로 고지합니다.</li>
                        <li>유료 서비스 이용을 위해서는 회사가 정한 결제 수단을 통해 이용 요금을 결제해야 합니다.</li>
                        <li>결제 수단은 다음과 같습니다:
                            <ul>
                                <li>신용카드 및 체크카드</li>
                                <li>간편결제 (토스페이, 카카오페이, 네이버페이 등)</li>
                                <li>기타 회사가 정하는 결제 수단</li>
                            </ul>
                        </li>
                        <li>결제는 PG(Payment Gateway) 사업자인 토스페이먼츠(주)를 통해 처리되며, 카드번호 등 민감한 결제정보는 회사가 직접 수집하거나 보관하지 않습니다.</li>
                        <li>결제 완료 시점은 PG사로부터 결제 승인이 완료된 때를 기준으로 합니다.</li>
                    </ol>
                </section>

                <section>
                    <h2>제8조 (엽전의 구매 및 사용)</h2>
                    <ol>
                        <li>엽전은 서비스 내 유료 기능 결제를 위해 충전하여 사용하는 디지털 포인트입니다.</li>
                        <li>엽전의 충전 단위 및 가격은 서비스 내 충전 페이지에서 확인할 수 있습니다.</li>
                        <li>엽전의 사용 용도는 다음과 같습니다:
                            <ul>
                                <li>사주 재분석</li>
                                <li>AI 도사 상담</li>
                                <li>AI 궁합 분석</li>
                                <li>기운 캘린더 AI 조언</li>
                                <li>기타 회사가 정하는 유료 기능</li>
                            </ul>
                        </li>
                        <li>엽전의 결제 사용 경로는 다음과 같습니다: 충전 페이지에서 결제 완료 후 계정에 충전되며, 이후 서비스 내 유료 기능 선택 시 해당 기능 가격만큼 차감됩니다.</li>
                        <li><strong>충전된 포인트(엽전)의 이용기간과 환불가능기간은 결제시점으로부터 1년 이내입니다.</strong></li>
                        <li>엽전은 현금으로 환전할 수 없고, 사용자 간 양도, 판매, 대여, 상속 기타 일체의 이전이 불가합니다.</li>
                        <li><strong>1회 최대 결제금액은 100,000원으로 제한됩니다.</strong></li>
                        <li>카드사 또는 결제사 정책에 따라 위 한도보다 낮은 금액으로 결제 한도가 제한될 수 있으며, 누적 결제금액도 제한될 수 있습니다.</li>
                        <li>보너스로 지급된 엽전은 유료 구매 엽전보다 먼저 차감될 수 있으며, 환불 대상에서 제외될 수 있습니다.</li>
                    </ol>
                </section>

                <section>
                    <h2>제9조 (환불 및 청약철회)</h2>
                    <ol>
                        <li>회사는 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관계 법령에 따라 소비자의 청약철회 및 환불권을 보장합니다.</li>
                        <li>엽전은 디지털콘텐츠의 성격상 결제 즉시 사용 가능한 상태로 제공되며, 관계 법령에서 정한 청약철회 제한 사유에 해당하는 경우 청약철회가 제한될 수 있습니다.</li>
                        <li>이용자는 결제 시 아래 사항을 확인하고 동의한 것으로 간주됩니다:
                            <ul>
                                <li>엽전은 구매 즉시 계정에 충전되어 사용 가능한 상태가 됨</li>
                                <li>디지털콘텐츠 특성 및 법령상 요건에 따라 청약철회가 제한될 수 있음</li>
                                <li>환불은 원결제수단으로 처리됨</li>
                            </ul>
                        </li>
                        <li>다음의 경우에는 환불이 가능합니다:
                            <ul>
                                <li>결제 오류로 인한 중복 결제 또는 초과 결제</li>
                                <li>회사의 귀책사유로 서비스를 전혀 이용할 수 없는 경우</li>
                                <li>법령에 따라 환불이 의무화된 경우</li>
                            </ul>
                        </li>
                        <li>환불 가능한 경우, 이용자는 고객센터({publicContactEmail})를 통해 환불을 요청할 수 있으며, 회사는 요청일로부터 영업일 기준 7일 이내 환불 절차를 진행합니다.</li>
                        <li>환불은 반드시 결제 당시 이용한 동일 결제수단(원결제수단)으로 진행합니다. 단, 결제사 정책 또는 기술적 사유로 동일 수단 환불이 불가능한 경우에는 관계 법령 및 결제사 기준에 따라 처리합니다.</li>
                        <li>환불 신청은 결제시점으로부터 1년 이내에만 가능합니다.</li>
                        <li>미성년자의 결제는 법정대리인의 동의가 필요하며, 동의 없이 이루어진 결제는 법정대리인이 취소할 수 있습니다.</li>
                    </ol>
                </section>

                <section>
                    <h2>제10조 (서비스 중단 및 종료)</h2>
                    <ol>
                        <li>회사는 운영상, 기술상의 필요에 의해 서비스를 변경하거나 중단할 수 있습니다.</li>
                        <li>서비스 전체를 종료하는 경우, 회사는 종료일로부터 최소 30일 전에 서비스 내 공지사항 및 등록된 이메일을 통해 이용자에게 고지합니다.</li>
                        <li>서비스 종료 시 미사용 엽전의 처리:
                            <ul>
                                <li>유료로 구매한 미사용 엽전은 서비스 종료일 기준 잔여 엽전에 해당하는 금액을 환불합니다.</li>
                                <li>보너스 엽전 및 무료 지급 엽전은 환불 대상에서 제외됩니다.</li>
                                <li>환불 신청 기간은 서비스 종료 고지일로부터 종료일까지이며, 기간 내 신청하지 않은 경우 환불 권리가 소멸됩니다.</li>
                            </ul>
                        </li>
                    </ol>
                </section>

                <section>
                    <h2>제11조 (면책)</h2>
                    <ol>
                        <li>회사는 천재지변, 전쟁, 테러, 해킹 등 불가항력적인 사유로 서비스를 제공할 수 없는 경우 책임을 지지 않습니다.</li>
                        <li>회사는 이용자의 귀책사유로 인한 서비스 이용 장애에 대해 책임을 지지 않습니다.</li>
                        <li>회사는 이용자가 서비스를 통해 얻은 정보를 바탕으로 한 투자, 의료, 법률 등의 결정에 대해 책임을 지지 않습니다.</li>
                    </ol>
                </section>

                <section>
                    <h2>제12조 (분쟁 해결)</h2>
                    <ol>
                        <li>서비스 이용으로 발생한 분쟁에 대해서는 회사의 본사 소재지를 관할하는 법원을 전속 관할법원으로 합니다.</li>
                        <li>이용자는 서비스 이용과 관련한 분쟁에 대해 다음의 기관에 분쟁해결이나 상담을 신청할 수 있습니다:
                            <ul>
                                <li>한국소비자원 (국번없이 1372)</li>
                                <li>전자상거래 분쟁조정위원회</li>
                            </ul>
                        </li>
                    </ol>
                </section>

                <section>
                    <h2>제13조 (사업자 정보)</h2>
                    <div className={legalStyles.infoBoxLarge}>
                        <table className={legalStyles.tableNoBorder}>
                            <tbody>
                                <tr>
                                    <td className={legalStyles.cellLabel}>상호</td>
                                    <td className={legalStyles.cellNoBorder}>{publicCompanyName}</td>
                                </tr>
                                <tr>
                                    <td className={legalStyles.cellLabel}>대표자</td>
                                    <td className={legalStyles.cellNoBorder}>{publicRepresentativeName}</td>
                                </tr>
                                <tr>
                                    <td className={legalStyles.cellLabel}>사업자등록번호</td>
                                    <td className={legalStyles.cellNoBorder}>{publicBusinessNumber}</td>
                                </tr>
                                <tr>
                                    <td className={legalStyles.cellLabel}>통신판매업 신고번호</td>
                                    <td className={legalStyles.cellNoBorder}>{publicMailOrderNumber}</td>
                                </tr>
                                <tr>
                                    <td className={legalStyles.cellLabel}>주소</td>
                                    <td className={legalStyles.cellNoBorder}>{publicBusinessAddress}</td>
                                </tr>
                                <tr>
                                    <td className={legalStyles.cellLabel}>이메일</td>
                                    <td className={legalStyles.cellNoBorder}>{publicContactEmail}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <p className={legalStyles.footnote}>
                    공고일자: 2026년 1월 25일<br />
                    시행일자: 2026년 1월 25일
                </p>
            </article>

            <nav className={styles.nav}>
                <Link href="/privacy">개인정보처리방침 →</Link>
                <Link href="/refund">환불정책 →</Link>
                <Link href="/">홈으로 →</Link>
            </nav>
        </main>
    );
}
