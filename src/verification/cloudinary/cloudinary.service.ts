import { Inject, Injectable } from '@nestjs/common';
import { UploadApiResponse, v2 } from 'cloudinary';
import { CLOUDINARY } from './cloudinary.provider';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  constructor(@Inject(CLOUDINARY) private cloudinary: typeof v2) {}

  /**
   * Uploads a buffer (from multer's in-memory storage) to a private,
   * access-controlled Cloudinary folder — identity documents should never
   * be uploaded as `public` resources.
   */
  uploadBuffer(buffer: Buffer, folder: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        { folder, type: 'authenticated', resource_type: 'image' },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result);
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  /** Generates a short-lived signed URL so only authorized viewers can see the image. */
  getSignedUrl(publicId: string): string {
    return this.cloudinary.utils.private_download_url(publicId, 'jpg', {
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    });
  }
}
