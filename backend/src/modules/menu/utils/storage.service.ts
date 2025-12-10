import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service';

@Injectable()
export class StorageService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Upload image to Supabase Storage
   * @param file - The file to upload
   * @param bucket - The storage bucket name
   * @param folder - The folder path within the bucket (e.g., 'categories', 'food-items')
   * @param tenantId - The tenant ID for organization
   * @returns The public URL of the uploaded image
   */
  async uploadImage(
    file: any,
    bucket: string,
    folder: string,
    tenantId: string,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`,
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    const supabase = this.supabaseService.getServiceRoleClient();

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
    const filePath = `${tenantId}/${folder}/${fileName}`;

    // Upload file to Supabase Storage
    // Convert buffer to ArrayBuffer if needed
    const fileBuffer = file.buffer instanceof Buffer 
      ? file.buffer 
      : Buffer.from(file.buffer);
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(`Failed to upload image: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  /**
   * Delete image from Supabase Storage
   * @param imageUrl - The public URL of the image to delete
   * @param bucket - The storage bucket name
   */
  async deleteImage(imageUrl: string, bucket: string): Promise<void> {
    if (!imageUrl) {
      return;
    }

    const supabase = this.supabaseService.getServiceRoleClient();

    // Extract file path from URL
    // Supabase Storage URLs are typically: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
    const urlParts = imageUrl.split('/');
    const bucketIndex = urlParts.indexOf(bucket);
    
    if (bucketIndex === -1) {
      throw new BadRequestException('Invalid image URL');
    }

    const filePath = urlParts.slice(bucketIndex + 1).join('/');

    // Delete file
    const { error } = await supabase.storage.from(bucket).remove([filePath]);

    if (error) {
      // Don't throw error if file doesn't exist
      console.warn(`Failed to delete image: ${error.message}`);
    }
  }

  /**
   * Ensure storage bucket exists and has proper policies
   * This should be called during application initialization
   */
  async ensureBucketExists(bucket: string): Promise<void> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.warn(`Failed to list buckets: ${listError.message}`);
      return;
    }

    const bucketExists = buckets?.some((b) => b.name === bucket);

    if (!bucketExists) {
      // Create bucket (requires admin privileges)
      const { error: createError } = await supabase.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      });

      if (createError) {
        console.warn(`Failed to create bucket: ${createError.message}`);
        // Note: Bucket creation might need to be done manually in Supabase dashboard
      }
    }
  }
}

