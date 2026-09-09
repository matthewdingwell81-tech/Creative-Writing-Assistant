import { apiFetch } from './api';

export async function uploadFile(file: File): Promise<{ objectPath: string; url: string; size: number; mimeType: string }> {
  const res = await apiFetch('/api/storage/uploads/request-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type })
  });
  if (!res.ok) throw new Error('Failed to request upload URL');
  const data = await res.json();

  const uploadRes = await fetch(data.uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!uploadRes.ok) throw new Error('Failed to upload file to storage');

  return {
    objectPath: data.objectPath,
    url: `/api/storage${data.objectPath}`,
    size: file.size,
    mimeType: file.type
  };
}
