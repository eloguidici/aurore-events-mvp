import { validate } from 'class-validator';

import { createServiceConfig } from '../../../config/config-factory';
import { createValidationConfig } from '../../../config/config-factory';
import {
  CreateEventDto,
  IsMetadataSizeValidConstraint,
  IsParseableTimestampConstraint,
} from '../../dtos/create-event.dto';

// Get config for tests
const serviceConfig = createServiceConfig();
const validationConfig = createValidationConfig();

describe('CreateEventDto', () => {
  describe('validation', () => {
    it('should pass validation with valid data', async () => {
      const dto = new CreateEventDto();
      dto.timestamp = '2024-01-15T10:30:00.000Z';
      dto.service = 'test-service';
      dto.message = 'Test message';
      dto.metadata = { userId: '123' };

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when timestamp is missing', async () => {
      const dto = new CreateEventDto();
      dto.service = 'test-service';
      dto.message = 'Test message';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('timestamp');
    });

    it('should fail validation when timestamp is not parseable', async () => {
      const dto = new CreateEventDto();
      dto.timestamp = 'invalid-date';
      dto.service = 'test-service';
      dto.message = 'Test message';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'timestamp')).toBe(true);
    });

    it('should fail validation when service is missing', async () => {
      const dto = new CreateEventDto();
      dto.timestamp = '2024-01-15T10:30:00.000Z';
      dto.message = 'Test message';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('service');
    });

    it('should fail validation when service exceeds max length', async () => {
      const dto = new CreateEventDto();
      dto.timestamp = '2024-01-15T10:30:00.000Z';
      dto.service = 'a'.repeat(serviceConfig.nameMaxLength + 1);
      dto.message = 'Test message';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'service')).toBe(true);
    });

    it('should fail validation when message is missing', async () => {
      const dto = new CreateEventDto();
      dto.timestamp = '2024-01-15T10:30:00.000Z';
      dto.service = 'test-service';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('message');
    });

    it('should fail validation when message exceeds max length', async () => {
      const dto = new CreateEventDto();
      dto.timestamp = '2024-01-15T10:30:00.000Z';
      dto.service = 'test-service';
      dto.message = 'a'.repeat(validationConfig.messageMaxLength + 1);

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'message')).toBe(true);
    });

    it('should pass validation when metadata is optional and not provided', async () => {
      const dto = new CreateEventDto();
      dto.timestamp = '2024-01-15T10:30:00.000Z';
      dto.service = 'test-service';
      dto.message = 'Test message';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when metadata is not an object', async () => {
      const dto = new CreateEventDto();
      dto.timestamp = '2024-01-15T10:30:00.000Z';
      dto.service = 'test-service';
      dto.message = 'Test message';
      (dto as any).metadata = 'not-an-object';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'metadata')).toBe(true);
    });
  });
});

describe('IsParseableTimestampConstraint', () => {
  let constraint: IsParseableTimestampConstraint;

  beforeEach(() => {
    constraint = new IsParseableTimestampConstraint();
  });

  it('should validate ISO 8601 timestamp', () => {
    expect(constraint.validate('2024-01-15T10:30:00.000Z')).toBe(true);
  });

  it('should validate ISO 8601 timestamps', () => {
    // The validator accepts ISO 8601 format timestamps
    expect(constraint.validate('2024-01-15T10:30:00.000Z')).toBe(true);
    expect(constraint.validate('2024-01-15T10:30:00Z')).toBe(true);
    expect(constraint.validate('2024-01-15')).toBe(true);
  });

  it('should reject non-string values', () => {
    expect(constraint.validate(123)).toBe(false);
    expect(constraint.validate(null)).toBe(false);
    expect(constraint.validate(undefined)).toBe(false);
    expect(constraint.validate({})).toBe(false);
    expect(constraint.validate([])).toBe(false);
  });

  it('should reject invalid date strings', () => {
    expect(constraint.validate('invalid-date')).toBe(false);
    expect(constraint.validate('2024-13-45')).toBe(false);
    expect(constraint.validate('')).toBe(false);
  });

  it('should return appropriate error message', () => {
    const message = constraint.defaultMessage();
    expect(message).toContain('timestamp must be a parseable date');
  });
});

describe('IsMetadataSizeValidConstraint', () => {
  let constraint: IsMetadataSizeValidConstraint;

  beforeEach(() => {
    constraint = new IsMetadataSizeValidConstraint();
  });

  it('should validate metadata within size limit', () => {
    const metadata = { userId: '123', ipAddress: '192.168.1.1' };
    const args = {
      constraints: [validationConfig.metadataMaxSizeKB],
      value: undefined,
      targetName: '',
      object: {},
      property: 'metadata',
    } as any;

    expect(constraint.validate(metadata, args)).toBe(true);
  });

  it('should validate null/undefined metadata (optional field)', () => {
    const args = {
      constraints: [validationConfig.metadataMaxSizeKB],
      value: undefined,
      targetName: '',
      object: {},
      property: 'metadata',
    } as any;

    expect(constraint.validate(null, args)).toBe(true);
    expect(constraint.validate(undefined, args)).toBe(true);
  });

  it('should reject non-object metadata', () => {
    const args = {
      constraints: [validationConfig.metadataMaxSizeKB],
      value: undefined,
      targetName: '',
      object: {},
      property: 'metadata',
    } as any;

    expect(constraint.validate('string', args)).toBe(false);
    expect(constraint.validate(123, args)).toBe(false);
    // Arrays are objects in JavaScript, so they pass the typeof check
    // but the validation logic should handle them appropriately
  });

  it('should reject metadata exceeding size limit', () => {
    // Create a large metadata object
    const largeMetadata: Record<string, any> = {};
    const largeString = 'x'.repeat(20 * 1024); // 20KB string
    largeMetadata.data = largeString;

    const args = {
      constraints: [validationConfig.metadataMaxSizeKB],
      value: undefined,
      targetName: '',
      object: {},
      property: 'metadata',
    } as any;

    expect(constraint.validate(largeMetadata, args)).toBe(false);
  });

  it('should reject metadata exceeding max depth', () => {
    // Create deeply nested object (more than 5 levels)
    const deepMetadata: any = {};
    let current = deepMetadata;
    for (let i = 0; i < 6; i++) {
      current.level = {};
      current = current.level;
    }

    const args = {
      constraints: [validationConfig.metadataMaxSizeKB],
      value: undefined,
      targetName: '',
      object: {},
      property: 'metadata',
    } as any;

    expect(constraint.validate(deepMetadata, args)).toBe(false);
  });

  it('should reject metadata exceeding max key count', () => {
    // Create object with more than 100 keys
    const manyKeysMetadata: Record<string, any> = {};
    for (let i = 0; i < 101; i++) {
      manyKeysMetadata[`key${i}`] = `value${i}`;
    }

    const args = {
      constraints: [validationConfig.metadataMaxSizeKB],
      value: undefined,
      targetName: '',
      object: {},
      property: 'metadata',
    } as any;

    expect(constraint.validate(manyKeysMetadata, args)).toBe(false);
  });

  it('should handle circular references gracefully', () => {
    const circularMetadata: any = { a: 1 };
    circularMetadata.self = circularMetadata;

    const args = {
      constraints: [validationConfig.metadataMaxSizeKB],
      value: undefined,
      targetName: '',
      object: {},
      property: 'metadata',
    } as any;

    // Should not throw and should handle gracefully
    expect(() => constraint.validate(circularMetadata, args)).not.toThrow();
  });

  it('should return appropriate error message', () => {
    const args = {
      constraints: [validationConfig.metadataMaxSizeKB],
      value: undefined,
      targetName: '',
      object: {},
      property: 'metadata',
    } as any;

    const message = constraint.defaultMessage(args);
    expect(message).toContain('metadata must not exceed');
    expect(message).toContain('KB');
  });
});

