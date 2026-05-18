import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';

/* ── Legal Policy Links ─────────────────────────────────────────
   Update each `href` with your Termly-generated document URL.
   ─────────────────────────────────────────────────────────────── */
const LEGAL_LINKS = [
  {
    icon: '🔒',
    title: 'Privacy Policy',
    description: 'How we collect, use, and protect your personal data and reading sessions.',
    href: '/privacy',
    internal: true,
  },
  {
    icon: '📜',
    title: 'Terms of Service',
    description: 'The rules and guidelines for using the SoulSeer platform as a client or reader.',
    href: '#', // TODO: replace with Termly Terms of Service URL
  },
  {
    icon: '🍪',
    title: 'Cookie Policy',
    description: 'Information about cookies we use, why we use them, and how to manage them.',
    href: '#', // TODO: replace with Termly Cookie Policy URL
  },
  {
    icon: '💰',
    title: 'Refund Policy',
    description: 'Our policy on refunds, account credits, and resolution of session disputes.',
    href: '#', // TODO: replace with Termly Refund Policy URL
  },
  {
    icon: '🤝',
    title: 'Reader Agreement',
    description: 'Terms, responsibilities, and guidelines for SoulSeer readers and practitioners.',
    href: '#', // TODO: replace with Termly Reader Agreement URL
  },
  {
    icon: '⚖️',
    title: 'Disclaimer',
    description: 'Important disclaimers about the nature of psychic readings and entertainment purposes.',
    href: '#', // TODO: replace with Termly Disclaimer URL
  },
] as const;

/* ── FAQ Data ───────────────────────────────────────────────── */
const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'How do I get started with a reading?',
    a: 'Browse our readers page, choose a reader whose specialties resonate with you, and click "Start Reading." You\'ll need to create an account and add a minimum of $5 to your balance before your first session.',
  },
  {
    q: 'What types of readings are available?',
    a: 'SoulSeer offers three types of live readings: Chat (text-based), Voice (audio call), and Video (face-to-face). Each reader sets their own per-minute rate for each type, so you can choose what fits your comfort level and budget.',
  },
  {
    q: 'How does billing work?',
    a: 'Readings are billed per minute at the reader\'s listed rate. Charges are deducted from your account balance in real time. You can top up your balance anytime from your dashboard with preset amounts or a custom amount (minimum $5).',
  },
  {
    q: 'Can I get a refund?',
    a: 'If you experience a technical issue during a reading, please contact our support team. We review each case individually and may issue account credits or refunds at our discretion.',
  },
  {
    q: 'Are the readings confidential?',
    a: 'Absolutely. All readings are private sessions between you and your reader. We do not record, monitor, or share any reading content. Your privacy is sacred to us.',
  },
  {
    q: 'What if my reader goes offline during a session?',
    a: 'If a reader disconnects unexpectedly, the session timer pauses automatically. You\'ll have the option to wait for reconnection or end the session. You are only charged for the time you were actively connected.',
  },
  {
    q: 'How do I become a reader on SoulSeer?',
    a: 'Download our Reader Application PDF below, or fill out the online form in the Reader Application section of this page. Our team reviews every application and will respond within 3–5 business days.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit and debit cards through our secure payment processor, Stripe. All transactions are encrypted and PCI-compliant.',
  },
];

/* ── Accordion Item ─────────────────────────────────────────── */
function AccordionItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`accordion__item ${isOpen ? 'accordion__item--open' : ''}`}>
      <button
        className="accordion__trigger"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`faq-${question.slice(0, 20).replace(/\s/g, '-')}`}
      >
        <span>{question}</span>
        <span className="accordion__chevron" aria-hidden="true">▼</span>
      </button>
      {isOpen && (
        <div
          className="accordion__content"
          id={`faq-${question.slice(0, 20).replace(/\s/g, '-')}`}
          role="region"
        >
          {answer}
        </div>
      )}
    </div>
  );
}

/* ── Reader Application Form ────────────────────────────────── */
type ReadingType = 'chat' | 'voice' | 'video';

interface AppForm {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  yearsExperience: string;
  specialties: string;
  readingTypes: Record<ReadingType, boolean>;
  rateRange: string;
  bio: string;
  whySoulSeer: string;
  socialLinks: string;
  agreeToTerms: boolean;
}

const EMPTY_FORM: AppForm = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  yearsExperience: '',
  specialties: '',
  readingTypes: { chat: false, voice: false, video: false },
  rateRange: '',
  bio: '',
  whySoulSeer: '',
  socialLinks: '',
  agreeToTerms: false,
};

function ReaderApplicationForm() {
  const [form, setForm] = useState<AppForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof AppForm, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const setReadingType = (type: ReadingType, checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      readingTypes: { ...prev.readingTypes, [type]: checked },
    }));

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      const selectedTypes = (Object.entries(form.readingTypes) as [ReadingType, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k);

      if (selectedTypes.length === 0) {
        setError('Please select at least one reading type.');
        return;
      }
      if (!form.agreeToTerms) {
        setError('Please agree to the Reader Agreement to submit.');
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/reader-applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, readingTypes: selectedTypes }),
        });
        if (!res.ok) throw new Error('Server error');
        setSubmitted(true);
      } catch {
        setError(
          'Submission failed. Please email your application directly to apply@soulseer.app'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [form]
  );

  if (submitted) {
    return (
      <div className="card card--static text-center reader-app-success">
        <div className="flex flex-col gap-4 items-center">
          <span className="empty-state__icon" aria-hidden="true">✨</span>
          <h3 className="heading-4" style={{ color: 'var(--accent-gold)' }}>
            Application Received!
          </h3>
          <p className="body-text" style={{ maxWidth: 480 }}>
            Thank you for applying to join the SoulSeer reader community. Our team will
            review your application and reach out within <strong>3–5 business days</strong>.
          </p>
          <p className="caption">
            Questions? Email us at{' '}
            <a href="mailto:apply@soulseer.app">apply@soulseer.app</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className="reader-app-form" onSubmit={handleSubmit} noValidate>
      {/* Row 1: Name + Email */}
      <div className="reader-app-form__grid">
        <div className="reader-app-form__field">
          <label className="reader-app-form__label" htmlFor="ra-name">
            Full Legal Name <span className="reader-app-form__required">*</span>
          </label>
          <input
            id="ra-name"
            type="text"
            className="form-input"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            required
            placeholder="Your full name"
          />
        </div>
        <div className="reader-app-form__field">
          <label className="reader-app-form__label" htmlFor="ra-email">
            Email Address <span className="reader-app-form__required">*</span>
          </label>
          <input
            id="ra-email"
            type="email"
            className="form-input"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            required
            placeholder="you@example.com"
          />
        </div>
      </div>

      {/* Row 2: Phone + Location */}
      <div className="reader-app-form__grid">
        <div className="reader-app-form__field">
          <label className="reader-app-form__label" htmlFor="ra-phone">
            Phone Number
          </label>
          <input
            id="ra-phone"
            type="tel"
            className="form-input"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="reader-app-form__field">
          <label className="reader-app-form__label" htmlFor="ra-location">
            City & State
          </label>
          <input
            id="ra-location"
            type="text"
            className="form-input"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="e.g. Austin, TX"
          />
        </div>
      </div>

      {/* Row 3: Years Experience + Rate Range */}
      <div className="reader-app-form__grid">
        <div className="reader-app-form__field">
          <label className="reader-app-form__label" htmlFor="ra-exp">
            Years of Experience as a Reader <span className="reader-app-form__required">*</span>
          </label>
          <input
            id="ra-exp"
            type="text"
            className="form-input"
            value={form.yearsExperience}
            onChange={(e) => set('yearsExperience', e.target.value)}
            required
            placeholder="e.g. 5 years"
          />
        </div>
        <div className="reader-app-form__field">
          <label className="reader-app-form__label" htmlFor="ra-rate">
            Desired Rate ($/min)
          </label>
          <input
            id="ra-rate"
            type="text"
            className="form-input"
            value={form.rateRange}
            onChange={(e) => set('rateRange', e.target.value)}
            placeholder="e.g. $1.50 – $3.00 / min"
          />
        </div>
      </div>

      {/* Specialties */}
      <div className="reader-app-form__field">
        <label className="reader-app-form__label" htmlFor="ra-specialties">
          Specialties <span className="reader-app-form__required">*</span>
        </label>
        <input
          id="ra-specialties"
          type="text"
          className="form-input"
          value={form.specialties}
          onChange={(e) => set('specialties', e.target.value)}
          required
          placeholder="e.g. Tarot, Mediumship, Astrology, Love & Relationships"
        />
        <p className="reader-app-form__hint">Separate multiple specialties with commas.</p>
      </div>

      {/* Reading Types */}
      <div className="reader-app-form__field">
        <span className="reader-app-form__label">
          Reading Types Offered <span className="reader-app-form__required">*</span>
        </span>
        <div className="reader-app-form__checkboxes">
          {(['chat', 'voice', 'video'] as ReadingType[]).map((type) => (
            <label key={type} className="reader-app-form__checkbox">
              <input
                type="checkbox"
                checked={form.readingTypes[type]}
                onChange={(e) => setReadingType(type, e.target.checked)}
              />
              <span style={{ textTransform: 'capitalize' }}>{type}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Bio */}
      <div className="reader-app-form__field">
        <label className="reader-app-form__label" htmlFor="ra-bio">
          About You <span className="reader-app-form__required">*</span>
        </label>
        <textarea
          id="ra-bio"
          className="form-input reader-app-form__textarea"
          value={form.bio}
          onChange={(e) => set('bio', e.target.value)}
          required
          placeholder="Tell us about your gifts, background, and experience as a reader... (min 50 characters)"
          rows={5}
        />
      </div>

      {/* Why SoulSeer */}
      <div className="reader-app-form__field">
        <label className="reader-app-form__label" htmlFor="ra-why">
          Why do you want to join SoulSeer? <span className="reader-app-form__required">*</span>
        </label>
        <textarea
          id="ra-why"
          className="form-input reader-app-form__textarea"
          value={form.whySoulSeer}
          onChange={(e) => set('whySoulSeer', e.target.value)}
          required
          placeholder="What draws you to our platform and community?"
          rows={4}
        />
      </div>

      {/* Social / Website */}
      <div className="reader-app-form__field">
        <label className="reader-app-form__label" htmlFor="ra-social">
          Website / Social Media Links
        </label>
        <input
          id="ra-social"
          type="text"
          className="form-input"
          value={form.socialLinks}
          onChange={(e) => set('socialLinks', e.target.value)}
          placeholder="Optional — website, Instagram, TikTok, etc."
        />
      </div>

      {/* Agree to Terms */}
      <label className="reader-app-form__checkbox reader-app-form__agree">
        <input
          type="checkbox"
          checked={form.agreeToTerms}
          onChange={(e) => set('agreeToTerms', e.target.checked)}
          required
        />
        <span>
          I have read and agree to the{' '}
          <a href="#legal" onClick={(e) => e.stopPropagation()}>
            Reader Agreement
          </a>{' '}
          and{' '}
          <a href="#legal" onClick={(e) => e.stopPropagation()}>
            Terms of Service
          </a>
          .
        </span>
      </label>

      {error && (
        <p className="reader-app-form__error" role="alert">
          {error}
        </p>
      )}

      <div className="reader-app-form__actions">
        <Button type="submit" variant="gold" size="lg" loading={submitting} disabled={submitting}>
          Submit Application
        </Button>
      </div>
    </form>
  );
}

/* ── Help Page ──────────────────────────────────────────────── */
export function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [showAppForm, setShowAppForm] = useState(false);

  const toggleItem = useCallback((index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  }, []);

  return (
    <div className="page-enter">
      <div className="container container--narrow">

        {/* ── Title ──────────────────────────────────── */}
        <section className="section section--hero section--cosmic">
          <h1 className="heading-1">Help Center</h1>
          <p className="hero__tagline">Everything you need to know about SoulSeer</p>
          <div className="divider" />
        </section>

        {/* ── How Readings Work ──────────────────────── */}
        <section className="section">
          <div className="section-title">
            <h2 className="section-title__text">How Readings Work</h2>
            <div className="section-title__divider" />
          </div>
          <div className="grid grid--3">
            <div className="card card--static">
              <div className="text-center flex flex-col gap-3 items-center">
                <span className="empty-state__icon" aria-hidden="true">1️⃣</span>
                <h3 className="heading-4">Choose a Reader</h3>
                <p className="body-text">
                  Browse our community of gifted psychics. Filter by specialty,
                  reading type, and see who is online right now.
                </p>
              </div>
            </div>
            <div className="card card--static">
              <div className="text-center flex flex-col gap-3 items-center">
                <span className="empty-state__icon" aria-hidden="true">2️⃣</span>
                <h3 className="heading-4">Fund Your Account</h3>
                <p className="body-text">
                  Add a minimum of $5 to your balance. Choose from preset amounts
                  or enter a custom amount that works for you.
                </p>
              </div>
            </div>
            <div className="card card--static">
              <div className="text-center flex flex-col gap-3 items-center">
                <span className="empty-state__icon" aria-hidden="true">3️⃣</span>
                <h3 className="heading-4">Start Your Reading</h3>
                <p className="body-text">
                  Connect instantly via chat, voice, or video. You&apos;re billed
                  per minute — end the session anytime you choose.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Legal & Policies ───────────────────────── */}
        <section className="section" id="legal">
          <div className="section-title">
            <h2 className="section-title__text">Legal & Policies</h2>
            <p className="section-title__sub">
              Our commitments to you — transparency, privacy, and fairness.
            </p>
            <div className="section-title__divider" />
          </div>
          <div className="grid grid--3">
            {LEGAL_LINKS.map((doc) => (
              <div key={doc.title} className="card card--static legal-card">
                <span className="legal-card__icon" aria-hidden="true">{doc.icon}</span>
                <h3 className="legal-card__title">{doc.title}</h3>
                <p className="legal-card__desc">{doc.description}</p>
                {doc.href === '#' ? (
                  <span className="legal-card__coming-soon">Coming Soon</span>
                ) : 'internal' in doc && doc.internal ? (
                  <Link
                    to={doc.href}
                    className="btn btn--sm btn--secondary"
                    aria-label={`View ${doc.title}`}
                  >
                    View Document
                  </Link>
                ) : (
                  <a
                    href={doc.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--sm btn--secondary"
                    aria-label={`View ${doc.title} (opens in new tab)`}
                  >
                    View Document ↗
                  </a>
                )}
              </div>
            ))}
          </div>
          <p className="text-center caption" style={{ marginTop: 'var(--space-4)' }}>
            All legal documents are hosted and managed via{' '}
            <a href="https://termly.io" target="_blank" rel="noopener noreferrer">
              Termly
            </a>
            . Links will be updated once documents are published.
          </p>
        </section>

        {/* ── FAQ ────────────────────────────────────── */}
        <section className="section">
          <div className="section-title">
            <h2 className="section-title__text">Frequently Asked Questions</h2>
            <div className="section-title__divider" />
          </div>
          <div className="accordion">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem
                key={i}
                question={item.q}
                answer={item.a}
                isOpen={openIndex === i}
                onToggle={() => toggleItem(i)}
              />
            ))}
          </div>
        </section>

        {/* ── Reader Application ─────────────────────── */}
        <section className="section section--cosmic" id="apply">
          <div className="section-title">
            <h2 className="section-title__text">Apply to Become a Reader</h2>
            <p className="section-title__sub">
              Share your gifts with a community of spiritual seekers. We welcome
              genuine psychics, tarot readers, mediums, and spiritual advisors.
            </p>
            <div className="section-title__divider" />
          </div>

          {/* Download PDF option */}
          <div className="reader-app-download card card--static">
            <div className="reader-app-download__inner">
              <div>
                <h3 className="heading-4" style={{ marginBottom: 'var(--space-2)' }}>
                  📄 Download Application PDF
                </h3>
                <p className="body-text">
                  Prefer to complete a PDF form? Download, fill it out, and email it to{' '}
                  <a href="mailto:apply@soulseer.app">apply@soulseer.app</a>.
                </p>
              </div>
              <a
                href="/SoulSeer_Reader_Application.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--secondary"
                aria-label="Download Reader Application PDF"
              >
                Download PDF
              </a>
            </div>
          </div>

          {/* Online form toggle */}
          <div style={{ textAlign: 'center', margin: 'var(--space-6) 0 var(--space-4)' }}>
            <div className="reader-app-divider">
              <span className="reader-app-divider__text">or apply online</span>
            </div>
          </div>

          {!showAppForm ? (
            <div className="text-center">
              <Button
                variant="primary"
                size="lg"
                onClick={() => setShowAppForm(true)}
              >
                Open Online Application
              </Button>
            </div>
          ) : (
            <div className="card card--static reader-app-form-wrapper">
              <h3 className="heading-4" style={{ marginBottom: 'var(--space-5)', textAlign: 'center' }}>
                Reader Application Form
              </h3>
              <ReaderApplicationForm />
            </div>
          )}
        </section>

        {/* ── Getting Started ────────────────────────── */}
        <section className="section section--cosmic">
          <div className="glass-card text-center">
            <h2 className="section-title__text">Ready to Begin?</h2>
            <p className="body-text" style={{ maxWidth: 500, margin: '0 auto' }}>
              Your spiritual journey awaits. Browse our community of gifted
              readers and connect with someone who resonates with your soul.
            </p>
            <div className="flex gap-4 justify-center" style={{ marginTop: 'var(--space-6)' }}>
              <Link to="/readers">
                <Button variant="primary" size="lg">Browse Readers</Button>
              </Link>
              <Link to="/about">
                <Button variant="secondary" size="lg">Learn More</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Contact ────────────────────────────────── */}
        <section className="section">
          <div className="section-title">
            <h2 className="section-title__text">Contact Us</h2>
            <div className="section-title__divider" />
          </div>
          <div className="card card--static text-center">
            <div className="flex flex-col gap-4 items-center">
              <p className="body-text">
                Can&apos;t find what you&apos;re looking for? Our support team is here to help.
              </p>
              <div className="flex flex-col gap-2">
                <p className="body-text">
                  <strong>General Support:</strong>{' '}
                  <a href="mailto:support@soulseer.app">support@soulseer.app</a>
                </p>
                <p className="body-text">
                  <strong>Reader Applications:</strong>{' '}
                  <a href="mailto:apply@soulseer.app">apply@soulseer.app</a>
                </p>
                <p className="body-text">
                  <strong>Hours:</strong> Monday – Friday, 9 AM – 9 PM EST
                </p>
              </div>
              <p className="caption">
                We typically respond within 24 hours. For urgent session issues,
                please include your reading ID in your message.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
