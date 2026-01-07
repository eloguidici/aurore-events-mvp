import { validate } from 'class-validator';

import { envs } from '../../../config/envs';
import { IsMaxTimeRange, IsMaxTimeRangeConstraint } from '../../decorators/max-time-range.decorator';

// Mock envs
jest.mock('../../../config/envs', () => ({
  envs: {
    maxQueryTimeRangeDays: 30,
  },
}));

class TestDto {
  from: string;

  @IsMaxTimeRange()
  to: string;
}

class TestDtoWithCustomMax {
  from: string;

  @IsMaxTimeRange(7)
  to: string;
}

describe('IsMaxTimeRange', () => {
  let constraint: IsMaxTimeRangeConstraint;

  beforeEach(() => {
    constraint = new IsMaxTimeRangeConstraint();
  });

  describe('IsMaxTimeRangeConstraint', () => {
    it('should be defined', () => {
      expect(constraint).toBeDefined();
    });

    it('should validate when time range is within limit', () => {
      const obj = {
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-15T00:00:00Z',
      };

      const result = constraint.validate(obj.to, {
        object: obj,
        property: 'to',
        constraints: [],
        value: obj.to,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(true);
    });

    it('should validate when time range equals limit', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z');
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 30); // Exactly 30 days

      const obj = {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      };

      const result = constraint.validate(obj.to, {
        object: obj,
        property: 'to',
        constraints: [],
        value: obj.to,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(true);
    });

    it('should fail validation when time range exceeds limit', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z');
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 31); // 31 days (exceeds 30)

      const obj = {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      };

      const result = constraint.validate(obj.to, {
        object: obj,
        property: 'to',
        constraints: [],
        value: obj.to,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(false);
    });

    it('should use custom maxDays from constraints', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z');
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 7); // Exactly 7 days

      const obj = {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      };

      const result = constraint.validate(obj.to, {
        object: obj,
        property: 'to',
        constraints: [7], // Custom 7 days limit
        value: obj.to,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(true);
    });

    it('should fail when custom maxDays is exceeded', () => {
      const fromDate = new Date('2024-01-01T00:00:00Z');
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 8); // 8 days (exceeds 7)

      const obj = {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      };

      const result = constraint.validate(obj.to, {
        object: obj,
        property: 'to',
        constraints: [7], // Custom 7 days limit
        value: obj.to,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(false);
    });

    it('should return true when from is missing', () => {
      const obj = {
        to: '2024-01-15T00:00:00Z',
      };

      const result = constraint.validate(obj.to, {
        object: obj,
        property: 'to',
        constraints: [],
        value: obj.to,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(true);
    });

    it('should return true when to is missing', () => {
      const obj = {
        from: '2024-01-01T00:00:00Z',
      };

      const result = constraint.validate(undefined, {
        object: obj,
        property: 'to',
        constraints: [],
        value: undefined,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(true);
    });

    it('should return true when dates are invalid', () => {
      const obj = {
        from: 'invalid-date',
        to: 'invalid-date',
      };

      const result = constraint.validate(obj.to, {
        object: obj,
        property: 'to',
        constraints: [],
        value: obj.to,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(true); // Let other validators handle invalid dates
    });

    it('should calculate days correctly across month boundaries', () => {
      const obj = {
        from: '2024-01-15T00:00:00Z',
        to: '2024-02-14T00:00:00Z', // 30 days later
      };

      const result = constraint.validate(obj.to, {
        object: obj,
        property: 'to',
        constraints: [],
        value: obj.to,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(true);
    });

    it('should provide correct error message', () => {
      const message = constraint.defaultMessage({
        object: {},
        property: 'to',
        constraints: [30],
        value: '',
        targetName: 'TestDto',
      } as any);

      expect(message).toContain('30 days');
    });

    it('should use env default when no constraint provided', () => {
      const message = constraint.defaultMessage({
        object: {},
        property: 'to',
        constraints: [],
        value: '',
        targetName: 'TestDto',
      } as any);

      expect(message).toContain('30 days'); // From mocked envs
    });
  });

  describe('IsMaxTimeRange decorator', () => {
    it('should validate DTO with default max days', async () => {
      const dto = new TestDto();
      dto.from = '2024-01-01T00:00:00Z';
      dto.to = '2024-01-15T00:00:00Z'; // 14 days (within 30)

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when range exceeds default max days', async () => {
      const fromDate = new Date('2024-01-01T00:00:00Z');
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 31); // 31 days (exceeds 30)

      const dto = new TestDto();
      dto.from = fromDate.toISOString();
      dto.to = toDate.toISOString();

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('to');
    });

    it('should validate DTO with custom max days', async () => {
      const dto = new TestDtoWithCustomMax();
      dto.from = '2024-01-01T00:00:00Z';
      dto.to = '2024-01-07T00:00:00Z'; // 6 days (within 7)

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when range exceeds custom max days', async () => {
      const fromDate = new Date('2024-01-01T00:00:00Z');
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 8); // 8 days (exceeds 7)

      const dto = new TestDtoWithCustomMax();
      dto.from = fromDate.toISOString();
      dto.to = toDate.toISOString();

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('to');
    });
  });
});

