/**
 * Interface for compression service
 */
export interface ICompressionService {
  /**
   * Compress metadata if it's larger than threshold
   *
   * @param metadata - Metadata object to potentially compress
   * @returns Compressed metadata or original metadata
   */
  compressMetadata(metadata: any): Promise<any>;

  /**
   * Decompress metadata if it was compressed
   *
   * @param metadata - Potentially compressed metadata
   * @returns Decompressed metadata object
   */
  decompressMetadata(metadata: any): Promise<any>;

  /**
   * Check if metadata is compressed
   *
   * @param metadata - Metadata to check
   * @returns true if metadata is compressed
   */
  isCompressed(metadata: any): boolean;

  /**
   * Get size of metadata in bytes
   *
   * @param metadata - Metadata object
   * @returns Size in bytes
   */
  getMetadataSize(metadata: any): number;
}
