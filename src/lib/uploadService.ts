// Upload service - uses Supabase Storage
import { supabase } from '@/integrations/supabase/client';

export interface UploadResult { success: boolean; url?: string; path?: string; error?: string; }

interface StorageFile {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  metadata: Record<string, unknown> | null;
}

export async function uploadFile(file: File, bucket = 'admin-uploads', folder = ''): Promise<UploadResult> {
  try {
    if (!file) return { success: false, error: 'No file selected' };
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;
    const { error } = await supabase.storage.from(bucket).upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (error) return { success: false, error: error.message };
    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return { success: true, url: publicData.publicUrl, path: filePath };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

export async function deleteFile(filePath: string, bucket = 'admin-uploads'): Promise<UploadResult> {
  try {
    const { error } = await supabase.storage.from(bucket).remove([filePath]);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Delete failed' };
  }
}

export async function listFiles(bucket = 'admin-uploads', folder = ''): Promise<{ success: boolean; files?: StorageFile[]; error?: string }> {
  try {
    const { data, error } = await supabase.storage.from(bucket).list(folder);
    if (error) return { success: false, error: error.message };
    return { success: true, files: data as StorageFile[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'List failed' };
  }
}
