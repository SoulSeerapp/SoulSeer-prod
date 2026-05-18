import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RtcTokenBuilder, RtcRole, RtmTokenBuilder } from 'agora-token';

// Mock the agora-token module
vi.mock('agora-token', () => {
  return {
    RtcRole: {
      PUBLISHER: 1,
      SUBSCRIBER: 2,
    },
    RtcTokenBuilder: {
      buildTokenWithUid: vi.fn(),
    },
    RtmTokenBuilder: {
      buildToken: vi.fn(),
    },
  };
});

// Create a helper to dynamically load the module with different config
async function loadServiceWithConfig(agoraConfig: any) {
  vi.resetModules();
  vi.doMock('../config', () => ({
    config: {
      agora: agoraConfig,
    },
  }));
  const mod = await import('../services/agora-service');
  return mod.AgoraService;
}

describe('AgoraService.generateTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.doUnmock('../config');
  });

  it('throws an error if Agora credentials are not configured (missing appId)', async () => {
    const AgoraService = await loadServiceWithConfig({
      appId: '',
      appCertificate: 'cert',
      tokenExpiration: 3600,
    });

    expect(() => AgoraService.generateTokens('reading_123', 1)).toThrowError(
      'Agora credentials not configured'
    );
  });

  it('throws an error if Agora credentials are not configured (missing appCertificate)', async () => {
    const AgoraService = await loadServiceWithConfig({
      appId: 'appId',
      appCertificate: '',
      tokenExpiration: 3600,
    });

    expect(() => AgoraService.generateTokens('reading_123', 1)).toThrowError(
      'Agora credentials not configured'
    );
  });

  it('throws an error if channel name is invalid (missing)', async () => {
    const AgoraService = await loadServiceWithConfig({
      appId: 'appId',
      appCertificate: 'cert',
      tokenExpiration: 3600,
    });

    expect(() => AgoraService.generateTokens('', 1)).toThrowError(
      'Invalid channel name'
    );
  });

  it('throws an error if channel name does not start with reading_', async () => {
    const AgoraService = await loadServiceWithConfig({
      appId: 'appId',
      appCertificate: 'cert',
      tokenExpiration: 3600,
    });

    expect(() => AgoraService.generateTokens('invalid_123', 1)).toThrowError(
      'Invalid channel name'
    );
  });

  it('generates tokens successfully for a publisher', async () => {
    const mockRtcToken = 'mock-rtc-token';
    const mockRtmToken = 'mock-rtm-token';

    vi.mocked(RtcTokenBuilder.buildTokenWithUid).mockReturnValue(mockRtcToken);
    vi.mocked(RtmTokenBuilder.buildToken).mockReturnValue(mockRtmToken);

    const expiration = 3600;
    const AgoraService = await loadServiceWithConfig({
      appId: 'testAppId',
      appCertificate: 'testCert',
      tokenExpiration: expiration,
    });

    const result = AgoraService.generateTokens('reading_123', 42, 'publisher');

    expect(result).toEqual({
      rtcToken: mockRtcToken,
      rtmToken: mockRtmToken,
      channelName: 'reading_123',
      uid: 42,
      expiration,
    });

    expect(RtcTokenBuilder.buildTokenWithUid).toHaveBeenCalledWith(
      'testAppId',
      'testCert',
      'reading_123',
      42,
      RtcRole.PUBLISHER,
      expiration,
      expiration
    );

    expect(RtmTokenBuilder.buildToken).toHaveBeenCalledWith(
      'testAppId',
      'testCert',
      '42',
      expiration
    );
  });

  it('generates tokens successfully for a subscriber', async () => {
    const mockRtcToken = 'mock-rtc-sub-token';
    const mockRtmToken = 'mock-rtm-sub-token';

    vi.mocked(RtcTokenBuilder.buildTokenWithUid).mockReturnValue(mockRtcToken);
    vi.mocked(RtmTokenBuilder.buildToken).mockReturnValue(mockRtmToken);

    const expiration = 7200;
    const AgoraService = await loadServiceWithConfig({
      appId: 'testAppId2',
      appCertificate: 'testCert2',
      tokenExpiration: expiration,
    });

    const result = AgoraService.generateTokens('reading_456', 99, 'subscriber');

    expect(result).toEqual({
      rtcToken: mockRtcToken,
      rtmToken: mockRtmToken,
      channelName: 'reading_456',
      uid: 99,
      expiration,
    });

    expect(RtcTokenBuilder.buildTokenWithUid).toHaveBeenCalledWith(
      'testAppId2',
      'testCert2',
      'reading_456',
      99,
      RtcRole.SUBSCRIBER,
      expiration,
      expiration
    );

    expect(RtmTokenBuilder.buildToken).toHaveBeenCalledWith(
      'testAppId2',
      'testCert2',
      '99',
      expiration
    );
  });
});
