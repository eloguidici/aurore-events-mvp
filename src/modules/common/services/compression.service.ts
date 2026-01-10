import { Injectable, Logger } from '@nestjs/common';
import { promisify } from 'util';
import * as zlib from 'zlib';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Service for compressing and decompressing data
 * Used to reduce storage space for large metadata objects
 */
@Injectable()
export class CompressionService {
  private readonly logger = new Logger(CompressionService.name);
  private readonly COMPRESSION_THRESHOLD_BYTES = 1024; // 1KB - only compress if larger than this

  /**
   * Compress metadata if it's larger than threshold
   * Returns compressed data as base64 string if compressed, original data if not
   *
   * @param metadata - Metadata object to potentially compress
   * @returns Compressed metadata (base64) or original metadata
   */
  async compressMetadata(metadata: any): Promise<any> {
    if (!metadata || typeof metadata !== 'object') {
      return metadata;
    }

    try {
      const jsonString = JSON.stringify(metadata);
      const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');

      // Only compress if larger than threshold
      if (sizeInBytes <= this.COMPRESSION_THRESHOLD_BYTES) {
        return metadata; // Return original if below threshold
      }

      // Compress using gzip
      const compressed = await gzip(jsonString);
      const compressedBase64 = compressed.toString('base64');

      // Only use compressed version if it's actually smaller
      if (compressedBase64.length < jsonString.length) {
        this.logger.debug(
          `Compressed metadata: ${sizeInBytes} bytes -> ${compressedBase64.length} bytes (${Math.round((1 - compressedBase64.length / sizeInBytes) * 100)}% reduction)`,
        );
        // Mark as compressed with special prefix
        return {
          __compressed: true,
          __data: compressedBase64,
        };
      }

      // If compression doesn't help, return original
      return metadata;
    } catch (error) {
      // If compression fails, return original metadata
      this.logger.warn('Failed to compress metadata, using original', error);
      return metadata;
    }
  }

  /**
   * Decompress metadata if it was compressed
   * Automatically detects if metadata needs decompression
   *
   * @param metadata - Potentially compressed metadata
   * @returns Decompressed metadata object
   */
  async decompressMetadata(metadata: any): Promise<any> {
    if (!metadata || typeof metadata !== 'object') {
      return metadata;
    }

    // Check if metadata is marked as compressed
    if (metadata.__compressed === true && metadata.__data) {
      try {
        const compressedBuffer = Buffer.from(metadata.__data, 'base64');
        const decompressed = await gunzip(compressedBuffer);
        const jsonString = decompressed.toString('utf8');
        return JSON.parse(jsonString);
      } catch (error) {
        this.logger.warn(
          'Failed to decompress metadata, returning original',
          error,
        );
        return metadata;
      }
    }

    // Not compressed, return as-is
    return metadata;
  }

  /**
   * Check if metadata is compressed
   *
   * @param metadata - Metadata to check
   * @returns true if metadata is compressed
   */
  isCompressed(metadata: any): boolean {
    return (
      metadata &&
      typeof metadata === 'object' &&
      metadata.__compressed === true &&
      typeof metadata.__data === 'string'
    );
  }

  /**
   * Get size of metadata in bytes (after compression if applicable)
   *
   * @param metadata - Metadata object
   * @returns Size in bytes
   */
  getMetadataSize(metadata: any): number {
    if (!metadata) {
      return 0;
    }

    try {
      if (this.isCompressed(metadata)) {
        // Return size of compressed data
        return Buffer.byteLength(metadata.__data, 'base64');
      }
      // Return size of uncompressed JSON
      return Buffer.byteLength(JSON.stringify(metadata), 'utf8');
    } catch (error) {
      return 0;
    }
  }
}
