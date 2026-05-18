// ============================================================
// Footer — Site-wide footer with celestial theme
// ============================================================

import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const footerLinks = [
  { to: '/about', label: 'About' },
  { to: '/help', label: 'Help' },
  { to: '/community', label: 'Community' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
] as const;

function Footer() {
  const year = new Date().getFullYear();
  const { isAuthenticated, user, login, logout } = useAuth();
  const isReader = user?.role === 'reader';
  const profilePath = isReader && user?.id ? `/readers/${user.id}` : null;

  return (
    <footer className="footer" role="contentinfo">
      <div className="footer__inner">
        <Link to="/" className="footer__brand" aria-label="SoulSeer Home">
          SoulSeer
        </Link>

        <nav aria-label="Footer navigation">
          <ul className="footer__links">
            {footerLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="footer__link">
                  {link.label}
                </Link>
              </li>
            ))}
            {isAuthenticated && user && (
              <li>
                <Link to={`/dashboard/${user.role}`} className="footer__link">
                  Dashboard
                </Link>
              </li>
            )}
            {profilePath && (
              <li>
                <Link to={profilePath} className="footer__link">
                  Profile
                </Link>
              </li>
            )}
            <li>
              {isAuthenticated ? (
                <button type="button" className="footer__link" onClick={() => logout()}>
                  Sign Out
                </button>
              ) : (
                <button type="button" className="footer__link" onClick={() => login()}>
                  Sign In
                </button>
              )}
            </li>
          </ul>
        </nav>

        <p className="footer__tagline">
          ✦ Where the cosmos meets clarity ✦
        </p>

        <p className="footer__copy">
          &copy; {year} SoulSeer. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export { Footer };
