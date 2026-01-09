# Grafana Dashboards

This directory contains Grafana dashboards for monitoring the Aurore Events application.

## Dashboard: Aurore Events - System Overview

A comprehensive dashboard showing:
- Buffer metrics (size, utilization, throughput)
- Event processing metrics
- Business metrics
- Health status

## Importing Dashboards

Dashboards are automatically provisioned when Grafana starts. You can also import them manually:

1. Open Grafana at http://localhost:3001
2. Go to Dashboards → Import
3. Upload the JSON file from this directory

## Creating Custom Dashboards

You can create custom dashboards in Grafana UI and export them to this directory for version control.

**Note**: The dashboard JSON format is complex. For now, create dashboards manually in Grafana UI. The dashboard structure will be saved automatically by Grafana's provisioning system.
