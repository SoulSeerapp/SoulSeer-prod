import { RtcTokenBuilder, RtcRole, RtmTokenBuilder } from 'agora-token';
import { config } from '../config';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

export class AgoraService {
  static generateTokens(
    channelName: string,
    uid: number,
    role: 'publisher' | 'subscriber' = 'publisher',
  ): { rtcToken: string; rtmToken: string; channelName: string; uid: number; expiration: number } {
    if (!config.agora.appId || !config.agora.appCertificate) {
      throw new AppError(500, 'Agora credentials not configured');
    }
    if (!channelName || !channelName.startsWith('reading_')) {
      throw new AppError(400, 'Invalid channel name');
    }

    const expiration = config.agora.tokenExpiration;
    const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    // RtcTokenBuilder.buildTokenWithUid(appId, cert, channel, uid, role, tokenExpire, privilegeExpire)
    const rtcToken = RtcTokenBuilder.buildTokenWithUid(
      config.agora.appId,
      config.agora.appCertificate,
      channelName,
      uid,
      rtcRole,
      expiration,
      expiration,
    );

    // RtmTokenBuilder.buildToken(appId, cert, userId, expire)
    const rtmToken = RtmTokenBuilder.buildToken(
      config.agora.appId,
      config.agora.appCertificate,
      String(uid),
      expiration,
    );

    return { rtcToken, rtmToken, channelName, uid, expiration };
  }

  static async startRtmpPush(channelName: string, rtmpUrl: string, uid: number): Promise<void> {
    if (!config.agora.appId || !config.agora.appCertificate) {
      throw new AppError(500, 'Agora credentials not configured');
    }

    // In a real-world scenario, you would make a REST API call to Agora's Cloud Recording
    // or RTMP push service (e.g., https://api.agora.io/v1/projects/{appid}/rtmp-converters).
    // For now, we simulate the server-side REST call for Agora RTMP push initialization.
    logger.info({ channelName, rtmpUrl, uid }, 'Simulating Agora RTMP push initialization');

    // Example of actual REST call to Agora:
    // const auth = Buffer.from(`${config.agora.appId}:${config.agora.appCertificate}`).toString('base64');
    // await fetch(`https://api.agora.io/v1/projects/${config.agora.appId}/rtmp-converters`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Basic ${auth}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     converter: {
    //       name: channelName,
    //       transcodingOptions: { ... },
    //       rtmpUrl: rtmpUrl
    //     }
    //   })
    // });
  }

  static async stopRtmpPush(channelName: string): Promise<void> {
    if (!config.agora.appId || !config.agora.appCertificate) {
      throw new AppError(500, 'Agora credentials not configured');
    }

    logger.info({ channelName }, 'Simulating Agora RTMP push termination');
  }
}
