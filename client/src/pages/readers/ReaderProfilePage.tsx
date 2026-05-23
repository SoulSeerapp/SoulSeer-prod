import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ToastProvider';
import { apiService } from '../../services/api';
import {
  Button,
  Badge,
  StatusBadge,
  StarRating,
  LoadingPage,
  EmptyState,
} from '../../components/ui';
import type { ReaderPublic, Review, ReadingType } from '../../types';

/* ── Helpers ────────────────────────────────────────────────── */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ── Reader Profile Page ────────────────────────────────────── */
export function ReaderProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, login } = useAuth();
  const { addToast } = useToast();

  const [reader, setReader] = useState<ReaderPublic | null>(null);
  const [reviews, setReviews] = useState<(Review & { clientName?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingType, setStartingType] = useState<ReadingType | null>(null);

  /* ── Fetch reader data ── */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const readerData = await apiService.get<ReaderPublic & { reviews?: (Review & { clientName?: string })[] }>(`/api/readers/${id}`);
        if (!cancelled) {
          const { reviews: reviewData, ...readerOnly } = readerData;
          setReader(readerOnly as ReaderPublic);
          setReviews(reviewData || []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load reader');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  /* ── Start reading handler ── */
  const handleStartReading = useCallback(
    async (type: ReadingType) => {
      if (!isAuthenticated) {
        login();
        return;
      }

      if (!user) return;

      // Minimum $5 balance check
      if (user.balance < 500) {
        addToast('warning', 'You need at least $5.00 in your account to start a reading.');
        navigate('/dashboard');
        return;
      }

      setStartingType(type);
      try {
        const reading = await apiService.post<{ id: number }>('/api/readings/on-demand', {
          readerId: reader?.id,
          readingType: type,
        });
        navigate(`/reading/${reading.id}`);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to start reading');
      } finally {
        setStartingType(null);
      }
    },
    [isAuthenticated, user, login, reader, navigate, addToast]
  );

  /* ── Loading / Error ── */
  if (isLoading) return <LoadingPage message="Loading reader profile..." />;

  if (error || !reader) {
    return (
      <div className="page-enter">
        <div className="container">
          <EmptyState
            icon="🔮"
            title="Reader Not Found"
            description={error || 'This reader profile could not be loaded.'}
            action={{ label: 'Browse Readers', onClick: () => navigate('/readers') }}
          />
        </div>
      </div>
    );
  }

  const name = reader.fullName || reader.username || 'Reader';
  const specialties = reader.specialties
    ? reader.specialties.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="page-enter">
      <div className="container container--narrow">
        {/* ── Back Link ──────────────────────────────── */}
        <div className="section" style={{ paddingBottom: 0 }}>
          <Link to="/readers" className="btn btn--ghost btn--sm">
            ← Back to Readers
          </Link>
        </div>

        {/* ── Profile Hero ───────────────────────────── */}
        <section className="section">
          <div className="card card--glow-gold card--pad-lg">
            <div className="profile-hero">
              <img
                src={reader.profileImage || ''}
                alt={`${name}'s profile photo`}
                className="profile-hero__image"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="flex flex-col gap-3">
                <h1 className="profile-hero__name">{name}</h1>
                <StatusBadge online={reader.isOnline} />
                {reader.avgRating !== undefined && reader.avgRating > 0 && (
                  <StarRating
                    value={reader.avgRating}
                    size="lg"
                    showValue
                    count={reader.reviewCount}
                  />
                )}
              </div>
            </div>

            {/* ── Bio ── */}
            {reader.bio && (
              <div className="flex flex-col gap-3" style={{ marginTop: 'var(--space-6)' }}>
                <h2 className="heading-4">About</h2>
                <p className="body-text">{reader.bio}</p>
              </div>
            )}

            {/* ── Specialties ── */}
            {specialties.length > 0 && (
              <div className="flex flex-col gap-3" style={{ marginTop: 'var(--space-5)' }}>
                <h2 className="heading-4">Specialties</h2>
                <div className="flex flex-wrap gap-2">
                  {specialties.map((s) => (
                    <Badge key={s} variant="gold" size="lg">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Rates & Start Reading ──────────────────── */}
        <section className="section">
          <div className="section-title">
            <h2 className="section-title__text">Reading Rates</h2>
            <div className="section-title__divider" />
          </div>
          <div className="profile-rates">
            {reader.pricingChat > 0 && (
              <div className="card card--interactive" onClick={() => handleStartReading('chat')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') handleStartReading('chat'); }}>
                <div className="profile-rate">
                  <span className="profile-rate__type">💬 Chat</span>
                  <span className="profile-rate__price">${(reader.pricingChat / 100).toFixed(2)}/min</span>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={startingType === 'chat'}
                    disabled={!reader.isOnline || startingType !== null}
                    className="btn--glow"
                    aria-label="Start chat reading"
                  >
                    {reader.isOnline ? 'Start Chat' : 'Offline'}
                  </Button>
                </div>
              </div>
            )}
            {reader.pricingVoice > 0 && (
              <div className="card card--interactive" onClick={() => handleStartReading('voice')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') handleStartReading('voice'); }}>
                <div className="profile-rate">
                  <span className="profile-rate__type">🎙️ Voice</span>
                  <span className="profile-rate__price">${(reader.pricingVoice / 100).toFixed(2)}/min</span>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={startingType === 'voice'}
                    disabled={!reader.isOnline || startingType !== null}
                    className="btn--glow"
                    aria-label="Start voice reading"
                  >
                    {reader.isOnline ? 'Start Voice' : 'Offline'}
                  </Button>
                </div>
              </div>
            )}
            {reader.pricingVideo > 0 && (
              <div className="card card--interactive" onClick={() => handleStartReading('video')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') handleStartReading('video'); }}>
                <div className="profile-rate">
                  <span className="profile-rate__type">📹 Video</span>
                  <span className="profile-rate__price">${(reader.pricingVideo / 100).toFixed(2)}/min</span>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={startingType === 'video'}
                    disabled={!reader.isOnline || startingType !== null}
                    className="btn--glow"
                    aria-label="Start video reading"
                  >
                    {reader.isOnline ? 'Start Video' : 'Offline'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Reviews ────────────────────────────────── */}
        <section className="section">
          <div className="section-title">
            <h2 className="section-title__text">Client Reviews</h2>
            {reader.reviewCount !== undefined && reader.reviewCount > 0 && (
              <p className="section-title__sub">
                {reader.reviewCount} review{reader.reviewCount !== 1 ? 's' : ''}
              </p>
            )}
            <div className="section-title__divider" />
          </div>

          {reviews.length === 0 ? (
            <div className="card card--static text-center">
              <p className="body-text">No reviews yet. Be the first!</p>
            </div>
          ) : (
            <div className="card card--static">
              {reviews.map((review) => (
                <div key={review.id} className="review">
                  <div className="review__header">
                    <div className="flex flex-col gap-1">
                      <span className="review__author">
                        {review.clientName || `Client #${review.clientId}`}
                      </span>
                      <span className="review__date">{formatDate(review.createdAt)}</span>
                    </div>
                    <StarRating value={review.rating} size="sm" />
                  </div>
                  {review.review && (
                    <p className="review__text">&ldquo;{review.review}&rdquo;</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
