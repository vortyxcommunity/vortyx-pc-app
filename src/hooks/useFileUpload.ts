import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useFileUpload = (bucket: string = 'chat-attachments') => {
    const [uploading, setUploading] = useState(false);

    const uploadFile = async (file: File): Promise<string | null> => {
        try {
            setUploading(true);

            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = fileName;

            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(filePath, file);

            if (error) throw error;

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from(bucket)
                .getPublicUrl(filePath);

            return publicUrl;
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error('Failed to upload file: ' + error.message);
            return null;
        } finally {
            setUploading(false);
        }
    };

    return { uploadFile, uploading };
};
