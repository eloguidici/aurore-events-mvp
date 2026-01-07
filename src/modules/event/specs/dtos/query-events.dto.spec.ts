import { validate } from 'class-validator';

import { createQueryConfig } from '../../../config/config-factory';
import { createServiceConfig } from '../../../config/config-factory';
import { QueryDto } from '../../dtos/query-events.dto';

// Get config for tests
const serviceConfig = createServiceConfig();
const queryConfig = createQueryConfig();

describe('QueryDto', () => {
  describe('validation', () => {
    it('should pass validation with valid data', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      // Use a smaller time range to avoid max time range validation
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-02T00:00:00.000Z';
      dto.page = 1;
      dto.pageSize = 10;
      dto.sortField = 'timestamp';
      dto.sortOrder = 'DESC';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when service is missing', async () => {
      const dto = new QueryDto();
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-31T23:59:59.000Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'service')).toBe(true);
    });

    it('should fail validation when service exceeds max length', async () => {
      const dto = new QueryDto();
      dto.service = 'a'.repeat(serviceConfig.nameMaxLength + 1);
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-31T23:59:59.000Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'service')).toBe(true);
    });

    it('should fail validation when from is missing', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      dto.to = '2024-01-02T00:00:00.000Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'from')).toBe(true);
    });

    it('should fail validation when from is not parseable', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      dto.from = 'invalid-date';
      dto.to = '2024-01-31T23:59:59.000Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'from')).toBe(true);
    });

    it('should fail validation when to is missing', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      dto.from = '2024-01-01T00:00:00.000Z';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'to')).toBe(true);
    });

    it('should fail validation when to is not parseable', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = 'invalid-date';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'to')).toBe(true);
    });

    it('should fail validation when page is less than 1', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-02T00:00:00.000Z';
      dto.page = 0;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });

    it('should fail validation when page exceeds 10000', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-31T23:59:59.000Z';
      dto.page = 10001;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });

    it('should fail validation when pageSize is less than 1', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-02T00:00:00.000Z';
      dto.pageSize = 0;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
    });

    it('should fail validation when pageSize exceeds max limit', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-31T23:59:59.000Z';
      dto.pageSize = queryConfig.maxLimit + 1;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
    });

    it('should pass validation with optional fields missing', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      // Use a smaller time range to avoid max time range validation
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-02T00:00:00.000Z';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with valid sortField', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      // Use a smaller time range to avoid max time range validation
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-02T00:00:00.000Z';
      dto.sortField = 'timestamp';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with valid sortOrder', async () => {
      const dto = new QueryDto();
      dto.service = 'test-service';
      // Use a smaller time range to avoid max time range validation
      dto.from = '2024-01-01T00:00:00.000Z';
      dto.to = '2024-01-02T00:00:00.000Z';
      dto.sortOrder = 'ASC';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});

