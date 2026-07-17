// Upload service — uses Supabase Storage via centralized client
// Buckets: admin-uploads for logos, banners, game assets

import { supabase } from '@/integrations/supabase/client';

export interface UploadResult { success: boolean; url?: string; path?: string; error?: string; }

/** Upload file to Supabase Storage */
export async function uploadFile(file: File, bucket: string = 'admin-uploads', folder: string = ''): Promise<UploadResult> {
  try {
    if (!file) return { success: false, error: 'No file selected' };
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}-${sanitizedName}`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    const { error } = await supabase.storage.from(bucket).upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (error) return { success: false, error: error.message };

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return { success: true, url: publicData.publicUrl, path: filePath };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Upload failed' };
  }
}

/** Delete file from Supabase Storage */
export async function deleteFile(filePath: string, bucket: string = 'admin-uploads'): Promise<UploadResult> {
  try {
    const { error } = await supabase.storage.from(bucket).remove([filePath]);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Delete failed' };
  }
}

/** List files in Supabase Storage folder */
export async function listFiles(bucket: string = 'admin-uploads', folder: string = ''): Promise<{ success: boolean; files?: any[]; error?: string }> {
  try {
    const { data, error } = await supabase.storage.from(bucket).list(folder);
    if (error) return { success: false, error: error.message };
    return { success: true, files: data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'List failed' };
  }
}
