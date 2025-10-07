import { useEffect, useState } from "react";
import { supa } from "@/lib/supabase";
import { Zap, Brain, Building2 } from "lucide-react";

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
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav authed={authed} nextLink={nextLink} />
      <main>
        {/* Hero Section */}
        <section id="hero" className="relative bg-background text-foreground">
          <div className="mx-auto max-w-5xl px-6 py-24 text-center">
            <div className="mx-auto h-14 mb-8 flex items-center justify-center">
              <img src="/brand/logo.png" alt="TEAIM Logo" className="h-14" data-testid="img-logo" />
            </div>
            <h1 className="text-5xl font-extrabold leading-tight" data-testid="heading-landing">
              The <span className="emph">AI-powered Project Management Operating System</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              TEAIM learns from meetings, docs, and decisions to automate actions, flag risks, and deliver projects with precision. 
              We're inviting only a <span className="emph">select handful of teams</span> into our private beta.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="#beta" 
                className="px-6 py-3 rounded-xl bg-brand-orange text-black font-semibold hover:opacity-90"
                data-testid="link-request-beta"
              >
                Request Beta Access
              </a>
              <a 
                href="#contact" 
                className="px-6 py-3 rounded-xl border border-border hover:bg-accent"
                data-testid="link-talk-to-us"
              >
                Talk to Us
              </a>
            </div>
          </div>
        </section>

        {/* Three Value Props */}
        <section className="bg-accent/30 py-20">
          <div className="mx-auto max-w-5xl px-6 grid md:grid-cols-3 gap-8 text-center">
            <div data-testid="value-prop-automated">
              <div className="flex justify-center mb-3">
                <Zap className="h-8 w-8 text-brand-orange" />
              </div>
              <h3 className="text-xl font-semibold">Semi-Automated Delivery</h3>
              <p className="mt-3 text-muted-foreground">TEAIM converts meeting noise into actions, docs into scripts, and timelines into forecasts.</p>
            </div>
            <div data-testid="value-prop-predictive">
              <div className="flex justify-center mb-3">
                <Brain className="h-8 w-8 text-brand-orange" />
              </div>
              <h3 className="text-xl font-semibold">Predictive Intelligence</h3>
              <p className="mt-3 text-muted-foreground">AI surfaces risks and dependencies before they derail your project.</p>
            </div>
            <div data-testid="value-prop-enterprise">
              <div className="flex justify-center mb-3">
                <Building2 className="h-8 w-8 text-brand-orange" />
              </div>
              <h3 className="text-xl font-semibold">Enterprise-Ready</h3>
              <p className="mt-3 text-muted-foreground">Governance, sign-offs, and reporting designed for Workday today and SaaS tomorrow.</p>
            </div>
          </div>
        </section>

        {/* Beta CTA */}
        <section id="beta" className="py-20 bg-background">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="text-3xl font-bold">Limited Private Beta</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Join our <span className="emph">invite-only early access</span> program and help shape the future of AI-powered project management.
            </p>
            <div className="mt-8">
              <a 
                href={nextLink} 
                className="inline-block px-8 py-4 rounded-xl bg-brand-orange text-black font-semibold hover:opacity-90 text-lg"
                data-testid="link-get-started"
              >
                {authed ? "Open App" : "Get Started"}
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">No fluff. Real project outcomes in week 1.</p>
          </div>
        </section>

        {/* Contact Form */}
        <section id="contact" className="py-20 bg-accent/30">
          <div className="mx-auto max-w-xl px-6 text-center">
            <h2 className="text-2xl font-bold">Let's talk</h2>
            <p className="mt-2 text-muted-foreground">Interested but not ready for beta? Leave your info and we'll keep you updated.</p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <input 
                type="text" 
                placeholder="Your Name" 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full rounded-lg border border-border bg-background px-4 py-3"
                data-testid="input-contact-name"
              />
              <input 
                type="email" 
                placeholder="Work Email" 
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="w-full rounded-lg border border-border bg-background px-4 py-3"
                data-testid="input-contact-email"
              />
              <textarea 
                placeholder="Your Message" 
                rows={3}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-4 py-3"
                data-testid="textarea-contact-message"
              />
              <button 
                type="submit" 
                disabled={submitting || submitted}
                className="w-full px-6 py-3 rounded-xl bg-brand-orange text-black font-semibold hover:opacity-90 disabled:opacity-50"
                data-testid="button-contact-submit"
              >
                {submitting ? "Submitting..." : submitted ? "Submitted!" : "Submit"}
              </button>
            </form>
            {submitted && (
              <p className="mt-3 text-sm text-green-600 dark:text-green-400">Thank you! We'll be in touch soon.</p>
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
    <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo placeholder - replace with actual horizontal logo when available */}
        <a href="/" className="font-bold text-xl" data-testid="link-logo">
          <span className="text-brand-orange">TEAIM</span>.app
        </a>
        <nav className="flex items-center gap-4 text-sm">
          <a className="opacity-80 hover:opacity-100" href="#beta" data-testid="link-nav-beta">Beta</a>
          <a className="opacity-80 hover:opacity-100" href="#contact" data-testid="link-nav-contact">Contact</a>
          {authed && <a className="opacity-80 hover:opacity-100" href={nextLink} data-testid="link-nav-open-app">Open App</a>}
          <a href={authed ? nextLink : "/login"} className="px-3 py-1.5 rounded-xl border border-border hover:bg-accent" data-testid="button-nav-signin">
            {authed ? "Open App" : "Sign in"}
          </a>
        </nav>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
      <div className="mb-4 flex justify-center">
        {/* Icon logo placeholder - replace with actual icon logo when available */}
        <div className="h-8 w-8 rounded bg-brand-orange flex items-center justify-center text-black font-bold">
          T
        </div>
      </div>
      <p>© {new Date().getFullYear()} TEAIM.app — The AI-powered PMOS</p>
      <div className="mt-2 space-x-4">
        <a href="https://www.linkedin.com/company/teaim-app" target="_blank" rel="noopener noreferrer" className="hover:text-foreground" data-testid="link-linkedin">LinkedIn</a>
        <a href="mailto:info@teaim.app" className="hover:text-foreground" data-testid="link-email">info@teaim.app</a>
      </div>
    </footer>
  );
}
