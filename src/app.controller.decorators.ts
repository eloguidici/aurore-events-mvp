import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { API_RESPONSES } from './modules/common/constants/constants';

/**
 * Swagger decorators for GET /health endpoint
 * Combines all API documentation decorators for health check
 */
export function ApiHealthCheck() {
  return applyDecorators(
    ApiOperation({ summary: 'Check server health status' }),
    ApiResponse({ status: 200, description: API_RESPONSES.HEALTH_CHECK_READY }),
    ApiResponse({
      status: 503,
      description: API_RESPONSES.HEALTH_CHECK_NOT_READY,
    }),
  );
}

/**
 * Swagger decorators for GET /live endpoint
 * Combines all API documentation decorators for liveness check
 */
export function ApiLivenessCheck() {
  return applyDecorators(
    ApiOperation({ summary: 'Check server liveness' }),
    ApiResponse({
      status: 200,
      description: API_RESPONSES.LIVENESS_CHECK_NOT_SHUTTING_DOWN,
    }),
    ApiResponse({
      status: 503,
      description: API_RESPONSES.LIVENESS_CHECK_SHUTTING_DOWN,
    }),
  );
}

/**
 * Swagger decorators for GET /ready endpoint
 * Combines all API documentation decorators for readiness check
 */
export function ApiReadinessCheck() {
  return applyDecorators(
    ApiOperation({ summary: 'Check server readiness' }),
    ApiResponse({
      status: 200,
      description: API_RESPONSES.READINESS_CHECK_READY,
    }),
    ApiResponse({
      status: 503,
      description: API_RESPONSES.READINESS_CHECK_NOT_READY,
    }),
  );
}
