import { validate } from 'class-validator';

import { ALLOWED_SORT_FIELDS } from '../../../event/constants/query.constants';
import { IsSortField } from '../../decorators/sort-field.decorator';

class TestDto {
  @IsSortField()
  sortField?: string;
}

describe('IsSortField', () => {
  it('should validate when sortField is one of allowed fields', async () => {
    for (const field of ALLOWED_SORT_FIELDS) {
      const dto = new TestDto();
      dto.sortField = field;

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('should fail validation when sortField is not in allowed fields', async () => {
    const dto = new TestDto();
    dto.sortField = 'invalidField';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('sortField');
    expect(errors[0].constraints).toBeDefined();
    expect(
      Object.values(errors[0].constraints || {}).some((msg) =>
        String(msg).includes('must be one of'),
      ),
    ).toBe(true);
  });

  it('should pass validation when sortField is undefined', async () => {
    const dto = new TestDto();
    dto.sortField = undefined;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation when sortField is null', async () => {
    const dto = new TestDto();
    dto.sortField = null as any;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when sortField is not a string', async () => {
    const dto = new TestDto();
    dto.sortField = 123 as any;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('sortField');
  });

  it('should fail validation when sortField is an empty string', async () => {
    const dto = new TestDto();
    dto.sortField = '';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('sortField');
  });

  it('should be case sensitive', async () => {
    const dto = new TestDto();
    dto.sortField = 'TIMESTAMP'; // Uppercase, but allowed field is 'timestamp'

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('sortField');
  });

  it('should validate all allowed sort fields', async () => {
    // This test ensures all fields from ALLOWED_SORT_FIELDS are accepted
    for (const field of ALLOWED_SORT_FIELDS) {
      const dto = new TestDto();
      dto.sortField = field;

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('should provide error message with all allowed fields', async () => {
    const dto = new TestDto();
    dto.sortField = 'invalidField';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);

    const constraintMessage = Object.values(
      errors[0].constraints || {},
    )[0] as string;
    expect(constraintMessage).toContain('must be one of:');

    // Check that all allowed fields are mentioned in error message
    for (const field of ALLOWED_SORT_FIELDS) {
      expect(constraintMessage).toContain(field);
    }
  });

  it('should prevent SQL injection attempts', async () => {
    const sqlInjectionAttempts = [
      "'; DROP TABLE events; --",
      "' OR '1'='1",
      "1'; DELETE FROM events; --",
      "'; SELECT * FROM users; --",
    ];

    for (const attempt of sqlInjectionAttempts) {
      const dto = new TestDto();
      dto.sortField = attempt;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('sortField');
    }
  });
});
