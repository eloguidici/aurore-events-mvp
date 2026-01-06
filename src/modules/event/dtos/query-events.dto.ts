import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { IsSortField } from '../../common/decorators/sort-field.decorator';
import { IsSortOrder } from '../../common/decorators/sort-order.decorator';
import { IsValidTimeRange } from '../../common/decorators/valid-time-range.decorator';
import { envs } from '../../config/envs';
import { ALLOWED_SORT_FIELDS } from '../constants/query.constants';

export class QueryDto {
  @ApiProperty({
    description: 'Service name to filter events',
    example: 'user-service',
  })
  @IsString()
  @IsNotEmpty()
  service: string;

  @ApiProperty({
    description: 'Start timestamp for the query range (ISO 8601 format)',
    example: '2024-01-15T00:00:00Z',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  from: string; // ISO 8601 timestamp

  @ApiProperty({
    description:
      'End timestamp for the query range (ISO 8601 format). Must be after the "from" timestamp.',
    example: '2024-01-15T23:59:59Z',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @IsValidTimeRange({
    message: "'from' timestamp must be before 'to' timestamp",
  })
  to: string; // ISO 8601 timestamp

  @IsOptional()
  @IsInt({ message: 'page must be an integer number' })
  @Min(1, { message: 'page must not be less than 1' })
  @Type(() => Number)
  @Transform(({ value }) => value ?? 1)
  @ApiPropertyOptional({
    description: 'The page number for pagination',
    example: 1,
  })
  page?: number;

  @IsOptional()
  @IsInt({ message: 'pageSize must be an integer number' })
  @Min(1, { message: 'pageSize must not be less than 1' })
  @Type(() => Number)
  @Transform(({ value }) => value ?? envs.defaultQueryLimit)
  @ApiPropertyOptional({
    description: `The number of items per page for pagination (default: ${envs.defaultQueryLimit})`,
    example: envs.defaultQueryLimit,
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
