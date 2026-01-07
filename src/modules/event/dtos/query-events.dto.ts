import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { IsMaxTimeRange } from '../../common/decorators/max-time-range.decorator';
import { IsSortField } from '../../common/decorators/sort-field.decorator';
import { IsSortOrder } from '../../common/decorators/sort-order.decorator';
import { IsValidTimeRange } from '../../common/decorators/valid-time-range.decorator';
import { createQueryConfig } from '../../config/config-factory';
import { createServiceConfig } from '../../config/config-factory';
import { ALLOWED_SORT_FIELDS } from '../constants/query.constants';
import { IsParseableTimestamp } from './create-event.dto';

// Get config for decorators (static values needed at compile time)
const serviceConfig = createServiceConfig();
const queryConfig = createQueryConfig();

export class QueryDto {
  @ApiProperty({
    description: 'Service name to filter events',
    example: 'user-service',
    maxLength: serviceConfig.nameMaxLength,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(serviceConfig.nameMaxLength, {
    message: `service name must be at most ${serviceConfig.nameMaxLength} characters`,
  })
  service: string;

  @ApiProperty({
    description:
      'Start timestamp for the query range in ISO 8601 format (UTC). All timestamps are in UTC.',
    example: '2024-01-15T00:00:00.000Z',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @IsParseableTimestamp()
  from: string; // ISO 8601 timestamp (UTC)

  @ApiProperty({
    description:
      'End timestamp for the query range in ISO 8601 format (UTC). Must be after the "from" timestamp. All timestamps are in UTC.',
    example: '2024-01-15T23:59:59.000Z',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @IsParseableTimestamp()
  @IsValidTimeRange({
    message: "'from' timestamp must be before 'to' timestamp",
  })
  @IsMaxTimeRange(undefined, {
    message: `Time range between 'from' and 'to' must not exceed ${queryConfig.maxTimeRangeDays} days`,
  })
  to: string; // ISO 8601 timestamp (UTC)

  @IsOptional()
  @IsInt({ message: 'page must be an integer number' })
  @Min(1, { message: 'page must not be less than 1' })
  @Max(10000, { message: 'page must not exceed 10000' })
  @Type(() => Number)
  @Transform(({ value }) => value ?? 1)
  @ApiPropertyOptional({
    description: 'The page number for pagination (max: 10000)',
    example: 1,
    maximum: 10000,
  })
  page?: number;

  @IsOptional()
  @IsInt({ message: 'pageSize must be an integer number' })
  @Min(1, { message: 'pageSize must not be less than 1' })
  @Max(queryConfig.maxLimit, {
    message: `pageSize must not exceed ${queryConfig.maxLimit}`,
  })
  @Type(() => Number)
  @Transform(({ value }) => value ?? queryConfig.defaultLimit)
  @ApiPropertyOptional({
    description: `The number of items per page for pagination (default: ${queryConfig.defaultLimit}, max: ${queryConfig.maxLimit})`,
    example: queryConfig.defaultLimit,
    maximum: queryConfig.maxLimit,
  })
  pageSize?: number;

  @IsOptional()
  @IsString()
  @IsSortField({
    message: `sortField must be one of: ${ALLOWED_SORT_FIELDS.join(', ')}`,
  })
  @ApiPropertyOptional({
    description: 'The field to sort by',
    example: 'timestamp',
    enum: ALLOWED_SORT_FIELDS,
  })
  sortField?: string;

  @IsOptional()
  @IsString()
  @IsSortOrder({
    message: 'sortOrder must be either ASC or DESC (case insensitive)',
  })
  @ApiPropertyOptional({
    description: 'The order to sort (ASC or DESC)',
    example: 'DESC',
  })
  sortOrder?: 'ASC' | 'DESC';
}
