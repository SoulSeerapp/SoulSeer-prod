import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ToastProvider';
import { useWebSocketEvent } from '../../hooks/useWebSocket';
import { apiService } from '../../services/api';
import { ChatTranscriptModal } from '../../components/ChatTranscriptModal';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  Input,
  Stat,
  Table,
  StarRating,
  LoadingPage,
  EmptyState,
} from '../../components/ui';
import type { Column } from '../../components/ui';
import type { Reading, Review } from '../../types';

interface PendingRequest {
  id: number;
  clientId: number;
  readingType: 'chat' | 'voice' | 'video';
  ratePerMinute: number;
  status: string;
  createdAt: string;
  clientName: string | null;
  clientUsername: string | null;
  clientAvatar: string | null;
}

/* ── Helpers ────────────────────────────────────────────────── */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/* ── Column Defs ────────────────────────────────────────────── */
function buildSessionColumns(
  onViewTranscript: (readingId: number) => void,
): Column<Reading & Record<string, unknown>>[] {
  return [
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (row) => formatDate(row.createdAt as string),
    },
    {
      key: 'readingType',
      header: 'Type',
      render: (row) => {
        const icons: Record<string, string> = { chat: '💬', voice: '🎙️', video: '📹' };
        const t = row.readingType as string;
        return `${icons[t] || ''} ${t.charAt(0).toUpperCase() + t.slice(1)}`;
      },
    },
    {
      key: 'clientName',
      header: 'Client',
      render: (row) => (row.clientName as string) || `Client #${row.clientId}`,
    },
    {
      key: 'durationSeconds',
      header: 'Duration',
      render: (row) => formatDuration(row.durationSeconds as number),
    },
    {
      key: 'readerEarned',
      header: 'Earned',
      sortable: true,
      render: (row) => (
        <span className="price price--positive">
          +{centsToDisplay(row.readerEarned as number)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className={`badge badge--${row.status === 'completed' ? 'gold' : 'info'}`}>
          {(row.status as string).charAt(0).toUpperCase() + (row.status as string).slice(1)}
        </span>
      ),
    },
    {
      key: 'transcript',
      header: '',
      render: (row) => {
        const type = row.readingType as string;
        if (type !== 'chat') return null;
        const id = row.id as number;
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewTranscript(id);
            }}
          >
            View transcript
          </Button>
        );
      },
    },
  ];
}

/* ── Reader Dashboard ───────────────────────────────────────── */
export function ReaderDashboard() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [isOnline, setIsOnline] = useState(user?.isOnline ?? false);
  const [toggling, setToggling] = useState(false);

  // Rates (in cents from server, display as dollars)
  const [chatRate, setChatRate] = useState(String((user?.pricingChat ?? 0) / 100));
  const [voiceRate, setVoiceRate] = useState(String((user?.pricingVoice ?? 0) / 100));
  const [videoRate, setVideoRate] = useState(String((user?.pricingVideo ?? 0) / 100));
  const [savingRates, setSavingRates] = useState(false);

  // Data
  const [sessions, setSessions] = useState<Reading[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [actingOnId, setActingOnId] = useState<number | null>(null);

  // Chat transcript viewer
  const [transcriptReadingId, setTranscriptReadingId] = useState<number | null>(null);
  const sessionColumns = buildSessionColumns((id) => setTranscriptReadingId(id));

  /* ── Load data ── */
  const loadPending = useCallback(async () => {
    try {
      const data = await apiService.get<PendingRequest[]>('/api/readings/reader/pending');
      setPendingRequests(data);
    } catch {
      /* best effort */
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [sessionData, readerData] = await Promise.all([
          apiService.get<Reading[]>('/api/readings/reader'),
          apiService.get<{ reviews?: Review[] }>(`/api/readers/${user?.id}`).catch(() => ({ reviews: [] })),
        ]);
        setSessions(sessionData);
        setReviews(readerData.reviews || []);
        await loadPending();
      } catch {
        addToast('error', 'Failed to load dashboard data');
      } finally {
        setLoadingData(false);
      }
    }
    if (user) load();
  }, [user, addToast, loadPending]);

  /* ── Real-time: new incoming request ── */
  useWebSocketEvent<{ readingId: number; clientName?: string }>(
    'reading:new_request',
    useCallback(
      (p) => {
        addToast('info', `New reading request from ${p.clientName ?? 'a client'}`);
        loadPending();
      },
      [addToast, loadPending],
    ),
  );

  /* ── Real-time: request accepted ── */
  useWebSocketEvent<{ readingId: number }>(
    'reading:accepted',
    useCallback(
      () => {
        // Only navigate if we were the one who accepted, or to just clear the UI
        loadPending();
      },
      [loadPending],
    ),
  );

  /* ── Accept request ── */
  const handleAccept = useCallback(
    async (readingId: number) => {
      setActingOnId(readingId);
      try {
        await apiService.post(`/api/readings/${readingId}/accept`);
        setPendingRequests((prev) => prev.filter((r) => r.id !== readingId));
        navigate(`/reading/${readingId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to accept request';
        addToast('error', msg);
      } finally {
        setActingOnId(null);
      }
    },
    [addToast, navigate],
  );

  /* ── Decline request ── */
  const handleDecline = useCallback(
    async (readingId: number) => {
      setActingOnId(readingId);
      try {
        await apiService.post(`/api/readings/${readingId}/decline`);
        setPendingRequests((prev) => prev.filter((r) => r.id !== readingId));
        addToast('info', 'Request declined');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to decline request';
        addToast('error', msg);
      } finally {
        setActingOnId(null);
      }
    },
    [addToast],
  );

  /* ── Toggle online/offline ── */
  const handleToggle = useCallback(async () => {
    setToggling(true);
    try {
      const newStatus = !isOnline;
      await apiService.patch('/api/me/online', { isOnline: newStatus });
      setIsOnline(newStatus);
      addToast('success', newStatus ? 'You are now Online! ✨' : 'You are now Offline');
      if (refreshUser) refreshUser();
    } catch {
      addToast('error', 'Failed to update status');
    } finally {
      setToggling(false);
    }
  }, [isOnline, addToast, refreshUser]);

  /* ── Save rates (convert dollars to cents) ── */
  const handleSaveRates = useCallback(async () => {
    setSavingRates(true);
    try {
      await apiService.patch('/api/me/pricing', {
        pricingChat: Math.round((parseFloat(chatRate) || 0) * 100),
        pricingVoice: Math.round((parseFloat(voiceRate) || 0) * 100),
        pricingVideo: Math.round((parseFloat(videoRate) || 0) * 100),
      });
      addToast('success', 'Rates updated successfully');
      if (refreshUser) refreshUser();
    } catch {
      addToast('error', 'Failed to update rates');
    } finally {
      setSavingRates(false);
    }
  }, [chatRate, voiceRate, videoRate, addToast, refreshUser]);

  if (!user) return <LoadingPage message="Loading dashboard..." />;

  // Earnings calculations (all in cents)
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEarnings = completedSessions
    .filter((s) => s.createdAt.startsWith(todayStr))
    .reduce((sum, s) => sum + s.readerEarned, 0);
  const totalEarnings = completedSessions.reduce((sum, s) => sum + s.readerEarned, 0);
  const pendingBalance = user.balance;
  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  return (
    <div className="page-enter">
      <div className="container">
        <section className="section section--hero">
          <h1 className="heading-2">Reader Dashboard</h1>
          <p className="hero__tagline">{user.fullName || user.username || 'Reader'}</p>
          <div className="divider" />
        </section>

        {/* ── Online Toggle ──────────────────────────── */}
        <section className="section">
          <Card variant={isOnline ? 'glow-pink' : 'elevated'}>
            <CardBody>
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="heading-4">Availability</h2>
                  <p className="caption">
                    {isOnline
                      ? 'You are visible to clients and can receive reading requests.'
                      : 'You are hidden from clients. Toggle on to start accepting readings.'}
                  </p>
                </div>
                <button
                  className="toggle"
                  onClick={handleToggle}
                  disabled={toggling}
                  role="switch"
                  aria-checked={isOnline}
                  aria-label={`Toggle availability — currently ${isOnline ? 'online' : 'offline'}`}
                >
                  <div className={`toggle__track ${isOnline ? 'toggle__track--active' : ''}`}>
                    <div className="toggle__thumb" />
                  </div>
                  <span className={`toggle__label ${isOnline ? 'toggle__label--online' : 'toggle__label--offline'}`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </button>
              </div>
            </CardBody>
          </Card>
        </section>

        {/* ── Incoming Requests Inbox ────────────────── */}
        <section className="section">
          <h2 className="heading-3">
            Incoming Requests
            {pendingRequests.length > 0 && (
              <Badge variant="pink" size="sm" style={{ marginLeft: 'var(--space-2)' }}>
                {pendingRequests.length}
              </Badge>
            )}
          </h2>
          {pendingRequests.length === 0 ? (
            <EmptyState
              icon="📭"
              title="No pending requests"
              description={
                isOnline
                  ? 'You will be notified here when a client requests a reading.'
                  : 'Go online to start receiving reading requests.'
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {pendingRequests.map((req) => {
                const typeLabel =
                  req.readingType.charAt(0).toUpperCase() + req.readingType.slice(1);
                const icon =
                  req.readingType === 'chat'
                    ? '💬'
                    : req.readingType === 'voice'
                      ? '🎙️'
                      : '📹';
                const displayName =
                  req.clientName || req.clientUsername || `Client #${req.clientId}`;
                return (
                  <Card key={req.id} variant="glow-pink" padding="sm">
                    <CardBody>
                      <div className="flex justify-between items-center gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={req.clientAvatar || undefined}
                            name={displayName}
                            size="md"
                          />
                          <div>
                            <h4 className="heading-5">{displayName}</h4>
                            <p className="caption">
                              {icon} {typeLabel} · {centsToDisplay(req.ratePerMinute)}/min
                              {' · '}
                              {new Date(req.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDecline(req.id)}
                            disabled={actingOnId === req.id}
                          >
                            Decline
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleAccept(req.id)}
                            disabled={actingOnId === req.id}
                          >
                            {actingOnId === req.id ? 'Accepting…' : 'Accept'}
                          </Button>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Stats ──────────────────────────────────── */}
        <div className="grid grid--stats">
          <Stat label="Today's Earnings" value={centsToDisplay(todayEarnings)} icon="💰" />
          <Stat label="Pending Balance" value={centsToDisplay(pendingBalance)} icon="⏳" />
          <Stat label="Total Earned" value={centsToDisplay(totalEarnings)} icon="📊" />
          <Stat label="Avg Rating" value={avgRating > 0 ? avgRating.toFixed(1) : '—'} icon="⭐" />
        </div>

        {/* ── Rate Settings ──────────────────────────── */}
        <section className="section">
          <Card variant="static">
            <CardBody>
              <h2 className="heading-4">Per-Minute Rates</h2>
              <p className="caption" style={{ marginBottom: 'var(--space-4)' }}>
                Set your rates for each reading type. Changes take effect immediately.
              </p>
              <div className="grid grid--3">
                <Input
                  label="💬 Chat ($/min)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={chatRate}
                  onChange={(e) => setChatRate(e.target.value)}
                  placeholder="0.00"
                />
                <Input
                  label="🎙️ Voice ($/min)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={voiceRate}
                  onChange={(e) => setVoiceRate(e.target.value)}
                  placeholder="0.00"
                />
                <Input
                  label="📹 Video ($/min)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={videoRate}
                  onChange={(e) => setVideoRate(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex justify-end" style={{ marginTop: 'var(--space-4)' }}>
                <Button
                  variant="gold"
                  onClick={handleSaveRates}
                  loading={savingRates}
                >
                  Save Rates
                </Button>
              </div>
            </CardBody>
          </Card>
        </section>

        {/* ── Session History ────────────────────────── */}
        <section className="section">
          <h2 className="heading-3">Session History</h2>
          {loadingData ? (
            <LoadingPage message="Loading sessions..." />
          ) : completedSessions.length === 0 ? (
            <EmptyState
              icon="🔮"
              title="No Sessions Yet"
              description="Your completed reading sessions will appear here."
            />
          ) : (
            <Table
              columns={sessionColumns}
              data={completedSessions as (Reading & Record<string, unknown>)[]}
              keyExtractor={(row) => (row as Reading).id}
            />
          )}
        </section>

        {/* ── Reviews Received ───────────────────────── */}
        <section className="section">
          <h2 className="heading-3">Reviews Received</h2>
          {reviews.length === 0 ? (
            <EmptyState
              icon="⭐"
              title="No Reviews Yet"
              description="Reviews from your clients will appear here after readings."
            />
          ) : (
            <div className="card card--static">
              {reviews.map((review) => (
                <div key={review.id} className="review">
                  <div className="review__header">
                    <div className="flex flex-col gap-1">
                      <span className="review__author">
                        {review.clientName || `Client #${review.clientId}`}
                      </span>
                      <span className="review__date">{formatDate(review.completedAt)}</span>
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

        {/* ── Chat Transcript Modal ──────────────────── */}
        <ChatTranscriptModal
          readingId={transcriptReadingId}
          viewerUserId={user.id}
          readerName={user.fullName || user.username || 'You'}
          onClose={() => setTranscriptReadingId(null)}
        />
      </div>
    </div>
  );
}
