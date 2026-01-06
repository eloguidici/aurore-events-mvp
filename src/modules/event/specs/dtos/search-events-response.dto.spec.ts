import { Event } from '../../entities/event.entity';
import { EventDto, SearchResponseDto } from '../../dtos/search-events-response.dto';

describe('EventDto', () => {
  it('should create DTO from Event entity', () => {
    const event = new Event();
    event.id = 'uuid-123';
    event.eventId = 'evt_test123456';
    event.timestamp = '2024-01-15T10:30:00.000Z';
    event.service = 'test-service';
    event.message = 'Test message';
    event.metadata = { userId: '123', ipAddress: '192.168.1.1' };
    event.ingestedAt = '2024-01-15T10:30:00.000Z';
    event.createdAt = new Date('2024-01-15T10:30:00.000Z');

    const dto = new EventDto(event);

    expect(dto.id).toBe('uuid-123');
    expect(dto.eventId).toBe('evt_test123456');
    expect(dto.timestamp).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.service).toBe('test-service');
    expect(dto.message).toBe('Test message');
    expect(dto.metadata).toEqual({ userId: '123', ipAddress: '192.168.1.1' });
    expect(dto.ingestedAt).toBe('2024-01-15T10:30:00.000Z');
    expect(dto.createdAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
  });

  it('should handle null metadata', () => {
    const event = new Event();
    event.id = 'uuid-123';
    event.eventId = 'evt_test123456';
    event.timestamp = '2024-01-15T10:30:00.000Z';
    event.service = 'test-service';
    event.message = 'Test message';
    event.metadata = null;
    event.ingestedAt = '2024-01-15T10:30:00.000Z';
    event.createdAt = new Date('2024-01-15T10:30:00.000Z');

    const dto = new EventDto(event);

    expect(dto.metadata).toBeNull();
  });

  it('should handle undefined metadata as null', () => {
    const event = new Event();
    event.id = 'uuid-123';
    event.eventId = 'evt_test123456';
    event.timestamp = '2024-01-15T10:30:00.000Z';
    event.service = 'test-service';
    event.message = 'Test message';
    event.metadata = undefined as any;
    event.ingestedAt = '2024-01-15T10:30:00.000Z';
    event.createdAt = new Date('2024-01-15T10:30:00.000Z');

    const dto = new EventDto(event);

    expect(dto.metadata).toBeNull();
  });
});

describe('SearchResponseDto', () => {
  it('should create DTO with correct structure', () => {
    const event1 = new Event();
    event1.id = 'uuid-1';
    event1.eventId = 'evt_1';
    event1.timestamp = '2024-01-15T10:30:00.000Z';
    event1.service = 'test-service';
    event1.message = 'Message 1';
    event1.metadata = null;
    event1.ingestedAt = '2024-01-15T10:30:00.000Z';
    event1.createdAt = new Date('2024-01-15T10:30:00.000Z');

    const event2 = new Event();
    event2.id = 'uuid-2';
    event2.eventId = 'evt_2';
    event2.timestamp = '2024-01-15T11:30:00.000Z';
    event2.service = 'test-service';
    event2.message = 'Message 2';
    event2.metadata = { key: 'value' };
    event2.ingestedAt = '2024-01-15T11:30:00.000Z';
    event2.createdAt = new Date('2024-01-15T11:30:00.000Z');

    const items = [new EventDto(event1), new EventDto(event2)];

    const dto = new SearchResponseDto({
      page: 1,
      pageSize: 10,
      sortField: 'timestamp',
      sortOrder: 'DESC',
      total: 2,
      items,
    });

    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(10);
    expect(dto.sortField).toBe('timestamp');
    expect(dto.sortOrder).toBe('DESC');
    expect(dto.total).toBe(2);
    expect(dto.items).toHaveLength(2);
    expect(dto.items[0].eventId).toBe('evt_1');
    expect(dto.items[1].eventId).toBe('evt_2');
  });

  it('should handle empty results', () => {
    const dto = new SearchResponseDto({
      page: 1,
      pageSize: 10,
      sortField: 'timestamp',
      sortOrder: 'ASC',
      total: 0,
      items: [],
    });

    expect(dto.total).toBe(0);
    expect(dto.items).toHaveLength(0);
  });
});

