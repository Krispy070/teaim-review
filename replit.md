# TEAIM - Workday Implementation Hub

## Overview
TEAIM is a multi-tenant SaaS application designed to streamline Workday implementation projects. It offers comprehensive project management features, including AI-powered document analysis, action tracking, team wellness monitoring, and executive dashboards. The platform automates document processing for intelligent search and summarization, providing a customizable and secure environment for managing complex enterprise projects. Its business vision is to enhance efficiency and collaboration in Workday implementations, targeting a market of enterprises undergoing digital transformation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React and TypeScript using Vite, styled with Tailwind CSS and shadcn/ui. It features a custom branding system for customer-specific customization of logos, colors, and messaging.

### Technical Implementations
- **AI/ML**: AI-powered document analysis (risks, decisions, actions, summaries), RAG chat (pgvector with GPT-4o-mini), insights extraction.
- **Document Handling**: Document Viewer, CSV Exports, Inline Document Preview, Project Ingest Email, Inbound Email/Webhook Signature Verification, Artifact Viewer Pro (search highlighting, CSV filtering/sorting/export).
- **Communication & Collaboration**: Daily Brief (AI-generated summaries), Email-to-Ticket (dedicated mailboxes, attachment handling), Clip to TEAIM (conversation ingestion from Slack/Teams, AI summarization).
- **Project Management**: Request Sign-Off, Stages Batch from Template, Analytics Dashboard, Actions Due-Date System, Notifications System, Global Search (semantic + keyword), Meeting Summaries Propose, Sign-Off Package Builder, Project Setup Wizard, Full ZIP Backup/Restore, Project Export/Backup/Import.
- **Specialized Modules**:
    - **M&A Module**: Playbooks, Integrations (Grid, Kanban, Graph views), Integration Issues Board, Risks, Lessons Learned, Tenant Management. Includes features for offboarding checklists, cohorts filtering/export/pagination, and bulk actions.
    - **Integration Automation**: Integration Scheduler (cron-based, SLA monitoring), Secrets Vault, Integration Adapters (SFTP, HTTP with streaming, templating, retry logic), Webhooks/Slack Alerts.
    - **Tickets Module**: ServiceNow integration, Kanban board, CSV export, SLA Automation, Thread Search & Inline Images.
    - **Training Module**: Excel-based management, Calendar Views, Bulk Operations, Auto-Reminders.
    - **Template Library**: Partner-level and project-level template management with variable substitution.
    - **Release Manager Hardening**: Lifecycle messaging, release announcements, transcript-to-test-cases AI extraction, dedicated test pack dashboard, filtering/sorting for release tests, and CSV export.
    - **Plan Export Enhancement**: Owner-filtered CSV export with "My Items" quick export, "My Due Soon" and "Overdue" exports. Bulk owner assignment, "only overdue" filter, and "My Plan Glance Card" for dashboard. Deep-link sharing with filter state persistence via URL params.
    - **Deliverability Gauge**: Comprehensive email deliverability monitoring with gauge and 24h trend sparkline, alert worker for bounce/complaint rates.
    - **Release Testing Enhancement**: "Required only" filter for release tests with server-side filtering, localStorage persistence, and CSV export support.
    - **M&A Offboarding Enhancement**: Due date badges showing "in Xd" or "Xd overdue" with color coding, +1d/+7d bump buttons for quick due date adjustments.
    - **Onboarding Push Tracking**: Push-to-plan operation logging with onboarding_push_log table, dashboard card showing last push count with links to Plan and source step.
    - **Fix Pack v217 - Ops Email Testing**: Send Test Email card in Ops page allowing admins to test email pipeline end-to-end with category selection (plan, release, alerts, announcements, onboarding) and recipient input. Uses POST /api/email/test_send endpoint.
    - **Fix Pack v218 - Release Sign-off Enhancement**: Unified approve/reject panel in Release Manager drawer with decision notes textarea. Captures decidedBy (user email) and notes for both approval and rejection workflows.
    - **Fix Pack v219 - Plan Filtered Export**: "Export filtered CSV" link in Plan Builder that respects all active filters (owner, status, hasTicket, overdue, dueWithinDays, search query). Uses GET /api/plan/export_view.csv endpoint.
    - **Fix Pack v220 - Offboarding Filtered Export**: "Export CSV (filtered)" link in M&A Offboarding drawer that applies owner, status, and due filters (soon/overdue). Uses GET /api/ma/cohorts/:id/offboarding/export_filtered.csv endpoint.
    - **Fix Pack v221 - Playwright Bootstrap**: Updated Playwright config with increased timeouts (45s test, 6s expect), consolidated auth helpers with PROJECT_PATH constant, and ymd date formatter utility.
    - **Fix Pack v222 - Releases E2E Test**: E2E test for releases flow: import CSV → analyze → generate tests → open drawer → verify Req chip → schedule review.
    - **Fix Pack v223 - Plan Bulk E2E Test**: E2E test for plan bulk operations: seed onboarding → add tasks via API → push to plan → bulk set status/owner → verify filtered CSV export link.
    - **Fix Pack v224 - Offboarding & Deliverability E2E Test**: E2E test for offboarding and deliverability: create cohort → import XLSX → manage cohort → select all → assign owner → bump date → post webhook → verify deliverability gauge.
- **Testing**: Playwright-based end-to-end testing with comprehensive smoke suite covering Releases, Plan, and M&A Offboarding flows.
- **Concurrency & Pagination**: HTTP Global Concurrency Cap, Pagination + Index Pass.
- **Development Tools**: Adapter Sandbox & Debug Panel, trace-id middleware, GlobalErrorBoundary, DebugPanel.
- **Health Monitoring & API Layer**: Unified Page Feeds + Ingestion Health endpoints, API Guardrail Layer (25s timeout, exponential backoff, circuit breaker).
- **UI/UX Enhancements**: ConfirmDialog Component, Global Toast Notification System.

### System Design Choices
- **Backend**: Hybrid Node.js/Express (routing, proxying) and Python FastAPI (AI/ML, data operations).
- **API Design**: RESTful endpoints.
- **Data Processing**: Automated document parsing, chunking, embedding generation, vector storage.
- **Database**: PostgreSQL with pgvector extension, utilizing Drizzle ORM.
- **Storage**: Supabase bucket (`project-artifacts`) with Row-Level Security (RLS).
- **Authentication & Authorization**: Supabase Auth with magic links and six-tier role-based access.
- **AI & ML Integration**: GPT-5 for chat responses, OpenAI's `text-embedding-3-large` for semantic search, five-type memory extraction system, RAG implementation.

## External Dependencies

### Core Infrastructure
- **Supabase**: Database, authentication, file storage, real-time features.
- **OpenAI API**: GPT-5 for chat completions, `text-embedding-3-large` for embeddings.

### Third-Party Libraries
- **Radix UI primitives**: Integrated via shadcn/ui.
- **Document Processing**: `pypdf`, `python-docx`, `mailparser`, `mammoth`.
- **Database Connectivity**: `psycopg` (PostgreSQL), `pgvector`.
- **Validation**: `Zod` (TypeScript), `Pydantic` (Python).