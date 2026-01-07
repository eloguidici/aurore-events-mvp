import { validate } from 'class-validator';

import { IsValidTimeRange, IsValidTimeRangeConstraint } from '../../decorators/valid-time-range.decorator';

class TestDto {
  from: string;

  @IsValidTimeRange()
  to: string;
}

describe('IsValidTimeRange', () => {
  let constraint: IsValidTimeRangeConstraint;

  beforeEach(() => {
    constraint = new IsValidTimeRangeConstraint();
  });

  describe('IsValidTimeRangeConstraint', () => {
    it('should be defined', () => {
      expect(constraint).toBeDefined();
    });

    it('should validate when from is before to', () => {
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

    it('should fail validation when from is after to', () => {
      const obj = {
        from: '2024-01-15T00:00:00Z',
        to: '2024-01-01T00:00:00Z',
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

    it('should fail validation when from equals to', () => {
      const obj = {
        from: '2024-01-15T00:00:00Z',
        to: '2024-01-15T00:00:00Z',
      };

      const result = constraint.validate(obj.to, {
        object: obj,
        property: 'to',
        constraints: [],
        value: obj.to,
        targetName: 'TestDto',
      } as any);

      expect(result).toBe(false); // from < to means from must be strictly before to
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

      expect(result).toBe(true); // Let other validators handle missing fields
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

      expect(result).toBe(true); // Let other validators handle missing fields
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

    it('should validate with different time formats', () => {
      const obj = {
        from: '2024-01-01T00:00:00.000Z',
        to: '2024-01-15T23:59:59.999Z',
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

    it('should handle dates across month boundaries', () => {
      const obj = {
        from: '2024-01-31T00:00:00Z',
        to: '2024-02-01T00:00:00Z',
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

    it('should handle dates across year boundaries', () => {
      const obj = {
        from: '2023-12-31T23:59:59Z',
        to: '2024-01-01T00:00:00Z',
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
      const message = constraint.defaultMessage();

      expect(message).toBe("'from' timestamp must be before 'to' timestamp");
    });
  });

  describe('IsValidTimeRange decorator', () => {
    it('should validate DTO when from is before to', async () => {
      const dto = new TestDto();
      dto.from = '2024-01-01T00:00:00Z';
      dto.to = '2024-01-15T00:00:00Z';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when from is after to', async () => {
      const dto = new TestDto();
      dto.from = '2024-01-15T00:00:00Z';
      dto.to = '2024-01-01T00:00:00Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('to');
    });

    it('should fail validation when from equals to', async () => {
      const dto = new TestDto();
      dto.from = '2024-01-15T00:00:00Z';
      dto.to = '2024-01-15T00:00:00Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('to');
    });

    it('should pass validation when from is missing', async () => {
      const dto = new TestDto();
      dto.to = '2024-01-15T00:00:00Z';

      const errors = await validate(dto);
      // Should pass this validator (but may fail other validators for missing 'from')
      const toErrors = errors.filter((e) => e.property === 'to');
      const isValidTimeRangeError = toErrors.some((e) =>
        Object.keys(e.constraints || {}).some((key) =>
          key.includes('isValidTimeRange'),
        ),
      );
      expect(isValidTimeRangeError).toBe(false);
    });

    it('should pass validation when to is missing', async () => {
      const dto = new TestDto();
      dto.from = '2024-01-01T00:00:00Z';

      const errors = await validate(dto);
      // Should pass this validator (but may fail other validators for missing 'to')
      const toErrors = errors.filter((e) => e.property === 'to');
      const isValidTimeRangeError = toErrors.some((e) =>
        Object.keys(e.constraints || {}).some((key) =>
          key.includes('isValidTimeRange'),
        ),
      );
      expect(isValidTimeRangeError).toBe(false);
    });
  });
});

