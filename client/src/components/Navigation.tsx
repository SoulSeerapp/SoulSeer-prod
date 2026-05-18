// ============================================================
// Navigation — Fixed nav with glass morphism, mobile menu
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui';

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/readers', label: 'Readers' },
  { to: '/community', label: 'Community' },
  { to: '/about', label: 'About' },
] as const;

function Navigation() {
  const { isAuthenticated, user, login, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Scroll detection for nav background
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on outside click
  const handleOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (
        mobileOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        toggleRef.current &&
        !toggleRef.current.contains(e.target as Node)
      ) {
        setMobileOpen(false);
      }
    },
    [mobileOpen]
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [handleOutsideClick]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nav__link ${isActive ? 'nav__link--active' : ''}`;

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `nav__mobile-link ${isActive ? 'nav__mobile-link--active' : ''}`;

  const isReader = user?.role === 'reader';
  const profilePath = isReader && user?.id ? `/readers/${user.id}` : null;

  return (
    <nav
      className={`nav ${scrolled ? 'nav--scrolled' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="nav__inner">
        {/* Brand */}
        <Link to="/" className="nav__brand" aria-label="SoulSeer Home">
          SoulSeer
        </Link>

        {/* Desktop links */}
        <ul className="nav__links">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={linkClass} end={item.to === '/'}>
                {item.label}
              </NavLink>
            </li>
          ))}
          {isAuthenticated && user && (
            <li>
              <NavLink to={`/dashboard/${user.role}`} className={linkClass}>
                Dashboard
              </NavLink>
            </li>
          )}
          {profilePath && (
            <li>
              <NavLink to={profilePath} className={linkClass}>
                Profile
              </NavLink>
            </li>
          )}
          <li>
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user?.fullName && (
                  <span className="nav__user-name">{user.fullName}</span>
                )}
                <Button variant="ghost" size="sm" onClick={() => logout()}>
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={() => login()}>
                Sign In
              </Button>
            )}
          </li>
        </ul>

        {/* Mobile toggle */}
        <button
          ref={toggleRef}
          className="nav__toggle"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-menu"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        ref={menuRef}
        id="mobile-nav-menu"
        className={`nav__mobile-menu ${mobileOpen ? 'nav__mobile-menu--open' : ''}`}
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={mobileLinkClass}
            end={item.to === '/'}
          >
            {item.label}
          </NavLink>
        ))}
        {isAuthenticated && user && (
          <NavLink to={`/dashboard/${user.role}`} className={mobileLinkClass}>
            Dashboard
          </NavLink>
        )}
        {profilePath && (
          <NavLink to={profilePath} className={mobileLinkClass}>
            Profile
          </NavLink>
        )}

        <div className="nav__mobile-auth">
          {isAuthenticated ? (
            <>
              {user?.fullName && (
                <p className="nav__mobile-user-name">
                  Signed in as {user.fullName}
                </p>
              )}
              <Button variant="ghost" fullWidth onClick={() => logout()}>
                Sign Out
              </Button>
            </>
          ) : (
            <Button variant="primary" fullWidth onClick={() => login()}>
              Sign In
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}

export { Navigation };
