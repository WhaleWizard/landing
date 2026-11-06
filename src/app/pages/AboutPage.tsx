import { lazy, Suspense } from 'react';
import { ArrowRight, ChartNoAxesColumnIncreasing, SlidersHorizontal, Target } from 'lucide-react';
import CardIcon from '../components/brand/CardIcon';
import { Link, useLocation } from 'react-router';
import ClientOnly from '../components/ClientOnly';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import SEO from '../components/SEO';
import { ABOUT_CONTENT_KEY, ABOUT_DEFAULTS, ABOUT_PROFILE, ABOUT_SECTIONS, type AboutContent, type AboutSection } from '../data/about';
import { useSiteContent } from '../hooks/useServiceContent';
import { withReturnTo } from '../utils/siteNavigation';
import './about-page.css';

const Footer = lazy(() => import('../components/Footer'));
const WORK_ICONS = [Target, SlidersHorizontal, ChartNoAxesColumnIncreasing];

function AboutText({ text, linkState }: { text: string; linkState: ReturnType<typeof withReturnTo> }) {
  return text.split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(\/[a-z0-9][a-z0-9/-]*\))/gi).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((\/[a-z0-9][a-z0-9/-]*)\)$/i);
    if (link) return <Link key={index} to={link[2]} state={linkState}>{link[1]}</Link>;
    return part;
  });
}

export function AboutBody({ content, previewSection }: { content: AboutContent; previewSection?: string }) {
  const linkState = withReturnTo(useLocation());
  const { aboutIntro: intro, aboutStory: story, aboutWork: work, aboutProjects: projects, aboutFocus: focus, aboutExtra: extra, aboutInvitation: invitation } = content;
  const order = Array.from(new Set(['aboutIntro', ...(content.sectionOrder || []), ...ABOUT_SECTIONS]));
  const paragraphs = (values: string[]) => values.map((value, index) => <p key={index}><AboutText text={value} linkState={linkState} /></p>);
  const renderSection = (section: AboutSection) => {
    switch (section) {
      case 'aboutIntro': return (
        <header key={section} className="about-hero">
          <div className="about-hero-copy">
            <h1>{intro.title === ABOUT_DEFAULTS.aboutIntro.title ? <>Обо <span>мне</span></> : intro.title}</h1>
            <p className="about-hero-lead">{intro.lead}</p>
            {paragraphs(intro.paragraphs)}
          </div>
          <div className="about-hero-visual">
            <img
              src="/images/about/ruslan-workspace.webp"
              srcSet="/images/about/ruslan-workspace-mobile.webp 720w, /images/about/ruslan-workspace.webp 1440w"
              sizes="(max-width: 720px) 100vw, (max-width: 1280px) 53vw, 680px"
              width={1440}
              height={960}
              alt={intro.imageAlt}
            />
          </div>
        </header>
      );
      case 'aboutStory': return (
        <section key={section} className="about-section about-prose" aria-labelledby="about-story">
          <h2 id="about-story">{story.title}</h2>
          {paragraphs(story.paragraphs)}
        </section>
      );
      case 'aboutWork': return (
        <section key={section} className="about-section" aria-labelledby="about-work">
          <h2 id="about-work">{work.title}</h2>
          {work.items.length > 0 && (
            <ol className="about-work-steps" role="list">
              {work.items.map(({ visualSlot, title, text }, index) => {
                const Icon = WORK_ICONS[visualSlot % WORK_ICONS.length] || WORK_ICONS[0];
                return (
                  <li key={index} className="about-work-step">
                    <CardIcon><Icon /></CardIcon>
                    <div><h3>{title}</h3><p><AboutText text={text} linkState={linkState} /></p></div>
                  </li>
                );
              })}
            </ol>
          )}
          {work.payment && <p className="about-payment"><AboutText text={work.payment} linkState={linkState} /></p>}
        </section>
      );
      case 'aboutProjects': return (
        <section key={section} className="about-section" aria-labelledby="about-projects">
          <h2 id="about-projects">{projects.title}</h2>
          <div className="about-prose">{paragraphs(projects.paragraphs)}</div>
          {projects.items.length > 0 && (
            <div className="about-projects">
              {projects.items.map(({ title, text, href, linkLabel }, index) => (
                <div key={index} className="about-project">
                  <h3>{title}</h3>
                  <p><AboutText text={text} linkState={linkState} /></p>
                  {href && linkLabel && <Link to={href} state={linkState} aria-label={linkLabel + ': ' + title}>{linkLabel} <ArrowRight size={17} aria-hidden="true" /></Link>}
                </div>
              ))}
            </div>
          )}
          {projects.button && <Link className="about-text-link" to="/cases/" state={linkState}>{projects.button} <ArrowRight size={18} aria-hidden="true" /></Link>}
        </section>
      );
      case 'aboutFocus': return (
        <section key={section} className="about-section about-prose" aria-labelledby="about-focus">
          <h2 id="about-focus">{focus.title}</h2>
          {paragraphs(focus.paragraphs)}
        </section>
      );
      case 'aboutExtra': return extra.items.map(({ title, text }, index) => (
        <section key={section + index} className="about-section about-prose">
          <h2>{title}</h2>
          {paragraphs(text.split(/\n\s*\n/).filter(Boolean))}
        </section>
      ));
      case 'aboutInvitation': return (
        <section key={section} className="about-section about-contact" aria-labelledby="about-contact">
          <h2 id="about-contact">{invitation.title}</h2>
          <p><AboutText text={invitation.text} linkState={linkState} /></p>
          {invitation.button && <Link className="about-contact-link" to="/#contact">{invitation.button} <ArrowRight size={18} aria-hidden="true" /></Link>}
        </section>
      );
    }
  };

  return (
    <main className={'about-page marketing-typography' + (previewSection ? ' about-preview' : '')}>
      <div className="about-wrap">
        {!previewSection && <PageNav className="about-page-nav" crumbs={[{ label: 'Главная', to: '/' }, { label: intro.title }]} />}
        {previewSection
          ? renderSection(previewSection as AboutSection)
          : order.filter((section): section is AboutSection => ABOUT_SECTIONS.includes(section as AboutSection))
            .filter((section) => section === 'aboutIntro' || !content.hiddenSections?.includes(section))
            .map(renderSection)}
      </div>
    </main>
  );
}

export default function AboutPage() {
  const content = useSiteContent(ABOUT_CONTENT_KEY, ABOUT_DEFAULTS);

  return (
    <>
      <SEO title={content.seo.title} description={content.seo.description} url="/about/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify({ ...ABOUT_PROFILE, name: content.seo.title }).replace(/</g, '\\u003c'),
      }} />
      <Navbar variant="content" />
      <AboutBody content={content} />
      <ClientOnly><Suspense fallback={null}><Footer /></Suspense></ClientOnly>
    </>
  );
}
