import { LogOut, Mail, Menu, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Button, ButtonAnchor, ButtonLink, Logo } from '../components/ui';
import './landing.css';

const CONTACT_EMAIL = process.env.REACT_APP_CONTACT_EMAIL;
const VERSION = process.env.REACT_APP_VERSION;
const ASSET = `${process.env.PUBLIC_URL ?? ''}/landing`;

const NAV = [
  { href: '#case', label: '사례' },
  { href: '#customers', label: '쓰는 곳' },
  { href: '#adopt', label: '도입 안내' },
];

/** "무엇이 달라지나": three ruled lines. Only what is built today. */
const CHANGES = [
  {
    title: '용량을 줄여 보관합니다',
    text: 'GeoTIFF, 국토위성(CAS500), Shapefile 파일을 올리거나 Google Earth Engine에서 기간과 영역을 골라 가져오면, 작은 조각으로 나눠 압축한 Zarr 데이터로 바꿔 둡니다.',
    note: 'Zarr: 큰 격자 자료를 조각(chunk) 단위로 압축해 저장하는 공개 형식',
  },
  {
    title: '필요한 곳과 날짜만 엽니다',
    text: '전체 파일을 내려받지 않고, 지도에서 보는 영역과 고른 시점만 불러옵니다. 시점을 차례로 재생하고, 한 지점을 누르면 그 자리의 전체 기간 값이 그래프로 나옵니다.',
    note: '넓은 지역은 축소 단계를 함께 만들어 처음 열 때도 가볍습니다',
  },
  {
    title: '물의 범위는 AI가 찾습니다',
    text: 'NDWI 기준선, U-Net, DeepLabV3+ 가운데 골라 물을 찾고, 결과를 원본 위에서 밀어 보며 확인합니다. 시점별 면적은 그래프로 보고 CSV로 내려받습니다.',
    note: 'NDWI: 녹색과 근적외선 밴드로 물을 가려내는 지수',
  },
];

/** What the result panel in the case capture shows, top to bottom. */
const CASE_READING = [
  { title: '원본과 AI 결과를 밀어 보기', text: '구분선을 움직여 같은 날짜의 원본과 AI가 찾은 물을 한 화면에서 비교합니다.' },
  { title: '임계값별 면적', text: '물로 볼 기준을 옮기면 면적이 어떻게 바뀌는지 바로 계산합니다.' },
  { title: '참조 자료 대비 지표', text: 'JRC 지표수 자료(water_gt)와 겹쳐 IoU, F1, 정밀도, 재현율을 냅니다.' },
  { title: '면적 그래프와 CSV', text: '시점별 수체 면적을 그래프로 보고, 표로 내려받아 보고서에 붙입니다.' },
];

const CUSTOMERS = [
  {
    id: 'enterprise',
    title: '기업',
    lead: '쌓여 가는 위성 영상을 가볍게 보관하고, 필요한 부분만 빠르게 읽고 싶은 곳',
    items: [
      '원본 값을 그대로 둔 채 압축 Zarr로 보관',
      '영역과 시점을 골라 지도와 시계열로 조회',
      '여러 데이터의 밴드를 수식으로 합쳐 새 데이터 생성',
    ],
  },
  {
    id: 'local',
    title: '시·군·구',
    lead: 'GIS 전담 인력 없이 저수지와 하천의 물 변화를 확인하고 보고해야 하는 곳',
    items: [
      '설치 없이 웹 브라우저에서 사용',
      '국토위성·Sentinel 같은 공공 위성 자료로 수면 확인',
      '면적을 CSV로 받아 보고서에 정리, 동료와는 로그인 아이디로 공유',
    ],
  },
];

const ADOPT = [
  { title: '시작', text: '웹 브라우저에서 계정을 만들면 바로 데이터를 올리고 만들 수 있습니다. 사용자마다 전용 시각화 서버가 붙어, 새로 만든 데이터가 곧바로 지도에 올라옵니다.' },
  { title: '데이터 위치', text: '지금은 기관 내부 네트워크 안에서 운영합니다. 지도 타일에 접근 보안을 거는 작업은 다음 단계로 예정되어 있고, 그 전까지는 고객 데이터를 외부망에 공개하지 않습니다.' },
  { title: '형식', text: '저장은 Zarr, 지도 표시는 공개 소프트웨어인 xcube 서버를 씁니다. 만든 데이터가 특정 상용 형식에 묶이지 않습니다.' },
  { title: '계정', text: '비밀번호는 되돌릴 수 없는 방식으로 저장하고, 2시간 동안 활동이 없으면 자동으로 로그아웃합니다. 데이터는 만든 사람이 소유하고, 그 사람이 공유한 계정만 볼 수 있습니다.' },
  { title: '준비 중', text: '기관 서버에 직접 설치하는 배포 묶음과 관리자용 운영 화면은 아직 준비 중입니다.' },
];

const MOBILE_QUERY = '(max-width: 767px)';

export default function LandingPage() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback((returnFocus = true) => {
    setMenuOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // The bar sits transparent over the hero and takes a sheet + rule once the page moves.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Mobile menu: focus the first link on open; Escape or a click outside closes it.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(); };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !toggleRef.current?.contains(target)) closeMenu(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen, closeMenu]);

  // Leaving the phone layout with the menu open would leave it stuck open in the desktop bar.
  useEffect(() => {
    if (!menuOpen || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = () => { if (!query.matches) setMenuOpen(false); };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, [menuOpen]);

  const actions = (inMenu: boolean) => user ? (
    <>
      <ButtonLink to="/app" variant="ink" size={inMenu ? 'lg' : 'md'} block={inMenu}>콘솔로 이동</ButtonLink>
      <Button variant={inMenu ? 'line' : 'quiet'} size={inMenu ? 'lg' : 'md'} block={inMenu} onClick={() => { setMenuOpen(false); signOut(); }}>
        <LogOut size={16} aria-hidden />로그아웃
      </Button>
    </>
  ) : (
    <>
      <ButtonLink to="/login?redirect=%2F" variant={inMenu ? 'line' : 'quiet'} size={inMenu ? 'lg' : 'md'} block={inMenu}>로그인</ButtonLink>
      <ButtonLink to="/signup" variant="ink" size={inMenu ? 'lg' : 'md'} block={inMenu}>시작하기</ButtonLink>
    </>
  );

  return (
    <div className="xc landing">
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <header className="lp-bar" data-scrolled={scrolled || menuOpen ? 'true' : undefined}>
        <div className="lp-wrap lp-bar__inner">
          <Logo />
          <nav aria-label="주요 메뉴" className="lp-bar__nav">
            <ul>
              {NAV.map((item) => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}
            </ul>
          </nav>
          <div className="lp-bar__actions">{actions(false)}</div>
          <button
            ref={toggleRef}
            type="button"
            className="lp-bar__toggle"
            aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={menuOpen}
            aria-controls="lp-menu"
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          >
            {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
        <div ref={menuRef} id="lp-menu" className="lp-menu" data-open={menuOpen ? 'true' : undefined} inert={!menuOpen}>
          <nav aria-label="모바일 메뉴">
            <ul>
              {NAV.map((item) => <li key={item.href}><a href={item.href} onClick={() => closeMenu(false)}>{item.label}</a></li>)}
            </ul>
          </nav>
          <div className="lp-menu__actions">{actions(true)}</div>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-wrap lp-hero__copy">
            <h1 id="hero-title" className="lp-hero__title">위성 영상은 작게 보관하고, 필요한 곳과 날짜만 지도에서 봅니다</h1>
            <div className="lp-hero__side">
              <p className="lp-hero__lead">
                파일을 올리면 지도에서 바로 열리는 데이터로 바꿉니다. 물이 어디까지 찼는지는 AI가 찾아 원본 옆에 놓아 줍니다.
              </p>
              <div className="lp-cta">
                {user
                  ? <ButtonLink to="/app" variant="ink" size="lg">콘솔로 이동</ButtonLink>
                  : (
                    <>
                      <ButtonLink to="/signup" variant="ink" size="lg">시작하기</ButtonLink>
                      <ButtonAnchor href="#adopt" variant="line" size="lg">도입 안내</ButtonAnchor>
                    </>
                  )}
              </div>
            </div>
          </div>
          <figure className="lp-hero__shot">
            <picture>
              <source media={MOBILE_QUERY} srcSet={`${ASSET}/daecheong-swipe.webp`} width={780} height={1148} />
              <img
                src={`${ASSET}/daecheong-viewer.webp`}
                width={2400}
                height={1016}
                alt="XCube Viewer 실제 화면. 대청호를 가운데 구분선으로 나눠 왼쪽은 위성 원본, 오른쪽은 AI가 물로 찾은 곳을 청록으로 보여 주고, 오른쪽 패널에 면적과 참조 자료 대비 지표가 있습니다."
                fetchPriority="high"
              />
            </picture>
            <figcaption className="lp-wrap lp-caption">
              실제 화면 · 대청호, 2024년 8월 14일 Sentinel-1·2 · 왼쪽 원본, 오른쪽 DeepLabV3+ 결과
            </figcaption>
          </figure>
        </section>

        <section className="lp-change" aria-labelledby="change-title">
          <div className="lp-wrap">
            <h2 id="change-title" className="lp-h2">무엇이 달라지나</h2>
            <ul className="lp-lines">
              {CHANGES.map((item) => (
                <li key={item.title} className="lp-line">
                  <h3 className="lp-line__title">{item.title}</h3>
                  <div className="lp-line__body">
                    <p>{item.text}</p>
                    <p className="lp-line__note">{item.note}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="case" className="lp-case" aria-labelledby="case-title">
          <div className="lp-wrap lp-case__grid">
            <div className="lp-case__copy">
              <h2 id="case-title" className="lp-h2">대청호, 한 장면을 끝까지</h2>
              <p className="lp-case__lead">
                Sentinel-1(레이더)과 Sentinel-2(광학)를 함께 담은 2024년 8월 14일 대청호 데이터에 DeepLabV3+를 돌렸습니다. 결과 패널에서 읽을 수 있는 것은 이렇습니다.
              </p>
              <ol className="lp-reading">
                {CASE_READING.map((item) => (
                  <li key={item.title}>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </li>
                ))}
              </ol>
              <p className="lp-fine">
                화면의 IoU·F1은 이 한 장면을 참조 자료와 견준 값입니다. 다른 지역이나 시기의 결과를 보장하는 수치가 아닙니다.
              </p>
            </div>
            <figure className="lp-case__shot">
              <img
                src={`${ASSET}/daecheong-result.webp`}
                width={666}
                height={1280}
                loading="lazy"
                decoding="async"
                alt="원본 대비 결과 패널 실제 화면. AI 수체 결과와 원본 레이어 불투명도, 임계값 0.50에서 추정 면적 54.60 km², 참조 자료 대비 IoU 0.854, F1 0.922, 정밀도 0.873, 재현율 0.975."
              />
              <figcaption className="lp-caption">원본 대비 결과 패널 · 같은 화면의 오른쪽</figcaption>
            </figure>
          </div>
        </section>

        <section id="customers" className="lp-customers" aria-labelledby="customers-title">
          <div className="lp-wrap">
            <h2 id="customers-title" className="lp-h2">이런 곳에서 씁니다</h2>
            <div className="lp-customers__cols">
              {CUSTOMERS.map((item) => (
                <article key={item.id} className="lp-customer" aria-labelledby={`customer-${item.id}`}>
                  <h3 id={`customer-${item.id}`} className="lp-customer__title">{item.title}</h3>
                  <p className="lp-customer__lead">{item.lead}</p>
                  <ul className="lp-customer__items">
                    {item.items.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="adopt" className="lp-adopt" aria-labelledby="adopt-title">
          <div className="lp-wrap lp-adopt__grid">
            <div className="lp-adopt__head">
              <h2 id="adopt-title" className="lp-h2">도입 안내</h2>
              <p className="lp-adopt__lead">지금 어떻게 운영되는지, 무엇이 아직 준비 중인지 그대로 적었습니다.</p>
              <div className="lp-cta">
                {user
                  ? <ButtonLink to="/app" variant="ink" size="lg">콘솔로 이동</ButtonLink>
                  : <ButtonLink to="/signup" variant="ink" size="lg">시작하기</ButtonLink>}
                {CONTACT_EMAIL && (
                  <ButtonAnchor href={`mailto:${CONTACT_EMAIL}`} variant="line" size="lg">
                    <Mail size={18} aria-hidden />도입 문의 메일
                  </ButtonAnchor>
                )}
              </div>
            </div>
            <dl className="lp-facts">
              {ADOPT.map((item) => (
                <div key={item.title} className="lp-fact">
                  <dt>{item.title}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__inner">
          <Logo />
          <p className="lp-footer__credit">화면 속 위성 자료: Copernicus Sentinel-1·2 · 참조 수면: JRC Global Surface Water · 배경지도 © OpenStreetMap 기여자</p>
          <p className="lp-footer__meta">
            <span>© {new Date().getFullYear()} XCube</span>
            {VERSION && <span className="tabular">버전 {VERSION}</span>}
          </p>
        </div>
      </footer>
    </div>
  );
}
