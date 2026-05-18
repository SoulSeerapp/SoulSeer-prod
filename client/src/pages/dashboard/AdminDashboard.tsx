import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../components/ToastProvider';
import { ImageUploadField } from '../../components/ImageUploadField';
import { ChatTranscriptModal } from '../../components/ChatTranscriptModal';
import { apiService } from '../../services/api';
import {
  Button,
  Card,
  CardBody,
  Modal,
  Input,
  Textarea,
  Tabs,
  TabPanel,
  Table,
  SearchInput,
  Stat,
  LoadingPage,
  EmptyState,
} from '../../components/ui';
import type { Column } from '../../components/ui';
import type { User, Reading, Transaction, ForumPost } from '../../types';

interface ForumFlag {
  id: number;
  postId: number | null;
  commentId: number | null;
  reporterId: number;
  reason: string;
  resolved: boolean;
  createdAt: string;
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

/* ── Tabs definition ────────────────────────────────────────── */
const ADMIN_TABS = [
  { id: 'users', label: '👥 Users' },
  { id: 'create-reader', label: '➕ Create Reader' },
  { id: 'readings', label: '🔮 Readings' },
  { id: 'transactions', label: '💰 Transactions' },
  { id: 'moderation', label: '🛡️ Moderation' },
  { id: 'payouts', label: '💸 Payouts' },
];

/* ── Admin Dashboard ────────────────────────────────────────── */
export function AdminDashboard() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('users');

  // ── Data state ──
  const [users, setUsers] = useState<User[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [flags, setFlags] = useState<ForumFlag[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Search state ──
  const [userSearch, setUserSearch] = useState('');
  const [readingSearch, setReadingSearch] = useState('');

  // ── Create Reader Form ──
  const [crForm, setCrForm] = useState({
    fullName: '', email: '', username: '', bio: '',
    specialties: '', pricingChat: '', pricingVoice: '', pricingVideo: '',
    profileImage: '' as string,
  });
  const [crSubmitting, setCrSubmitting] = useState(false);
  // After a reader is created, show the one-time credentials + onboarding link.
  const [createdCreds, setCreatedCreds] = useState<null | {
    fullName: string;
    email: string;
    password: string;
    stripeOnboardingUrl: string;
  }>(null);

  // ── Edit Reader Modal ──
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    bio: '',
    specialties: '',
    profileImage: '' as string,
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ── Balance Adjustment Modal ──
  const [adjUser, setAdjUser] = useState<User | null>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  // ── Chat transcript viewer ──
  const [transcriptReadingId, setTranscriptReadingId] = useState<number | null>(null);

  // ── Provision test accounts ──
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provisionForm, setProvisionForm] = useState({
    adminPassword: '',
    readerPassword: '',
    clientPassword: '',
  });
  const [provisioning, setProvisioning] = useState(false);

  const handleProvisionTestAccounts = useCallback(async () => {
    if (
      !provisionForm.adminPassword ||
      !provisionForm.readerPassword ||
      !provisionForm.clientPassword
    ) {
      addToast('error', 'All three passwords are required');
      return;
    }
    setProvisioning(true);
    try {
      const res = await apiService.post<{
        ok: true;
        accounts: Array<{ email: string; role: string; auth0Created: boolean; dbAction: string }>;
      }>('/api/admin/provision-test-accounts', provisionForm);
      addToast(
        'success',
        `Provisioned ${res.accounts.length} accounts (${res.accounts.map((a) => a.role).join(', ')})`,
      );
      setProvisionOpen(false);
      const u = await apiService.get<User[]>('/api/admin/users');
      setUsers(u);
    } catch (err) {
      addToast(
        'error',
        err instanceof Error ? err.message : 'Failed to provision test accounts',
      );
    } finally {
      setProvisioning(false);
    }
  }, [provisionForm, addToast]);

  /* ── Load all data ── */
  useEffect(() => {
    async function loadAll() {
      try {
        const [u, r, t, p, f] = await Promise.all([
          apiService.get<User[]>('/api/admin/users'),
          apiService.get<Reading[]>('/api/admin/readings'),
          apiService.get<Transaction[]>('/api/admin/transactions'),
          apiService.get<ForumPost[]>('/api/admin/forum/posts').catch(() => []),
          apiService.get<ForumFlag[]>('/api/admin/forum/flagged').catch(() => []),
        ]);
        setUsers(u);
        setReadings(r);
        setTransactions(t);
        setForumPosts(p);
        setFlags(f);
      } catch {
        addToast('error', 'Failed to load admin data');
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [addToast]);

  /* ── Create Reader ── */
  const handleCreateReader = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crForm.fullName || !crForm.email) {
      addToast('error', 'Name and email are required');
      return;
    }
    setCrSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        fullName: crForm.fullName,
        email: crForm.email,
        pricingChat: Math.round((parseFloat(crForm.pricingChat) || 0) * 100),
        pricingVoice: Math.round((parseFloat(crForm.pricingVoice) || 0) * 100),
        pricingVideo: Math.round((parseFloat(crForm.pricingVideo) || 0) * 100),
      };
      if (crForm.username) payload.username = crForm.username;
      if (crForm.bio) payload.bio = crForm.bio;
      if (crForm.specialties) payload.specialties = crForm.specialties;
      if (crForm.profileImage) payload.profileImage = crForm.profileImage;

      const res = await apiService.post<{
        reader: User;
        credentials: { email: string; initialPassword: string };
        stripeOnboardingUrl: string;
      }>('/api/admin/readers', payload);

      setUsers((prev) => [...prev, res.reader]);
      addToast('success', `Reader "${crForm.fullName}" created!`);
      setCreatedCreds({
        fullName: crForm.fullName,
        email: res.credentials.email,
        password: res.credentials.initialPassword,
        stripeOnboardingUrl: res.stripeOnboardingUrl,
      });
      setCrForm({
        fullName: '', email: '', username: '', bio: '', specialties: '',
        pricingChat: '', pricingVoice: '', pricingVideo: '', profileImage: '',
      });
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to create reader');
    } finally {
      setCrSubmitting(false);
    }
  }, [crForm, addToast]);

  /* ── Edit Reader ── */
  const openEditModal = (u: User) => {
    setEditUser(u);
    setEditForm({
      fullName: u.fullName || '',
      bio: u.bio || '',
      specialties: u.specialties || '',
      profileImage: u.profileImage || '',
    });
  };

  const handleEditReader = useCallback(async () => {
    if (!editUser) return;
    setEditSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        fullName: editForm.fullName,
        bio: editForm.bio,
        specialties: editForm.specialties,
      };
      // Include profileImage when it changed. Empty string means "remove" → send null
      // so the server clears the field; truthy means "update" → send the new URL.
      const original = editUser.profileImage || '';
      const current = editForm.profileImage || '';
      if (current !== original) {
        payload.profileImage = current ? current : null;
      }
      await apiService.patch(`/api/admin/readers/${editUser.id}`, payload);
      setUsers((prev) =>
        prev.map((u) => (u.id === editUser.id ? { ...u, ...editForm } : u)),
      );
      addToast('success', 'Reader updated');
      setEditUser(null);
    } catch {
      addToast('error', 'Failed to update reader');
    } finally {
      setEditSubmitting(false);
    }
  }, [editUser, editForm, addToast]);

  /* ── Balance Adjustment ── */
  const openAdjModal = (u: User) => {
    setAdjUser(u);
    setAdjAmount('');
    setAdjReason('');
  };

  const handleAdjustBalance = useCallback(async () => {
    if (!adjUser || !adjAmount) return;
    const rawAmount = parseFloat(adjAmount);
    if (Number.isNaN(rawAmount)) {
      addToast('error', 'Invalid amount');
      return;
    }
    setAdjSubmitting(true);
    try {
      const amtCents = Math.round(rawAmount * 100);
      await apiService.post('/api/admin/balance-adjust', {
        userId: adjUser.id,
        amount: amtCents,
        note: adjReason,
      });
      setUsers((prev) => prev.map((u) =>
        u.id === adjUser.id ? { ...u, balance: u.balance + amtCents } : u
      ));
      addToast('success', `Balance adjusted by $${(amtCents / 100).toFixed(2)} for ${adjUser.fullName || adjUser.email}`);
      setAdjUser(null);
    } catch {
      addToast('error', 'Failed to adjust balance');
    } finally {
      setAdjSubmitting(false);
    }
  }, [adjUser, adjAmount, adjReason, addToast]);

  /* ── Forum Moderation ── */
  const handleDeletePost = useCallback(async (postId: number) => {
    try {
      await apiService.delete(`/api/admin/posts/${postId}`);
      setForumPosts((prev) => prev.filter((p) => p.id !== postId));
      addToast('success', 'Post deleted');
    } catch {
      addToast('error', 'Failed to delete post');
    }
  }, [addToast]);

  const handleTogglePostLock = useCallback(
    async (postId: number, isLocked: boolean) => {
      try {
        await apiService.patch(`/api/admin/posts/${postId}/lock`, { isLocked });
        setForumPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, isLocked } : p)),
        );
        addToast('success', isLocked ? 'Post locked' : 'Post unlocked');
      } catch {
        addToast('error', 'Failed to update post');
      }
    },
    [addToast],
  );

  const handleResolveFlag = useCallback(
    async (flagId: number) => {
      try {
        await apiService.patch(`/api/admin/flags/${flagId}/resolve`);
        setFlags((prev) => prev.filter((f) => f.id !== flagId));
        addToast('success', 'Flag resolved');
      } catch {
        addToast('error', 'Failed to resolve flag');
      }
    },
    [addToast],
  );

  /* ── Refund ── */
  const handleRefundReading = useCallback(
    async (readingId: number) => {
      const ok = window.confirm(
        `Refund reading #${readingId}? The client will be credited the full charge.`,
      );
      if (!ok) return;
      try {
        await apiService.post(`/api/admin/readings/${readingId}/refund`);
        setReadings((prev) =>
          prev.map((r) => (r.id === readingId ? { ...r, paymentStatus: 'refunded' } : r)),
        );
        addToast('success', 'Reading refunded');
        // Refresh transactions so the refund entry shows up.
        try {
          const t = await apiService.get<Transaction[]>('/api/admin/transactions');
          setTransactions(t);
        } catch {
          /* best effort */
        }
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Refund failed');
      }
    },
    [addToast],
  );

  /* ── Payout ── */
  const handlePayout = useCallback(async (userId: number) => {
    try {
      await apiService.post(`/api/admin/payouts/${userId}`);
      addToast('success', 'Payout initiated');
      // Refresh user data
      const u = await apiService.get<User[]>('/api/admin/users');
      setUsers(u);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to initiate payout');
    }
  }, [addToast]);

  /* ── Column Defs ── */
  const userColumns: Column<User & Record<string, unknown>>[] = [
    { key: 'id', header: 'ID', sortable: true },
    {
      key: 'fullName',
      header: 'Name',
      sortable: true,
      render: (row) => (row.fullName as string) || (row.email as string),
    },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <span className={`badge badge--${row.role === 'admin' ? 'pink' : row.role === 'reader' ? 'gold' : 'info'}`}>
          {(row.role as string).charAt(0).toUpperCase() + (row.role as string).slice(1)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      sortable: true,
      render: (row) => <span className="price">${((row.balance as number) / 100).toFixed(2)}</span>,
    },
    {
      key: 'isOnline',
      header: 'Status',
      render: (row) => (
        <span className={`badge badge--${row.isOnline ? 'online' : 'offline'}`}>
          {row.isOnline ? 'Online' : 'Offline'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          {row.role === 'reader' && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEditModal(row as unknown as User); }}>
              Edit
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openAdjModal(row as unknown as User); }}>
            Adjust $
          </Button>
        </div>
      ),
    },
  ];

  const readingColumns: Column<Reading & Record<string, unknown>>[] = [
    { key: 'id', header: 'ID', sortable: true },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (row) => formatDate(row.createdAt as string),
    },
    {
      key: 'readingType',
      header: 'Type',
      render: (row) => (row.readingType as string).charAt(0).toUpperCase() + (row.readingType as string).slice(1),
    },
    { key: 'clientId', header: 'Client', render: (row) => `#${row.clientId}` },
    { key: 'readerId', header: 'Reader', render: (row) => `#${row.readerId}` },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className={`badge badge--${row.status === 'completed' ? 'gold' : row.status === 'in_progress' ? 'online' : 'info'}`}>
          {(row.status as string).replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'durationSeconds',
      header: 'Duration',
      render: (row) => formatDuration(row.durationSeconds as number),
    },
    {
      key: 'totalCharged',
      header: 'Revenue',
      sortable: true,
      render: (row) => <span className="price">${((row.totalCharged as number) / 100).toFixed(2)}</span>,
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      render: (row) => {
        const s = row.paymentStatus as string;
        const variant = s === 'paid' ? 'gold' : s === 'refunded' ? 'pink' : 'info';
        return <span className={`badge badge--${variant}`}>{s}</span>;
      },
    },
    {
      key: 'transcript',
      header: '',
      render: (row) => {
        const status = row.status as string;
        if (row.readingType !== 'chat' || status !== 'completed') return null;
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setTranscriptReadingId(row.id as number);
            }}
          >
            Transcript
          </Button>
        );
      },
    },
    {
      key: 'refund',
      header: '',
      render: (row) => {
        const status = row.status as string;
        const paymentStatus = row.paymentStatus as string;
        const totalCharged = row.totalCharged as number;
        const canRefund =
          status === 'completed' && paymentStatus === 'paid' && totalCharged > 0;
        if (!canRefund) return null;
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleRefundReading(row.id as number);
            }}
          >
            Refund
          </Button>
        );
      },
    },
  ];

  const transactionColumns: Column<Transaction & Record<string, unknown>>[] = [
    { key: 'id', header: 'ID', sortable: true },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (row) => formatDate(row.createdAt as string),
    },
    { key: 'userId', header: 'User', render: (row) => `#${row.userId}` },
    {
      key: 'type',
      header: 'Type',
      render: (row) => {
        const labels: Record<string, string> = {
          topup: 'Top Up', reading_charge: 'Reading Charge',
          reader_payout: 'Payout', refund: 'Refund', admin_adjustment: 'Adjustment',
        };
        return labels[row.type as string] || row.type;
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      render: (row) => {
        const amt = row.amount as number;
        return (
          <span className={amt >= 0 ? 'price price--positive' : 'price price--negative'}>
            {amt >= 0 ? '+' : '-'}${(Math.abs(amt) / 100).toFixed(2)}
          </span>
        );
      },
    },
    {
      key: 'note',
      header: 'Description',
      render: (row) => (row.note as string) || '—',
    },
  ];

  if (loading) return <LoadingPage message="Loading admin dashboard..." />;

  // ── Computed stats ──
  const totalRevenue = readings.filter((r) => r.status === 'completed').reduce((s, r) => s + r.totalCharged, 0);
  const totalUsers = users.length;
  const readerCount = users.filter((u) => u.role === 'reader').length;
  const onlineReaders = users.filter((u) => u.role === 'reader' && u.isOnline).length;

  // ── Filtered data ──
  const filteredUsers = userSearch
    ? users.filter((u) =>
        (u.fullName || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users;

  const filteredReadings = readingSearch
    ? readings.filter((r) =>
        String(r.id).includes(readingSearch) ||
        String(r.clientId).includes(readingSearch) ||
        String(r.readerId).includes(readingSearch)
      )
    : readings;

  // ── Readers eligible for payout ($15 min) ──
  const payoutReaders = users.filter((u) => u.role === 'reader' && u.balance >= 1500);

  return (
    <div className="page-enter">
      <div className="container">
        <section className="section section--hero">
          <h1 className="heading-2">Admin Dashboard</h1>
          <div className="divider" />
        </section>

        {/* ── Stats ──────────────────────────────────── */}
        <div className="grid grid--stats">
          <Stat label="Total Users" value={totalUsers} icon="👥" />
          <Stat label="Readers" value={`${onlineReaders}/${readerCount}`} icon="🔮" />
          <Stat label="Total Revenue" value={`$${(totalRevenue / 100).toFixed(2)}`} icon="💰" />
          <Stat label="Total Readings" value={readings.length} icon="📊" />
        </div>

        {/* ── Tabs ───────────────────────────────────── */}
        <section className="section">
          <Tabs tabs={ADMIN_TABS} activeTab={activeTab} onChange={setActiveTab} />

          {/* ── Users Tab ── */}
          <TabPanel id="users" activeTab={activeTab}>
            <div className="flex flex-col gap-5" style={{ paddingTop: 'var(--space-5)' }}>
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <SearchInput
                  value={userSearch}
                  onChange={setUserSearch}
                  placeholder="Search users by name or email..."
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setProvisionForm({
                      adminPassword: '',
                      readerPassword: '',
                      clientPassword: '',
                    });
                    setProvisionOpen(true);
                  }}
                >
                  Provision Test Accounts
                </Button>
              </div>
              <Table
                columns={userColumns}
                data={filteredUsers as (User & Record<string, unknown>)[]}
                keyExtractor={(row) => (row as User).id}
                emptyMessage="No users found"
              />
            </div>
          </TabPanel>

          {/* ── Create Reader Tab ── */}
          <TabPanel id="create-reader" activeTab={activeTab}>
            <form
              className="flex flex-col gap-5"
              style={{ paddingTop: 'var(--space-5)' }}
              onSubmit={handleCreateReader}
            >
              <Card variant="static">
                <CardBody>
                  <h3 className="heading-4">Create New Reader</h3>
                  <div className="admin-form-grid" style={{ marginTop: 'var(--space-4)' }}>
                    <Input
                      label="Full Name"
                      required
                      value={crForm.fullName}
                      onChange={(e) => setCrForm((p) => ({ ...p, fullName: e.target.value }))}
                      placeholder="Jane Doe"
                    />
                    <Input
                      label="Email"
                      required
                      type="email"
                      value={crForm.email}
                      onChange={(e) => setCrForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="reader@soulseer.app"
                    />
                    <Input
                      label="Username"
                      value={crForm.username}
                      onChange={(e) => setCrForm((p) => ({ ...p, username: e.target.value }))}
                      placeholder="janedoe"
                    />
                    <Input
                      label="Specialties"
                      value={crForm.specialties}
                      onChange={(e) => setCrForm((p) => ({ ...p, specialties: e.target.value }))}
                      placeholder="Tarot, Medium, Clairvoyant"
                      help="Comma-separated"
                    />
                    <div className="form-group form-group--full">
                      <Textarea
                        label="Bio"
                        value={crForm.bio}
                        onChange={(e) => setCrForm((p) => ({ ...p, bio: e.target.value }))}
                        placeholder="Tell clients about this reader's gifts and experience..."
                      />
                    </div>
                    <div className="form-group form-group--full">
                      <ImageUploadField
                        label="Profile Image (optional)"
                        value={crForm.profileImage || null}
                        readerId="new"
                        onChange={(url) =>
                          setCrForm((p) => ({ ...p, profileImage: url ?? '' }))
                        }
                      />
                    </div>
                    <Input
                      label="Chat Rate ($/min)"
                      type="number"
                      step="0.01"
                      min="0"
                      value={crForm.pricingChat}
                      onChange={(e) => setCrForm((p) => ({ ...p, pricingChat: e.target.value }))}
                      placeholder="3.99"
                    />
                    <Input
                      label="Voice Rate ($/min)"
                      type="number"
                      step="0.01"
                      min="0"
                      value={crForm.pricingVoice}
                      onChange={(e) => setCrForm((p) => ({ ...p, pricingVoice: e.target.value }))}
                      placeholder="4.99"
                    />
                    <Input
                      label="Video Rate ($/min)"
                      type="number"
                      step="0.01"
                      min="0"
                      value={crForm.pricingVideo}
                      onChange={(e) => setCrForm((p) => ({ ...p, pricingVideo: e.target.value }))}
                      placeholder="5.99"
                    />
                  </div>
                  <div className="flex justify-end" style={{ marginTop: 'var(--space-5)' }}>
                    <Button type="submit" variant="primary" loading={crSubmitting}>
                      Create Reader Account
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </form>
          </TabPanel>

          {/* ── Readings Tab ── */}
          <TabPanel id="readings" activeTab={activeTab}>
            <div className="flex flex-col gap-5" style={{ paddingTop: 'var(--space-5)' }}>
              <SearchInput
                value={readingSearch}
                onChange={setReadingSearch}
                placeholder="Search by reading ID, client ID, or reader ID..."
              />
              <Table
                columns={readingColumns}
                data={filteredReadings as (Reading & Record<string, unknown>)[]}
                keyExtractor={(row) => (row as Reading).id}
                emptyMessage="No readings found"
              />
            </div>
          </TabPanel>

          {/* ── Transactions Tab ── */}
          <TabPanel id="transactions" activeTab={activeTab}>
            <div style={{ paddingTop: 'var(--space-5)' }}>
              <Table
                columns={transactionColumns}
                data={transactions as (Transaction & Record<string, unknown>)[]}
                keyExtractor={(row) => (row as Transaction).id}
                emptyMessage="No transactions found"
              />
            </div>
          </TabPanel>

          {/* ── Moderation Tab ── */}
          <TabPanel id="moderation" activeTab={activeTab}>
            <div className="flex flex-col gap-5" style={{ paddingTop: 'var(--space-5)' }}>
              {/* ── Flagged Content Queue ── */}
              <div className="flex flex-col gap-3">
                <h3 className="heading-4">
                  Flagged Content
                  {flags.length > 0 && (
                    <span className="badge badge--pink" style={{ marginLeft: 'var(--space-2)' }}>
                      {flags.length}
                    </span>
                  )}
                </h3>
                {flags.length === 0 ? (
                  <EmptyState
                    icon="🚩"
                    title="No open flags"
                    description="Community flags will appear here for review."
                  />
                ) : (
                  flags.map((f) => (
                    <Card key={f.id} variant="static" padding="sm">
                      <CardBody>
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex flex-col gap-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="badge badge--pink">
                                {f.postId ? `Post #${f.postId}` : f.commentId ? `Comment #${f.commentId}` : 'Unknown'}
                              </span>
                              <span className="caption">{formatDate(f.createdAt)}</span>
                            </div>
                            <p className="body-text">
                              <strong>Reason:</strong> {f.reason || '—'}
                            </p>
                            <p className="caption">Reported by user #{f.reporterId}</p>
                          </div>
                          <div className="flex gap-2">
                            {f.postId != null && (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeletePost(f.postId!)}
                              >
                                Delete post
                              </Button>
                            )}
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleResolveFlag(f.id)}
                            >
                              Resolve
                            </Button>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))
                )}
              </div>

              {/* ── All Forum Posts ── */}
              <div className="flex flex-col gap-3">
                <h3 className="heading-4">Forum Posts</h3>
                {forumPosts.length === 0 ? (
                  <EmptyState
                    icon="🛡️"
                    title="No Posts to Moderate"
                    description="Forum posts will appear here for moderation."
                  />
                ) : (
                  forumPosts.map((post) => (
                    <Card key={post.id} variant="static" padding="sm">
                      <CardBody>
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex flex-col gap-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="badge badge--gold">{post.category}</span>
                              <span className="caption">{formatDate(post.createdAt)}</span>
                              {post.isLocked && (
                                <span className="badge badge--info">🔒 Locked</span>
                              )}
                            </div>
                            <h4 className="forum-post__title">{post.title}</h4>
                            <p className="forum-post__body">{post.content.slice(0, 200)}…</p>
                            <p className="caption">
                              By {post.userName || `User #${post.userId}`} · {post.commentCount} comments
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleTogglePostLock(post.id, !post.isLocked)}
                            >
                              {post.isLocked ? 'Unlock' : 'Lock'}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeletePost(post.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabPanel>

          {/* ── Payouts Tab ── */}
          <TabPanel id="payouts" activeTab={activeTab}>
            <div className="flex flex-col gap-5" style={{ paddingTop: 'var(--space-5)' }}>
              <Card variant="static">
                <CardBody>
                  <h3 className="heading-4">Reader Payouts</h3>
                  <p className="caption" style={{ marginBottom: 'var(--space-4)' }}>
                    Readers with a balance of $15.00 or more are eligible for payout.
                  </p>
                  {payoutReaders.length === 0 ? (
                    <EmptyState
                      icon="💸"
                      title="No Eligible Readers"
                      description="No readers currently meet the $15 minimum payout threshold."
                    />
                  ) : (
                    <div className="flex flex-col gap-3">
                      {payoutReaders.map((reader) => (
                        <div key={reader.id} className="flex justify-between items-center gap-4" style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--border-subtle)' }}>
                          <div>
                            <p className="body-text"><strong>{reader.fullName || reader.email}</strong></p>
                            <p className="caption">Balance: <span className="price">${(reader.balance / 100).toFixed(2)}</span></p>
                          </div>
                          <Button
                            variant="gold"
                            size="sm"
                            onClick={() => handlePayout(reader.id)}
                          >
                            Initiate Payout
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </TabPanel>
        </section>

        {/* ── Edit Reader Modal ──────────────────────── */}
        <Modal
          open={!!editUser}
          onClose={() => setEditUser(null)}
          title={`Edit Reader: ${editUser?.fullName || ''}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleEditReader} loading={editSubmitting}>
                Save Changes
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Full Name"
              value={editForm.fullName}
              onChange={(e) => setEditForm((p) => ({ ...p, fullName: e.target.value }))}
            />
            <Textarea
              label="Bio"
              value={editForm.bio}
              onChange={(e) => setEditForm((p) => ({ ...p, bio: e.target.value }))}
            />
            <Input
              label="Specialties"
              value={editForm.specialties}
              onChange={(e) => setEditForm((p) => ({ ...p, specialties: e.target.value }))}
              help="Comma-separated"
            />
            <ImageUploadField
              label="Profile Image"
              value={editForm.profileImage || null}
              readerId={editUser?.id ?? 'new'}
              onChange={(url) =>
                setEditForm((p) => ({ ...p, profileImage: url ?? '' }))
              }
            />
          </div>
        </Modal>

        {/* ── Created Reader Credentials Modal (one-time) ─────────── */}
        <Modal
          open={!!createdCreds}
          onClose={() => setCreatedCreds(null)}
          title="Reader Account Created"
          footer={
            <Button variant="primary" onClick={() => setCreatedCreds(null)}>
              Done
            </Button>
          }
        >
          {createdCreds && (
            <div className="flex flex-col gap-4">
              <p className="body-text">
                Share these credentials with <strong>{createdCreds.fullName}</strong> securely.
                <br />
                <strong style={{ color: 'var(--color-primary, #FF69B4)' }}>
                  This password will not be shown again.
                </strong>
              </p>
              <div
                className="card"
                style={{ padding: 'var(--space-4)', background: 'rgba(255,255,255,0.04)' }}
              >
                <dl className="flex flex-col gap-2" style={{ margin: 0 }}>
                  <div className="flex justify-between items-center gap-3 flex-wrap">
                    <dt className="caption">Email</dt>
                    <dd style={{ margin: 0, fontFamily: 'ui-monospace, monospace' }}>
                      {createdCreds.email}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center gap-3 flex-wrap">
                    <dt className="caption">Temporary Password</dt>
                    <dd style={{ margin: 0, fontFamily: 'ui-monospace, monospace' }}>
                      {createdCreds.password}
                    </dd>
                  </div>
                </dl>
                <div className="flex gap-2 flex-wrap" style={{ marginTop: 'var(--space-3)' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `Email: ${createdCreds.email}\nTemporary Password: ${createdCreds.password}`,
                      );
                      addToast('success', 'Credentials copied to clipboard');
                    }}
                  >
                    Copy credentials
                  </Button>
                </div>
              </div>
              <div className="body-text">
                <p style={{ marginBottom: 'var(--space-2)' }}>
                  To receive payouts, the reader must complete their Stripe Connect onboarding:
                </p>
                <a
                  href={createdCreds.stripeOnboardingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="body-text"
                  style={{
                    wordBreak: 'break-all',
                    color: 'var(--color-primary, #FF69B4)',
                  }}
                >
                  {createdCreds.stripeOnboardingUrl}
                </a>
                <div className="flex gap-2" style={{ marginTop: 'var(--space-2)' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(createdCreds.stripeOnboardingUrl);
                      addToast('success', 'Onboarding link copied');
                    }}
                  >
                    Copy onboarding link
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* ── Balance Adjustment Modal ───────────────── */}
        <Modal
          open={!!adjUser}
          onClose={() => setAdjUser(null)}
          title={`Adjust Balance: ${adjUser?.fullName || adjUser?.email || ''}`}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setAdjUser(null)}>Cancel</Button>
              <Button variant="gold" onClick={handleAdjustBalance} loading={adjSubmitting}>
                Apply Adjustment
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="body-text">
              Current balance: <span className="price">${((adjUser?.balance ?? 0) / 100).toFixed(2)}</span>
            </p>
            <Input
              label="Amount"
              type="number"
              step="0.01"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              help="Use negative numbers to deduct"
              placeholder="10.00 or -5.00"
            />
            <Input
              label="Reason"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Reason for adjustment..."
              required
            />
          </div>
        </Modal>

        {/* ── Provision Test Accounts Modal ──────────── */}
        <Modal
          open={provisionOpen}
          onClose={() => setProvisionOpen(false)}
          title="Provision Test Accounts"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setProvisionOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleProvisionTestAccounts}
                loading={provisioning}
              >
                Provision
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="caption">
              Creates or updates the three QA accounts in Auth0 + DB:
              <br />
              admin <code>emilynnj14@gmail.com</code>, reader{' '}
              <code>emilynn992@gmail.com</code>, client{' '}
              <code>emily81292@gmail.com</code>.
            </p>
            <Input
              label="Admin password"
              type="password"
              value={provisionForm.adminPassword}
              onChange={(e) =>
                setProvisionForm((p) => ({ ...p, adminPassword: e.target.value }))
              }
            />
            <Input
              label="Reader password"
              type="password"
              value={provisionForm.readerPassword}
              onChange={(e) =>
                setProvisionForm((p) => ({ ...p, readerPassword: e.target.value }))
              }
            />
            <Input
              label="Client password"
              type="password"
              value={provisionForm.clientPassword}
              onChange={(e) =>
                setProvisionForm((p) => ({ ...p, clientPassword: e.target.value }))
              }
            />
          </div>
        </Modal>

        {/* ── Chat Transcript Modal ──────────────────── */}
        <ChatTranscriptModal
          readingId={transcriptReadingId}
          viewerUserId={-1}
          onClose={() => setTranscriptReadingId(null)}
        />
      </div>
    </div>
  );
}
