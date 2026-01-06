import { EnrichedEvent } from '../../event/interfaces/enriched-event.interface';

/**
 * Result of batch validation
 * Separates valid events from invalid ones
 */
export interface BatchValidationResult {
  /**
   * Events that passed validation
   */
  validEvents: EnrichedEvent[];

  /**
   * Events that failed validation
   */
  invalidEvents: EnrichedEvent[];
}
