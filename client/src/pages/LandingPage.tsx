import { useEffect, useState } from "react";
import { supa } from "@/lib/supabase";
import { Zap, Brain, Building2 } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import teaimLogo from "@/assets/teaim-logo.svg";
import teaimHero from "@/assets/teaim-hero.svg";

export default function LandingPage() {
  const [authed, setAuthed] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    supa.auth.getSession().then(s => {
      const hasSession = !!s.data.session;
      setAuthed(hasSession);
      if (hasSession) {
        const savedProjectId = localStorage.getItem("projectId");
        setProjectId(savedProjectId);
      }
    });
  }, []);

  const nextLink = authed && projectId
    ? `/projects/${projectId}/dashboard`
    : (authed ? "/getting-started" : "/login");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    
    // TODO: Hook to Brevo/Mailchimp API
    // For now, just log the submission
    console.log("Contact form submission:", formData);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setSubmitted(true);
    setSubmitting(false);
    setFormData({ name: "", email: "", message: "" });
    
    setTimeout(() => setSubmitted(false), 3000);
  }

  return (
    <div className="min-h-screen brand-hero">
      <PublicNav authed={authed} nextLink={nextLink} />
      <main className="relative overflow-hidden">
        {/* Hero Section */}
        <section id="hero" className="relative teaim-hero text-foreground">
          <div className="teaim-grid-pattern" aria-hidden />
          <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col items-center justify-center gap-8 px-6 py-24 text-center">
            <img
              src={teaimHero}
              alt="TEAIM hero logo"
              className="h-20 w-auto teaim-fade-in drop-shadow-xl"
            />
            <div className="space-y-6">
              <h1
                className="text-balance text-4xl font-extrabold leading-tight text-[var(--text-strong)] sm:text-5xl lg:text-6xl teaim-fade-in-up teaim-delay-150"
                data-testid="heading-landing"
              >
                TEAIM — AI in Your Team. Power in Your Project.
              </h1>
              <p className="mx-auto max-w-2xl text-lg text-muted-foreground teaim-fade-in-up teaim-delay-300">
                A project management operating system that listens to meetings, reads the docs, and automates delivery with neon-fast accountability.
                We’re inviting a <span className="font-semibold text-[var(--accent)]">small cohort of enterprise teams</span> into our private beta.
              </p>
            </div>
            <div className="mt-2 flex w-full flex-col items-center justify-center gap-4 sm:flex-row teaim-fade-in-up teaim-delay-450">
              <a href="#beta" className="teaim-cta w-full sm:w-auto" data-testid="link-request-beta">
                Request Beta Access
              </a>
              <a href="#contact" className="teaim-cta-ghost w-full sm:w-auto" data-testid="link-talk-to-us">
                Talk to Us
              </a>
            </div>
          </div>
        </section>

        {/* Three Value Props */}
        <section
          className="py-20"
          style={{ background: "color-mix(in srgb, var(--card) 92%, rgba(108, 76, 255, 0.06))" }}
        >
          <div className="mx-auto grid max-w-5xl gap-8 px-6 text-center md:grid-cols-3">
            <div className="teaim-fade-in-up teaim-delay-150" data-testid="value-prop-automated">
              <div className="flex justify-center mb-3">
                <Zap className="h-8 w-8 text-[var(--accent)]" />
              </div>
              <h3 className="text-xl font-semibold">Semi-Automated Delivery</h3>
              <p className="mt-3 text-muted-foreground">TEAIM converts meeting noise into actions, docs into scripts, and timelines into forecasts.</p>
            </div>
            <div className="teaim-fade-in-up teaim-delay-300" data-testid="value-prop-predictive">
              <div className="flex justify-center mb-3">
                <Brain className="h-8 w-8 text-[var(--accent)]" />
              </div>
              <h3 className="text-xl font-semibold">Predictive Intelligence</h3>
              <p className="mt-3 text-muted-foreground">AI surfaces risks and dependencies before they derail your project.</p>
            </div>
            <div className="teaim-fade-in-up teaim-delay-450" data-testid="value-prop-enterprise">
              <div className="flex justify-center mb-3">
                <Building2 className="h-8 w-8 text-[var(--accent)]" />
              </div>
              <h3 className="text-xl font-semibold">Enterprise-Ready</h3>
              <p className="mt-3 text-muted-foreground">Governance, sign-offs, and reporting designed for Workday today and SaaS tomorrow.</p>
            </div>
          </div>
        </section>

        {/* Beta CTA */}
        <section id="beta" className="py-20 bg-background">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="text-3xl font-bold teaim-fade-in-up">Limited Private Beta</h2>
            <p className="mt-4 text-lg text-muted-foreground teaim-fade-in-up teaim-delay-150">
              Join our <span className="font-semibold text-[var(--accent)]">invite-only early access</span> program and help shape the future of AI-powered project management.
            </p>
            <div className="mt-8 teaim-fade-in-up teaim-delay-300">
              <a
                href={nextLink}
                className="teaim-cta w-full justify-center text-base sm:w-auto"
                data-testid="link-get-started"
              >
                {authed ? "Open App" : "Get Started"}
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground teaim-fade-in-up teaim-delay-450">No fluff. Real project outcomes in week 1.</p>
          </div>
        </section>

        {/* Contact Form */}
        <section
          id="contact"
          className="py-20"
          style={{ background: "color-mix(in srgb, var(--card) 92%, rgba(124, 251, 214, 0.08))" }}
        >
          <div className="mx-auto max-w-xl px-6 text-center">
            <h2 className="text-2xl font-bold teaim-fade-in-up">Let's talk</h2>
            <p className="mt-2 text-muted-foreground teaim-fade-in-up teaim-delay-150">Interested but not ready for beta? Leave your info and we'll keep you updated.</p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4 teaim-fade-in-up teaim-delay-300">
              <input
                type="text"
                placeholder="Your Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="teaim-input w-full"
                data-testid="input-contact-name"
              />
              <input
                type="email"
                placeholder="Work Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="teaim-input w-full"
                data-testid="input-contact-email"
              />
              <textarea
                placeholder="Your Message"
                rows={3}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="teaim-input w-full"
                data-testid="textarea-contact-message"
              />
              <button
                type="submit"
                disabled={submitting || submitted}
                className="teaim-cta w-full disabled:opacity-50"
                data-testid="button-contact-submit"
              >
                {submitting ? "Submitting..." : submitted ? "Submitted!" : "Submit"}
              </button>
            </form>
            {submitted && (
              <p className="mt-3 text-sm text-green-600 dark:text-green-400 teaim-fade-in">Thank you! We'll be in touch soon.</p>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function PublicNav({ authed, nextLink }: { authed: boolean; nextLink: string }) {
  return (
    <header className="teaim-nav sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-3" data-testid="link-logo">
          <img src={teaimLogo} alt="TEAIM" className="h-9 w-auto drop-shadow" />
          <span className="hidden text-lg font-semibold tracking-wide text-[var(--text-strong)] sm:inline">TEAIM.app</span>
        </a>
        <nav className="flex items-center gap-4 text-sm">
          <a className="opacity-80 hover:opacity-100" href="#beta" data-testid="link-nav-beta">Beta</a>
          <a className="opacity-80 hover:opacity-100" href="#contact" data-testid="link-nav-contact">Contact</a>
          {authed && <a className="opacity-80 hover:opacity-100" href={nextLink} data-testid="link-nav-open-app">Open App</a>}
          <a
            href={authed ? nextLink : "/login"}
            className="teaim-cta-ghost text-sm"
            data-testid="button-nav-signin"
          >
            {authed ? "Open App" : "Sign in"}
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="teaim-footer border-t border-border py-10 text-center text-sm text-muted-foreground">
      <div className="mb-5 flex justify-center">
        <img src={teaimLogo} alt="TEAIM mark" className="h-10 w-auto drop-shadow" />
      </div>
      <p className="text-[var(--text-soft)]">© {new Date().getFullYear()} TEAIM.app — The AI-powered PMOS</p>
      <div className="mt-3 flex items-center justify-center gap-6 text-sm">
        <a
          href="https://www.linkedin.com/company/teaim-app"
          target="_blank"
          rel="noopener noreferrer"
          className="transition hover:text-[var(--accent)]"
          data-testid="link-linkedin"
        >
          LinkedIn
        </a>
        <a
          href="mailto:info@teaim.app"
          className="transition hover:text-[var(--accent)]"
          data-testid="link-email"
        >
          info@teaim.app
        </a>
      </div>
    </footer>
  );
}
