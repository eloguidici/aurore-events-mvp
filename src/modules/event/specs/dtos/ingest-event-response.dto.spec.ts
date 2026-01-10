import { IngestResponseDto } from '../../dtos/ingest-event-response.dto';

describe('IngestResponseDto', () => {
  it('should create DTO with correct structure', () => {
    const data = {
      eventId: 'evt_test123456',
      queuedAt: '2024-01-15T10:30:00.000Z',
    };

    const dto = new IngestResponseDto(data);

    expect(dto.status).toBe('accepted');
    expect(dto.event_id).toBe('evt_test123456');
    expect(dto.queued_at).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should always set status to accepted', () => {
    const data = {
      eventId: 'evt_another',
      queuedAt: '2024-01-15T11:00:00.000Z',
    };

    const dto = new IngestResponseDto(data);

    expect(dto.status).toBe('accepted');
  });
});
