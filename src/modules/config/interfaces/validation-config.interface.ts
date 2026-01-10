/**
 * Validation configuration interface
 */
export interface ValidationConfig {
  messageMaxLength: number;
  metadataMaxSizeKB: number;
  batchChunkSize: number;
  metadataMaxKeys: number;
  metadataMaxDepth: number;
}
