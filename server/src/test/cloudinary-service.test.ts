import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { logger } from '../utils/logger';

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn(),
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

// Mock config module completely and dynamically replace in each test
vi.mock('../config', () => ({
  config: {
    cloudinary: {
      cloudName: '',
      apiKey: '',
      apiSecret: '',
      enabled: false,
    }
  }
}));

async function loadServiceWithEnv(env: Record<string, string>) {
  vi.resetModules();

  // Create mock config before importing the service
  vi.doMock('../config', () => ({
    config: {
      cloudinary: {
        cloudName: env.CLOUDINARY_CLOUD_NAME || '',
        apiKey: env.CLOUDINARY_API_KEY || '',
        apiSecret: env.CLOUDINARY_API_SECRET || '',
        enabled: Boolean(
          env.CLOUDINARY_CLOUD_NAME &&
          env.CLOUDINARY_API_KEY &&
          env.CLOUDINARY_API_SECRET
        ),
      }
    }
  }));

  const mod = await import('../services/cloudinary-service');
  return mod.cloudinaryService;
}

describe('CloudinaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('configuration', () => {
    it('throws error when uploading if disabled (missing credentials)', async () => {
      const svc = await loadServiceWithEnv({});

      expect(svc.enabled).toBe(false);

      await expect(
        svc.uploadBuffer(Buffer.from('fake data'))
      ).rejects.toThrow('Cloudinary is not configured');

      expect(cloudinary.config).not.toHaveBeenCalled();
    });

    it('configures cloudinary only once when enabled', async () => {
      const svc = await loadServiceWithEnv({
        CLOUDINARY_CLOUD_NAME: 'test_cloud',
        CLOUDINARY_API_KEY: 'test_key',
        CLOUDINARY_API_SECRET: 'test_secret',
      });

      expect(svc.enabled).toBe(true);

      // Mock upload_stream to immediately resolve so we don't hang
      const mockStream = { end: vi.fn() };
      (cloudinary.uploader.upload_stream as any).mockImplementation(
        (opts: any, cb: any) => {
          cb(undefined, { secure_url: 'http://example.com/img.jpg', public_id: 'test_id' });
          return mockStream;
        }
      );

      // First upload configures
      await svc.uploadBuffer(Buffer.from('fake data'));
      expect(cloudinary.config).toHaveBeenCalledTimes(1);
      expect(cloudinary.config).toHaveBeenCalledWith({
        cloud_name: 'test_cloud',
        api_key: 'test_key',
        api_secret: 'test_secret',
        secure: true,
      });

      // Second upload should not configure again
      await svc.uploadBuffer(Buffer.from('fake data'));
      expect(cloudinary.config).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadBuffer', () => {
    let svc: any;
    const testEnv = {
      CLOUDINARY_CLOUD_NAME: 'test_cloud',
      CLOUDINARY_API_KEY: 'test_key',
      CLOUDINARY_API_SECRET: 'test_secret',
    };

    beforeEach(async () => {
      svc = await loadServiceWithEnv(testEnv);
    });

    it('successfully uploads a buffer with default options', async () => {
      const fakeBuffer = Buffer.from('image data');
      const mockResult: Partial<UploadApiResponse> = {
        secure_url: 'https://res.cloudinary.com/test/image/upload/v1234/test.jpg',
        public_id: 'soulseer/readers/test',
      };

      let uploadCallback: any;
      const mockStream = { end: vi.fn() };

      (cloudinary.uploader.upload_stream as any).mockImplementation(
        (opts: any, cb: any) => {
          uploadCallback = cb;
          return mockStream;
        }
      );

      const uploadPromise = svc.uploadBuffer(fakeBuffer);

      // The stream's end method should have been called with the buffer
      expect(mockStream.end).toHaveBeenCalledWith(fakeBuffer);

      // Verify default options passed to upload_stream
      const uploadOpts = vi.mocked(cloudinary.uploader.upload_stream).mock.calls[0][0];
      expect(uploadOpts).toEqual(expect.objectContaining({
        folder: 'soulseer/readers',
        resource_type: 'image',
        overwrite: true,
        invalidate: true,
      }));

      // Simulate successful callback
      uploadCallback(undefined, mockResult);

      const result = await uploadPromise;
      expect(result).toEqual({
        url: mockResult.secure_url,
        publicId: mockResult.public_id,
      });
    });

    it('successfully uploads a buffer with custom options', async () => {
      const mockStream = { end: vi.fn() };
      (cloudinary.uploader.upload_stream as any).mockImplementation(
        (opts: any, cb: any) => {
          cb(undefined, { secure_url: 'url', public_id: 'custom_id' });
          return mockStream;
        }
      );

      await svc.uploadBuffer(Buffer.from('data'), {
        folder: 'custom/folder',
        publicId: 'specific_image_id',
      });

      const uploadOpts = vi.mocked(cloudinary.uploader.upload_stream).mock.calls[0][0];
      expect(uploadOpts).toEqual(expect.objectContaining({
        folder: 'custom/folder',
        public_id: 'specific_image_id',
      }));
    });

    it('rejects and logs when cloudinary returns an error', async () => {
      const fakeError = new Error('Upload timeout');
      const mockStream = { end: vi.fn() };

      (cloudinary.uploader.upload_stream as any).mockImplementation(
        (opts: any, cb: any) => {
          cb(fakeError, undefined);
          return mockStream;
        }
      );

      await expect(svc.uploadBuffer(Buffer.from('data'))).rejects.toThrow(fakeError);

      expect(logger.error).toHaveBeenCalledWith(
        { err: fakeError },
        'Cloudinary upload failed'
      );
    });

    it('rejects and logs when cloudinary returns no result and no error', async () => {
      const mockStream = { end: vi.fn() };

      (cloudinary.uploader.upload_stream as any).mockImplementation(
        (opts: any, cb: any) => {
          cb(undefined, undefined);
          return mockStream;
        }
      );

      await expect(svc.uploadBuffer(Buffer.from('data'))).rejects.toThrow('Cloudinary returned no result');

      expect(logger.error).toHaveBeenCalledWith(
        { err: undefined },
        'Cloudinary upload failed'
      );
    });
  });
});
