import { Test, TestingModule } from '@nestjs/testing';

import { SanitizerService } from '../../services/sanitizer.service';

describe('SanitizerService', () => {
  let service: SanitizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SanitizerService],
    }).compile();

    service = module.get<SanitizerService>(SanitizerService);
  });

  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = service.sanitizeString(input);
      expect(result).toBe('Hello');
    });

    it('should handle null and undefined', () => {
      expect(service.sanitizeString(null as any)).toBeNull();
      expect(service.sanitizeString(undefined as any)).toBeUndefined();
    });

    it('should preserve plain text', () => {
      const input = 'Plain text message';
      const result = service.sanitizeString(input);
      expect(result).toBe('Plain text message');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize nested objects', () => {
      const input = {
        message: '<script>alert("xss")</script>Hello',
        metadata: {
          description: '<b>Bold</b> text',
        },
      };
      const result = service.sanitizeObject(input);
      expect(result.message).toBe('Hello');
      expect(result.metadata.description).toBe('Bold text');
    });

    it('should sanitize arrays', () => {
      const input = ['<script>alert("xss")</script>Hello', 'World'];
      const result = service.sanitizeObject(input);
      expect(result[0]).toBe('Hello');
      expect(result[1]).toBe('World');
    });
  });
});

