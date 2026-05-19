import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ToastProvider';
import { apiService } from '../../services/api';
import { Button, Card, CardBody, LoadingPage, Textarea, Badge } from '../../components/ui';

// Type representing a message from the API
interface ApiMessage {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  price: number;
  isRead: boolean;
  createdAt: string;
  receiver: {
    id: number;
    username: string | null;
    fullName: string | null;
    profileImage: string | null;
    role: string;
  };
  sender: {
    id: number;
    username: string | null;
    fullName: string | null;
    profileImage: string | null;
    role: string;
  };
}

export function MessagesPage() {
  const { user, isAuthenticated, login } = useAuth();
  const { addToast } = useToast();

  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Suppress unused error warning for simple UI
  if (error) console.error(error);

  // Selected conversation (userId of the other person)
  const [activeUserId, setActiveUserId] = useState<number | null>(null);

  // New message state
  const [newMessageContent, setNewMessageContent] = useState('');
  const [newMessagePrice, setNewMessagePrice] = useState('0');
  const [sending, setSending] = useState(false);
  const [unlockingId, setUnlockingId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch all messages on mount
  useEffect(() => {
    if (!isAuthenticated) {
      login();
      return;
    }

    async function fetchMessages() {
      try {
        setLoading(true);
        const data = await apiService.get<ApiMessage[]>('/api/messages');
        setMessages(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, [isAuthenticated, login]);

  // Set active user from URL if provided
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userIdParam = params.get('userId');
    if (userIdParam) {
      setActiveUserId(parseInt(userIdParam, 10));
    }
  }, []);

  // Group messages into conversations
  const conversations = useMemo(() => {
    if (!user) return [];

    const groups = new Map<number, { user: any; messages: ApiMessage[]; lastMessageAt: number }>();

    messages.forEach((msg) => {
      const isSender = msg.senderId === user.id;
      const otherUserId = isSender ? msg.receiverId : msg.senderId;

      if (!groups.has(otherUserId)) {
        // If we are the sender, we might not have the full receiver profile from the API
        // (API currently only populates sender). We can just use a placeholder or
        // if we are receiver, we have msg.sender.
        groups.set(otherUserId, {
          user: isSender ? msg.receiver : msg.sender,
          messages: [],
          lastMessageAt: 0,
        });
      }

      const group = groups.get(otherUserId)!;
      group.messages.push(msg);

      const msgTime = new Date(msg.createdAt).getTime();
      if (msgTime > group.lastMessageAt) {
        group.lastMessageAt = msgTime;
      }
    });

    // Sort by most recent
    return Array.from(groups.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }, [messages, user]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeUserId, messages]);

  const handleSendMessage = async () => {
    if (!activeUserId || !newMessageContent.trim()) return;

    setSending(true);
    try {
      let price = 0;
      if (user?.role === 'reader') {
        price = Math.round(parseFloat(newMessagePrice) * 100); // Convert to cents safely
        if (isNaN(price) || price < 0) price = 0;
      }

      const sentMsg = await apiService.post<ApiMessage>(`/api/messages/${activeUserId}`, {
        content: newMessageContent.trim(),
        price,
      });

      // Optimistically add to local state
      // Note: we don't have the full sender populated exactly as GET /api/messages,
      // but enough for our UI since we are the sender
      const localMsg: ApiMessage = {
        ...sentMsg,
        sender: {
          id: user!.id,
          username: user!.username || null,
          fullName: user!.fullName || null,
          profileImage: user!.profileImage || null,
          role: user!.role,
        },
        receiver: {
          id: activeUserId,
          username: activeUser?.username || null,
          fullName: activeUser?.fullName || null,
          profileImage: activeUser?.profileImage || null,
          role: activeUser?.role || "unknown",
        }
      };

      setMessages((prev) => [...prev, localMsg]);
      setNewMessageContent('');
      setNewMessagePrice('0');
      addToast('success', 'Message sent');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleUnlock = async (messageId: number) => {
    setUnlockingId(messageId);
    try {
      const res = await apiService.post<{ success: boolean; message: ApiMessage }>(`/api/messages/${messageId}/unlock`, {});

      // Update local message
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, isRead: true, content: res.message.content } : m));
      addToast('success', 'Message unlocked!');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to unlock message. Check your balance.');
    } finally {
      setUnlockingId(null);
    }
  };

  if (loading || !user) return <LoadingPage message="Loading messages..." />;

  const activeConversation = activeUserId ? conversations.find((c) => c.user.id === activeUserId) : null;

  // Create a placeholder conversation if starting a new chat from URL
  const activeMessages = activeConversation ? activeConversation.messages : [];
  const activeUser = activeConversation ? activeConversation.user : { id: activeUserId, fullName: `User #${activeUserId}` };

  return (
    <div className="page-enter">
      <div className="container">
        <section className="section section--hero" style={{ paddingBottom: 'var(--space-4)' }}>
          <h1 className="heading-2">Messages</h1>
          <div className="divider" />
        </section>

        <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', gap: 'var(--space-6)', minHeight: '600px' }}>
          {/* Sidebar - Conversation List */}
          <Card variant="static" style={{ height: '100%', overflowY: 'auto' }}>
            <CardBody>
              <h2 className="heading-4" style={{ marginBottom: 'var(--space-4)' }}>Conversations</h2>
              {conversations.length === 0 ? (
                <p className="body-text opacity-70">No messages yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {conversations.map((conv) => {
                    const isActive = activeUserId === conv.user.id;
                    const unreadCount = conv.messages.filter(m => m.receiverId === user.id && !m.isRead).length;

                    return (
                      <button
                        key={conv.user.id}
                        className={`btn btn--ghost ${isActive ? 'bg-surface-active' : ''}`}
                        style={{ justifyContent: 'flex-start', textAlign: 'left', position: 'relative' }}
                        onClick={() => setActiveUserId(conv.user.id)}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold">{conv.user.fullName || conv.user.username}</span>
                          <span className="caption opacity-70">
                            {new Date(conv.lastMessageAt).toLocaleDateString()}
                          </span>
                        </div>
                        {unreadCount > 0 && (
                          <Badge variant="pink" size="sm" style={{ position: 'absolute', right: '1rem' }}>
                            {unreadCount}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Main Panel - Chat View */}
          <Card variant="static" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {!activeUserId ? (
              <div className="flex items-center justify-center h-full">
                <p className="body-text opacity-70">Select a conversation to start messaging</p>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-white/10" style={{ padding: 'var(--space-4)' }}>
                  <h3 className="heading-4">{activeUser.fullName || activeUser.username}</h3>
                </div>

                <div className="flex-1 p-4 overflow-y-auto" style={{ padding: 'var(--space-4)', flex: 1, overflowY: 'auto' }}>
                  {activeMessages.length === 0 ? (
                    <p className="text-center opacity-70 my-8">Start the conversation...</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {activeMessages.map((msg) => {
                        const isMe = msg.senderId === user.id;
                        const isLocked = !isMe && msg.price > 0 && !msg.isRead;

                        return (
                          <div
                            key={msg.id}
                            style={{
                              alignSelf: isMe ? 'flex-end' : 'flex-start',
                              maxWidth: '80%',
                              background: isMe ? 'rgba(255, 105, 180, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${isMe ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)'}`,
                              padding: 'var(--space-3)',
                              borderRadius: 'var(--radius-md)',
                            }}
                          >
                            {isLocked ? (
                              <div className="flex flex-col items-center gap-3 p-4">
                                <span>🔒 Premium Message</span>
                                <Button
                                  variant="gold"
                                  size="sm"
                                  loading={unlockingId === msg.id}
                                  onClick={() => handleUnlock(msg.id)}
                                >
                                  Unlock for ${(msg.price / 100).toFixed(2)}
                                </Button>
                              </div>
                            ) : (
                              <p className="body-text" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                            )}
                            <div className="caption opacity-50 mt-2 text-right" style={{ fontSize: '0.7rem' }}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {isMe && msg.price > 0 && ` • Premium ($${(msg.price/100).toFixed(2)})`}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-white/10 flex flex-col gap-3" style={{ padding: 'var(--space-4)', marginTop: 'auto' }}>
                  <Textarea
                    placeholder="Type your message..."
                    value={newMessageContent}
                    onChange={(e) => setNewMessageContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={2}
                    style={{ resize: 'none' }}
                  />
                  <div className="flex justify-between items-center">
                    {user.role === 'reader' && activeUser?.role === 'client' ? (
                      <div className="flex items-center gap-2">
                        <label className="caption">Price ($):</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newMessagePrice}
                          onChange={(e) => setNewMessagePrice(e.target.value)}
                          className="input input--sm"
                          style={{ width: '80px' }}
                        />
                      </div>
                    ) : (
                      <div /> /* Empty div for flex spacing */
                    )}
                    <Button
                      variant="primary"
                      loading={sending}
                      disabled={!newMessageContent.trim()}
                      onClick={handleSendMessage}
                    >
                      Send Message
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
