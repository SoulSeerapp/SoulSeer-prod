export function TermsOfServicePage() {
  return (
    <div className="page-enter">
      <div className="container container--narrow">
        <section className="section">
          <div className="card card--static" style={{ padding: 'var(--space-6)' }}>
            <h1 className="heading-2">Terms of Service</h1>
            <p className="caption" style={{ marginBottom: 'var(--space-6)' }}>
              Last updated: May 2024
            </p>

            <div className="prose">
              <p className="body-text">
                Welcome to SoulSeer. By accessing our website, platform, and services,
                you agree to be bound by these Terms of Service.
              </p>

              <h2 className="heading-4" style={{ marginTop: 'var(--space-6)' }}>
                1. Acceptance of Terms
              </h2>
              <p className="body-text">
                By creating an account or using any of our services, you confirm that you
                have read, understood, and agreed to these Terms. If you do not agree,
                you may not use the SoulSeer platform.
              </p>

              <h2 className="heading-4" style={{ marginTop: 'var(--space-6)' }}>
                2. User Eligibility
              </h2>
              <p className="body-text">
                You must be at least 18 years of age to use the SoulSeer platform. By
                creating an account, you represent and warrant that you are of legal age
                to form a binding contract.
              </p>

              <h2 className="heading-4" style={{ marginTop: 'var(--space-6)' }}>
                3. Services Description
              </h2>
              <p className="body-text">
                SoulSeer provides a platform connecting users with spiritual readers for
                entertainment purposes only. We do not guarantee the accuracy, relevance,
                or quality of any readings.
              </p>

              <h2 className="heading-4" style={{ marginTop: 'var(--space-6)' }}>
                4. Payments and Billing
              </h2>
              <p className="body-text">
                Users may add funds to their account balance, which can be used to pay
                for per-minute readings. All payments are final and non-refundable unless
                explicitly approved by SoulSeer administration.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
