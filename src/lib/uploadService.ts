import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

/**
 * Upload file to Supabase Storage
 * @param file - File to upload
 * @param bucket - Bucket name (e.g., 'logos', 'games', 'banners')
 * @param folder - Folder inside bucket (optional)
 */
export async function uploadFile(
  file: File,
  bucket: string = 'admin-uploads',
  folder: string = ''
): Promise<UploadResult> {
  try {
    if (!file) {
      return { success: false, error: 'No file selected' };
    }

    // Create unique filename with timestamp
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}-${sanitizedName}`;
    
    // Create path with folder if provided
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: publicData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return {
      success: true,
      url: publicData.publicUrl,
      path: filePath,
    };
  } catch (err) {
    console.error('Upload exception:', err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Upload failed' 
    };
  }
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFile(
  filePath: string,
  bucket: string = 'admin-uploads'
): Promise<UploadResult> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Delete failed' 
    };
  }
}

/**
 * List files in Supabase Storage folder
 */
export async function listFiles(
  bucket: string = 'admin-uploads',
  folder: string = ''
): Promise<{ success: boolean; files?: any[]; error?: string }> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, files: data };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'List failed' 
    };
  }
}
