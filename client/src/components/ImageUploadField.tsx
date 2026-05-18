import { useRef, useState, useCallback } from 'react';
import { Button } from './ui';
import { useToast } from './ToastProvider';
import { apiService } from '../services/api';

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ImageUploadFieldProps {
  label?: string;
  value?: string | null;
  readerId: number | 'new';
  onChange: (url: string | null) => void;
}

/**
 * File picker that uploads to POST /api/admin/readers/:id/image and stores the
 * returned URL via onChange. Enforces the same type/size constraints as the
 * server (jpeg|png|webp, ≤5 MB) so the user gets immediate feedback.
 */
export function ImageUploadField({ label = 'Profile Image', value, readerId, onChange }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { addToast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handlePick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        addToast('error', 'Image must be JPEG, PNG, or WebP');
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        addToast('error', 'Image must be 5 MB or smaller');
        return;
      }
      setUploading(true);
      try {
        const body = new FormData();
        body.append('file', file);
        const res = await apiService.upload<{ url: string }>(
          `/api/admin/readers/${readerId}/image`,
          body,
        );
        if (!res.url) throw new Error('Upload succeeded but no URL returned');
        onChange(res.url);
        addToast('success', 'Image uploaded');
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [addToast, onChange],
  );

  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <div className="flex items-center gap-3 flex-wrap">
        {value ? (
          <img
            src={value}
            alt="Reader profile preview"
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              objectFit: 'cover',
              border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}
          >
            🖼️
          </div>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handlePick}
            loading={uploading}
          >
            {value ? 'Replace' : 'Upload Image'}
          </Button>
          {value && !uploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
            >
              Remove
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
      <p className="form-help">JPEG, PNG, or WebP. Max 5 MB.</p>
    </div>
  );
}
