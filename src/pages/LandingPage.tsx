import {
  ArrowUpRight, Boxes, Building2, ChartLine, Container, Database, FileStack, GitCompareArrows,
  Landmark, Layers, Mail, Menu, ShieldCheck, Sigma, Waves, X,
} from 'lucide-react';
import { KeyboardEvent, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ButtonAnchor, ButtonLink, Logo } from '../components/ui';
import './landing.css';

const VIEWER_PATH = '/app/viewer';
const CONTACT_EMAIL = process.env.REACT_APP_CONTACT_EMAIL;

const NAV = [
  { href: '#features', label: '기능' },
  { href: '#workflow', label: '워크플로우' },
  { href: '#use-cases', label: '활용 분야' },
  { href: '#tech', label: '기술' },
  { href: '#contact', label: '문의' },
];

const FORMATS = ['GeoTIFF', 'CAS500', 'Shapefile', 'Google Earth Engine', 'Zarr'];
const STANDARDS = ['xcube', 'OGC Tile', 'Docker', 'Kubernetes'];

const WORKFLOW = [
  { icon: FileStack, title: '변환', text: '위성 원천 파일과 GEE 수집 결과를 Zarr 데이터큐브로 변환합니다.' },
  { icon: Boxes, title: '관리', text: '데이터큐브를 프로젝트와 독립적으로 소유하고, 분류하고, 공유합니다.' },
  { icon: Layers, title: '시각화', text: 'band·RGB 전환, 시점 재생, 픽셀 단위 전체 시계열을 확인합니다.' },
  { icon: Sigma, title: '융합', text: '여러 데이터의 band를 수식으로 계산해 새 데이터큐브를 만듭니다.' },
  { icon: Waves, title: 'AI 분석', text: '수체를 추출하고 모델·시점별 결과와 면적 변화를 비교합니다.' },
];

const FEATURES = [
  {
    id: 'generate',
    eyebrow: '데이터큐브 생성',
    title: '형식이 달라도 같은 데이터큐브로',
    text: 'GeoTIFF·CAS500·Shapefile 파일을 올리면 좌표계, 범위, 해상도, band를 자동으로 읽습니다. Google Earth Engine 카탈로그에서 데이터셋을 골라 바로 만들 수도 있습니다.',
    points: ['GDAL 기반 공간정보 자동 인식', 'Shapefile 필수 구성 파일 검사', 'GEE 컬렉션·기간·영역·운량 설정'],
    visual: 'generate' as const,
  },
  {
    id: 'viewer',
    eyebrow: '시계열 Viewer',
    title: '시점을 넘기며, 픽셀 하나까지',
    text: '데이터큐브를 지도 위에서 시점별로 재생하고, 지점을 클릭하면 같은 좌표의 전체 기간 값을 그래프로 봅니다.',
    points: ['band·RGB 표시 전환과 색상표', '시점 재생·이전·다음·반복', '픽셀 클릭 시 전체 시계열 그래프'],
    visual: 'viewer' as const,
  },
  {
    id: 'ai',
    eyebrow: 'AI 수체 추출',
    title: '물이 있는 곳을 기간 전체에서',
    text: '모델과 기간, 영역을 정하면 모든 시점의 수체를 추출해 새 데이터큐브로 저장합니다. 원본과 겹쳐 보며 결과를 확인합니다.',
    points: ['지수 기반 모델부터 단계적으로 확장', '기간·영역·파라미터 지정', '결과를 원본과 연결해 보관'],
    visual: 'ai' as const,
  },
  {
    id: 'compare',
    eyebrow: '비교 분석',
    title: '결과의 차이를 숫자로',
    text: '모델 간, 시점 간 수체 결과를 겹쳐 차이 지도를 만들고, 면적 변화와 일치도 지표를 계산해 보고용으로 내보냅니다.',
    points: ['일치도·변화 지도', '수체 면적 시계열 차트', '지표 표와 CSV·이미지 내보내기'],
    visual: 'compare' as const,
  },
];

const USE_CASES = [
  {
    id: 'enterprise',
    icon: Building2,
    label: '기업',
    title: '대용량 위성영상을 가볍게',
    text: '원본 영상을 그대로 쌓아 두는 대신 chunk 단위로 압축된 Zarr 데이터큐브로 바꿔 보관합니다. 필요한 영역과 시점만 지도 tile과 시계열로 불러오므로 전체 파일을 내려받지 않아도 됩니다.',
    items: ['chunk 압축 데이터큐브로 저장 공간 절감', '필요한 영역·시점만 조회', '여러 위성 데이터의 수식 융합', '컨테이너 기반 사내 구축'],
  },
  {
    id: 'public',
    icon: Landmark,
    label: '지자체',
    title: '전용 시스템 없이 수면 변화 확인',
    text: '국토위성(CAS500), Sentinel-2, Landsat 같은 공공 위성 데이터로 하천과 저수지의 수면 변화를 확인합니다. 기간을 비교한 결과를 표와 이미지로 내보내 행정 보고에 활용합니다.',
    items: ['공공 위성 데이터 활용', '저수지·하천 수면적 변화 확인', '기간 비교 결과 내보내기', '웹 브라우저만으로 사용'],
  },
];

const TECH = [
  { icon: Database, title: '오픈 표준', text: 'Zarr 데이터큐브와 공식 xcube 서버로 시각화합니다. 특정 상용 형식에 묶이지 않습니다.' },
  { icon: Container, title: '컨테이너 배포', text: '서비스마다 독립된 Docker 컨테이너로 만들어 Kubernetes에서 운영합니다.' },
  { icon: ShieldCheck, title: '권한과 공유', text: '데이터는 소유자에게 있고 보기·편집 권한으로 공유합니다. 2시간 동안 활동이 없으면 자동으로 로그아웃됩니다.' },
];

export default function LandingPage() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="xc landing">
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <header className="landing__header">
        <div className="landing__container landing__nav">
          <Logo />
          <nav aria-label="주요 메뉴" className={menuOpen ? 'landing__menu landing__menu--open' : 'landing__menu'} id="landing-menu">
            <ul>
              {NAV.map((item) => (
                <li key={item.href}><a href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a></li>
              ))}
            </ul>
            {!user && (
              <div className="landing__menu-account">
                <ButtonLink to="/login?redirect=%2F" variant="secondary" block>로그인</ButtonLink>
                <ButtonLink to="/signup" variant="ghost" block>시작하기</ButtonLink>
              </div>
            )}
          </nav>
          <div className="landing__actions">
            {user ? (
              <span className="landing__user">{user.name}님</span>
            ) : (
              <>
                <ButtonLink to="/login?redirect=%2F" variant="ghost" className="landing__hide-sm">로그인</ButtonLink>
                <ButtonLink to="/signup" variant="secondary" className="landing__hide-sm">시작하기</ButtonLink>
              </>
            )}
            <ViewerLink size="md" />
            <button
              type="button"
              className="landing__menu-toggle"
              aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={menuOpen}
              aria-controls="landing-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="landing__hero" aria-labelledby="hero-title">
          <div className="landing__container landing__hero-grid">
            <div className="landing__hero-copy">
              <p className="landing__eyebrow">위성 시계열 · AI 수체 분석 플랫폼</p>
              <h1 id="hero-title" className="landing__hero-title">위성 데이터에서<br />물의 변화를 읽습니다</h1>
              <p className="landing__lead">
                다양한 위성 형식을 Zarr 데이터큐브로 변환하고, 시계열 시각화와 데이터 융합, AI 수체 추출과 결과 비교까지 한 곳에서 수행합니다.
              </p>
              <div className="landing__cta">
                <ViewerLink size="lg" />
                {user
                  ? <ButtonAnchor href="#contact" variant="secondary" size="lg">도입 문의</ButtonAnchor>
                  : <ButtonLink to="/signup" variant="secondary" size="lg">회원가입</ButtonLink>}
              </div>
              <p className="landing__hint">Viewer는 새 탭에서 열립니다.</p>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="landing__strip" aria-label="지원 데이터와 표준">
          <div className="landing__container landing__strip-inner">
            <div className="landing__chips">
              <span className="landing__chips-label">지원 데이터</span>
              {FORMATS.map((name) => <span key={name} className="landing__chip">{name}</span>)}
            </div>
            <div className="landing__chips">
              <span className="landing__chips-label">기술 표준</span>
              {STANDARDS.map((name) => <span key={name} className="landing__chip landing__chip--muted">{name}</span>)}
            </div>
          </div>
        </section>

        <section id="workflow" className="landing__section" aria-labelledby="workflow-title">
          <div className="landing__container">
            <SectionHeading id="workflow-title" eyebrow="워크플로우" title="데이터 준비부터 분석까지 다섯 단계" />
            <ol className="landing__steps">
              {WORKFLOW.map(({ icon: Icon, title, text }, index) => (
                <li key={title} className="landing__step">
                  <span className="landing__step-index tabular" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
                  <span className="landing__step-icon" aria-hidden><Icon size={22} /></span>
                  <h3 className="landing__step-title"><span className="sr-only">{index + 1}단계. </span>{title}</h3>
                  <p className="landing__step-text">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="landing__section landing__section--surface" aria-labelledby="features-title">
          <div className="landing__container">
            <SectionHeading id="features-title" eyebrow="기능" title="한 플랫폼에서 이어지는 분석 흐름" />
            <div className="landing__features">
              {FEATURES.map((feature, index) => (
                <article key={feature.id} className={index % 2 ? 'landing__feature landing__feature--reverse' : 'landing__feature'} aria-labelledby={`feature-${feature.id}`}>
                  <div className="landing__feature-copy">
                    <p className="landing__eyebrow">{feature.eyebrow}</p>
                    <h3 id={`feature-${feature.id}`} className="landing__feature-title">{feature.title}</h3>
                    <p className="landing__feature-text">{feature.text}</p>
                    <ul className="landing__checks">
                      {feature.points.map((point) => <li key={point}>{point}</li>)}
                    </ul>
                  </div>
                  <FeatureVisual kind={feature.visual} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="use-cases" className="landing__section" aria-labelledby="use-cases-title">
          <div className="landing__container">
            <SectionHeading id="use-cases-title" eyebrow="활용 분야" title="필요한 곳에 맞게" />
            <UseCaseTabs />
          </div>
        </section>

        <section id="tech" className="landing__section landing__section--surface" aria-labelledby="tech-title">
          <div className="landing__container">
            <SectionHeading id="tech-title" eyebrow="기술" title="표준 위에서, 독립적으로 운영" />
            <ul className="landing__tech">
              {TECH.map(({ icon: Icon, title, text }) => (
                <li key={title} className="landing__tech-item">
                  <span className="landing__tech-icon" aria-hidden><Icon size={22} /></span>
                  <h3 className="landing__tech-title">{title}</h3>
                  <p className="landing__tech-text">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="contact" className="landing__contact" aria-labelledby="contact-title">
          <div className="landing__container landing__contact-inner">
            <div>
              <h2 id="contact-title" className="landing__contact-title">우리 기관의 데이터로 확인해 보세요</h2>
              <p className="landing__contact-text">Viewer에서 바로 데이터를 열어 보거나, 도입을 문의해 주세요.</p>
            </div>
            <div className="landing__cta">
              <ViewerLink size="lg" />
              {CONTACT_EMAIL ? (
                <ButtonAnchor href={`mailto:${CONTACT_EMAIL}`} variant="secondary" size="lg"><Mail size={18} aria-hidden />도입 문의</ButtonAnchor>
              ) : (
                <p className="landing__contact-note">도입 문의 창구는 준비 중입니다.</p>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <div className="landing__container landing__footer-inner">
          <Logo />
          <nav aria-label="하단 메뉴">
            <ul className="landing__footer-links">
              {NAV.map((item) => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}
            </ul>
          </nav>
          <p className="landing__copyright">© {new Date().getFullYear()} XCube</p>
        </div>
      </footer>
    </div>
  );
}

function ViewerLink({ size }: { size: 'md' | 'lg' }) {
  return (
    <ButtonAnchor href={VIEWER_PATH} target="_blank" rel="noopener" size={size}>
      Viewer 열기
      <ArrowUpRight size={size === 'lg' ? 18 : 16} aria-hidden />
      <span className="sr-only">(새 탭)</span>
    </ButtonAnchor>
  );
}

function SectionHeading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="landing__heading">
      <p className="landing__eyebrow">{eyebrow}</p>
      <h2 id={id} className="landing__section-title">{title}</h2>
    </div>
  );
}

function UseCaseTabs() {
  const [active, setActive] = useState(0);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (active + (event.key === 'ArrowRight' ? 1 : -1) + USE_CASES.length) % USE_CASES.length;
    setActive(next);
    document.getElementById(`use-case-tab-${USE_CASES[next].id}`)?.focus();
  };
  const current = USE_CASES[active];
  const Icon = current.icon;
  return (
    <div className="landing__usecases">
      <div role="tablist" aria-label="활용 분야" className="landing__tabs">
        {USE_CASES.map((item, index) => (
          <button
            key={item.id}
            id={`use-case-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={`use-case-panel-${item.id}`}
            tabIndex={index === active ? 0 : -1}
            className="landing__tab"
            onClick={() => setActive(index)}
            onKeyDown={onKeyDown}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`use-case-panel-${current.id}`} aria-labelledby={`use-case-tab-${current.id}`} className="landing__usecase" tabIndex={0}>
        <span className="landing__usecase-icon" aria-hidden><Icon size={26} /></span>
        <div>
          <h3 className="landing__usecase-title">{current.title}</h3>
          <p className="landing__usecase-text">{current.text}</p>
        </div>
        <ul className="landing__checks landing__checks--grid">
          {current.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Illustrations (decorative; real product captures replace them before release) ---------- */

const RIVER = 'M-10 250 C60 230 110 270 170 245 S280 190 340 210 S450 260 520 228';

function ProductPreview() {
  return (
    <figure className="preview">
      <div className="preview__frame" aria-hidden>
        <div className="preview__bar">
          <span className="preview__dots"><i /><i /><i /></span>
          <span className="preview__crumb">프로젝트 없음 / 저수지_Sentinel-2</span>
          <span className="preview__mode"><b>단일</b><span>스와이프</span><span>나란히</span></span>
        </div>
        <div className="preview__body">
          <div className="preview__panel">
            <p className="preview__label">레이어</p>
            <div className="preview__row"><i className="preview__check preview__check--on" />원본 · B8</div>
            <div className="preview__ramp" />
            <div className="preview__row"><i className="preview__check preview__check--on" />AI 수체</div>
            <div className="preview__row"><i className="preview__check" />융합 결과</div>
          </div>
          <div className="preview__map">
            <svg viewBox="0 0 500 320" preserveAspectRatio="xMidYMid slice">
              <rect width="500" height="320" fill="#e7ece4" />
              <path d="M0 80 C90 60 160 100 250 80 S420 40 500 70 V0 H0Z" fill="#dfe6da" />
              <path d="M0 320 V270 C120 250 220 300 330 270 S460 240 500 255 V320Z" fill="#dde4d6" />
              <path d={RIVER} fill="none" stroke="#7dd3fc" strokeWidth="18" strokeLinecap="round" />
              <path d={RIVER} fill="none" stroke="var(--color-water)" strokeWidth="9" strokeLinecap="round" />
              <path d="M150 120 C185 98 245 104 262 132 S240 186 200 182 128 150 150 120Z" fill="var(--color-water)" opacity=".8" />
              <path d="M330 110 C352 98 392 104 398 124 S380 152 356 148 318 126 330 110Z" fill="var(--color-water)" opacity=".55" />
              <g stroke="#cbd5c4" strokeWidth="1">
                <path d="M0 160 H500M250 0 V320" />
              </g>
              <circle cx="214" cy="146" r="7" fill="var(--color-primary)" stroke="#fff" strokeWidth="3" />
            </svg>
            <div className="preview__tools"><i /><i /><i /></div>
          </div>
        </div>
        <div className="preview__chart">
          <svg viewBox="0 0 600 70" preserveAspectRatio="none">
            <path d="M0 50 L50 44 L100 47 L150 30 L200 22 L250 26 L300 18 L350 28 L400 40 L450 36 L500 24 L550 30 L600 26" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            <path d="M300 0 V70" stroke="var(--color-text-tertiary)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="preview__timeline">
          <span className="preview__play" />
          <span className="preview__track"><span className="preview__thumb" /></span>
          <span className="preview__date tabular">2024-07-15</span>
        </div>
      </div>
      <figcaption className="preview__caption">예시 화면: 지도·레이어·픽셀 시계열·시점 재생</figcaption>
    </figure>
  );
}

function FeatureVisual({ kind }: { kind: 'generate' | 'viewer' | 'ai' | 'compare' }) {
  return (
    <div className={`visual visual--${kind}`} aria-hidden>
      {kind === 'generate' && (
        <div className="visual__generate">
          <div className="visual__files">
            {['scene_0612.tif', 'reservoir.zip', 'COPERNICUS/S2_SR'].map((name) => (
              <span key={name} className="visual__file"><FileStack size={16} />{name}</span>
            ))}
          </div>
          <span className="visual__arrow" />
          <div className="visual__cube">
            <Boxes size={44} />
            <span>dataset.zarr</span>
            <small className="tabular">time · lat · lon</small>
          </div>
        </div>
      )}
      {kind === 'viewer' && (
        <div className="visual__viewer">
          <div className="visual__chart-head"><ChartLine size={16} />픽셀 시계열 · B8</div>
          <svg className="visual__plot" viewBox="0 0 320 140">
            <g stroke="var(--color-border)">{[30, 65, 100].map((y) => <path key={y} d={`M0 ${y} H320`} />)}</g>
            <path d="M0 100 L30 92 L60 96 L90 70 L120 58 L150 64 L180 44 L210 52 L240 76 L270 68 L300 50 L320 56" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" />
            {[[90, 70], [180, 44], [270, 68]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" fill="var(--color-primary)" />)}
            <path d="M180 0 V140" stroke="var(--color-text-tertiary)" strokeDasharray="4 4" />
          </svg>
          <div className="visual__ticks tabular"><span>1월</span><span>4월</span><span>7월</span><span>10월</span></div>
        </div>
      )}
      {kind === 'ai' && (
        <div className="visual__pair">
          <div className="visual__tile">
            <svg className="visual__plot" viewBox="0 0 160 120"><rect width="160" height="120" fill="#e7ece4" /><path d="M20 60 C40 30 90 30 110 55 S120 100 80 98 10 90 20 60Z" fill="#8fb3a8" /><path d="M0 105 C50 95 100 115 160 100" stroke="#8fb3a8" strokeWidth="8" fill="none" /></svg>
            <span>원본</span>
          </div>
          <div className="visual__tile">
            <svg className="visual__plot" viewBox="0 0 160 120"><rect width="160" height="120" fill="#f1f5f9" /><path d="M20 60 C40 30 90 30 110 55 S120 100 80 98 10 90 20 60Z" fill="var(--color-water)" /><path d="M0 105 C50 95 100 115 160 100" stroke="var(--color-water)" strokeWidth="8" fill="none" /></svg>
            <span>수체 추출 결과</span>
          </div>
        </div>
      )}
      {kind === 'compare' && (
        <div className="visual__compare">
          <svg className="visual__plot" viewBox="0 0 200 130">
            <rect width="200" height="130" fill="#f1f5f9" />
            <path d="M30 70 C50 30 120 28 150 60 S150 112 100 110 18 104 30 70Z" fill="var(--cmp-agree)" opacity=".85" />
            <path d="M150 60 C160 72 166 90 152 104 L140 96 C150 86 150 74 142 66Z" fill="var(--cmp-only-a)" />
            <path d="M30 70 C24 84 26 96 38 104 L44 98 C36 92 34 82 38 72Z" fill="var(--cmp-only-b)" />
          </svg>
          <ul className="visual__legend">
            <li><i style={{ background: 'var(--cmp-agree)' }} />둘 다 수체</li>
            <li><i style={{ background: 'var(--cmp-only-a)' }} />결과 A만</li>
            <li><i style={{ background: 'var(--cmp-only-b)' }} />결과 B만</li>
          </ul>
          <div className="visual__metrics">
            <span><GitCompareArrows size={16} />일치도·면적 지표</span>
          </div>
        </div>
      )}
    </div>
  );
}
