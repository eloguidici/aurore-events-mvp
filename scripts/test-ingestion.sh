#!/bin/bash

# Test script for event ingestion
# Usage: ./scripts/test-ingestion.sh

BASE_URL="http://localhost:3000"

echo "Testing Event Ingestion API..."
echo ""

# Test 1: Single event ingestion
echo "Test 1: Ingesting a single event..."
curl -X POST "${BASE_URL}/events" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "service": "auth-service",
    "message": "User login successful",
    "metadata": {
      "user_id": "12345",
      "ip_address": "192.168.1.1"
    }
  }'
echo ""
echo ""

# Test 2: Health check
echo "Test 2: Health check (buffer)..."
curl -X GET "${BASE_URL}/health/buffer"
echo ""
echo ""

# Test 3: Query events (wait a bit for event to be processed)
echo "Test 3: Waiting 2 seconds for event to be processed..."
sleep 2
echo "Querying events (last hour)..."
# Use a simple date range - last hour to now
FROM_DATE=$(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-1H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT00:00:00Z")
TO_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
curl -X GET "${BASE_URL}/events?service=auth-service&from=${FROM_DATE}&to=${TO_DATE}&page=1&pageSize=10"
echo ""
echo ""

echo "✅ Tests completed!"

