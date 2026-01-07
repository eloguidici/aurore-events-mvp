import { validate } from 'class-validator';

import { IsSortOrder } from '../../decorators/sort-order.decorator';

class TestDto {
  @IsSortOrder()
  sortOrder?: string;
}

describe('IsSortOrder', () => {
  it('should validate when sortOrder is ASC', async () => {
    const dto = new TestDto();
    dto.sortOrder = 'ASC';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate when sortOrder is DESC', async () => {
    const dto = new TestDto();
    dto.sortOrder = 'DESC';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate when sortOrder is asc (lowercase)', async () => {
    const dto = new TestDto();
    dto.sortOrder = 'asc';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate when sortOrder is desc (lowercase)', async () => {
    const dto = new TestDto();
    dto.sortOrder = 'desc';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate when sortOrder is Asc (mixed case)', async () => {
    const dto = new TestDto();
    dto.sortOrder = 'Asc';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate when sortOrder is Desc (mixed case)', async () => {
    const dto = new TestDto();
    dto.sortOrder = 'Desc';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate when sortOrder is aSc (mixed case)', async () => {
    const dto = new TestDto();
    dto.sortOrder = 'aSc';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation when sortOrder is undefined', async () => {
    const dto = new TestDto();
    dto.sortOrder = undefined;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation when sortOrder is null', async () => {
    const dto = new TestDto();
    dto.sortOrder = null as any;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when sortOrder is not a string', async () => {
    const dto = new TestDto();
    dto.sortOrder = 123 as any;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('sortOrder');
  });

  it('should fail validation when sortOrder is invalid value', async () => {
    const invalidValues = [
      'INVALID',
      'UP',
      'DOWN',
      'ASCENDING',
      'DESCENDING',
      'ascending',
      'descending',
      'random',
      '',
    ];

    for (const value of invalidValues) {
      const dto = new TestDto();
      dto.sortOrder = value;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('sortOrder');
    }
  });

  it('should provide correct error message', async () => {
    const dto = new TestDto();
    dto.sortOrder = 'INVALID';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);

    const constraintMessage = Object.values(
      errors[0].constraints || {},
    )[0] as string;
    expect(constraintMessage).toContain('ASC');
    expect(constraintMessage).toContain('DESC');
    expect(constraintMessage).toContain('case insensitive');
  });

  it('should handle whitespace correctly', async () => {
    const dto = new TestDto();
    dto.sortOrder = ' ASC '; // With spaces

    const errors = await validate(dto);
    // Should fail because it's not exactly ASC or DESC (even if case insensitive)
    // The validator does toUpperCase() but spaces remain
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should be case insensitive for valid values', async () => {
    const validCases = ['asc', 'ASC', 'Asc', 'aSc', 'desc', 'DESC', 'Desc', 'dEsC'];

    for (const value of validCases) {
      const dto = new TestDto();
      dto.sortOrder = value;

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });
});

