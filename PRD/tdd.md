# Technical Design Document (TDD)

## Cargo ERP for Domestic Logistics Operations

This TDD is written to directly support implementation of the cargo ERP you described: AWB and docket booking, invoice generation, outstanding tracking, credit limits, payment receipts, dashboard visibility, drag-and-drop imports, and editable grids. The underlying business flow is the same one captured in the client call and the earlier PRD: AWB booking → invoice → payment, docket booking → invoice → outstanding, plus dashboard-driven receivables control. 

---

## 1. Purpose

The purpose of this system is to replace Excel-heavy, manual cargo operations with a secure, enterprise-grade web platform that supports:

* domestic AWB booking
* docket-based booking
* rate application from uploaded freight sheets
* invoice creation
* customer outstanding tracking
* payment receipts
* GST amount separation
* credit-limit enforcement
* daily/monthly/yearly reporting
* drag-and-drop upload of CSV/Excel/PDF
* editable table/grid workflows
* reliable backend authentication and audit trails

This is not a general ERP. It is a **cargo billing and receivables ERP** optimized for domestic logistics operations. The PRD and client notes make it clear that the core business value is billing control, balance visibility, and reducing manual Excel work. 

---

## 2. Product Scope

### In scope

* Customer/party master
* AWB booking
* Docket booking
* Freight rate management
* Invoice generation
* GST calculation
* Payment receipt posting
* Outstanding and aging reports
* Credit limit checks
* Excel/CSV/PDF imports
* Editable grid UI
* Export to Excel/CSV/PDF
* Dashboard with receivable visibility
* Role-based access control
* Audit logs
* Secure authentication and session management

### Out of scope for MVP

* Warehouse management
* Fleet tracking
* Driver app
* Procurement
* HR/payroll
* International shipping workflows
* E-invoicing beyond what is needed for domestic GST billing

The client explicitly emphasized domestic billing and receivables, not warehouse or vehicle-heavy ERP functions. 

---

## 3. System Goals

### Business goals

1. Remove dependence on spreadsheets for booking and outstanding management.
2. Auto-apply latest freight rates from uploaded rate sheets.
3. Reduce billing mistakes.
4. Make payment and pending balance visible at party level.
5. Block or warn on credit limit breach.
6. Make invoice and outstanding data downloadable and searchable.
7. Enable fast daily operations for operations and accounts teams.

### Technical goals

1. Enterprise-grade security.
2. Backend authentication and authorization.
3. Atomic, reliable database writes.
4. Auditability for all financial actions.
5. Import reliability for files of different formats.
6. High availability and low-latency dashboard operations.

---

## 4. High-Level Architecture

### Recommended architecture

* **Frontend:** Next.js or React + TypeScript
* **Backend:** NestJS or FastAPI
* **Database:** PostgreSQL
* **Cache:** Redis
* **Queue:** BullMQ / RabbitMQ
* **File storage:** S3-compatible object storage
* **OCR/Parsing service:** Dedicated document parsing worker
* **Auth:** JWT + refresh tokens + RBAC + optional MFA
* **Logging:** Structured logs + audit log table
* **Deployment:** Docker + Kubernetes or managed container platform

### Service boundaries

1. **Auth Service**
2. **Master Data Service**
3. **Booking Service**
4. **Rate Engine Service**
5. **Invoice Service**
6. **Payments Service**
7. **Outstanding Service**
8. **Import/Parsing Service**
9. **Reports Service**
10. **Notification Service**
11. **Audit Service**

Keep the code modular even if deployed as a modular monolith first. That is safer for speed and easier to scale later.

---

## 5. Core Domain Model

### Main entities

* User
* Role
* Permission
* Party / Customer
* Airline / Vendor
* Freight Rate
* Rate Sheet Upload
* AWB Booking
* Docket Booking
* Invoice
* Invoice Line
* Tax Breakup
* Payment Receipt
* Outstanding Ledger
* Credit Limit
* Audit Log
* Import Job
* File Artifact
* Notification
* Due Date Policy

### Key relationships

* A Party has many bookings, invoices, and receipts.
* An AWB booking can generate one invoice.
* A docket booking can generate one invoice.
* An invoice can have multiple payment receipts.
* A party can have one or many credit limit rules depending on business need.
* Rate sheets are versioned and linked to carrier, route, validity period, and upload source.

---

## 6. Data Integrity Rules

These rules must be enforced in backend and database, not only in the UI:

1. Invoice amount must always equal invoice line sum + tax.
2. Outstanding must update only after successful invoice/payment transaction commits.
3. A payment receipt must reduce outstanding atomically.
4. Credit limit evaluation must happen before booking confirmation or invoice finalization.
5. Imported rate sheets must create a new version, not overwrite silently.
6. Every user action on financial data must be audit logged.
7. Invoice date must be the generation date when the user clicks generate, as the client requested. 
8. Due date must be visible in both invoice and outstanding views. 
9. GST amount must be tracked separately from freight/base charges. 

---

## 7. Authentication and Authorization

This is a non-negotiable enterprise requirement.

### Authentication

Use:

* secure login with hashed passwords
* JWT access token
* rotating refresh token
* server-side token revocation
* session timeout
* optional MFA for admin and finance users

### Password policy

* minimum length
* complexity rules
* password history prevention
* forced reset on first login
* account lock after repeated failures

### Authorization

Use strict RBAC:

* Super Admin
* Admin
* Operations
* Accounts
* Branch User
* Viewer
* Auditor

### Backend enforcement

Every protected API must check:

1. valid session/token
2. user role
3. permission scope
4. row-level access if applicable

### Example permission rules

* Operations can create bookings but cannot delete invoices.
* Accounts can post receipts but cannot edit rate history.
* Admin can manage credit limits and users.
* Viewer can only read reports.

### Audit requirements

Log:

* login success/failure
* password reset
* create/update/delete on financial records
* rate sheet upload
* invoice generation
* receipt posting
* credit limit override
* export/download actions for sensitive data

The PRD emphasizes role-based control and auditability as a core system expectation. 

---

## 8. Database Design

## 8.1 Recommended database strategy

Use PostgreSQL with:

* UUID primary keys
* foreign keys everywhere
* unique constraints on natural business keys
* soft delete for business records
* immutable historical tables for financial events
* transaction boundaries for booking/invoice/payment flows

## 8.2 Important tables

### users

* id
* name
* email
* password_hash
* status
* mfa_enabled
* created_at
* updated_at

### roles

* id
* name
* description

### permissions

* id
* key
* description

### role_permissions

* role_id
* permission_id

### parties

* id
* party_name
* gstin
* contact_details
* billing_address
* credit_limit
* credit_days
* status
* created_by
* created_at

### freight_rate_versions

* id
* carrier_name
* source_file_id
* valid_from
* valid_to
* status
* created_by

### freight_rates

* id
* version_id
* origin
* destination
* base_rate
* uom
* surcharge_rules
* active_flag

### awb_bookings

* id
* awb_no
* party_id
* origin
* destination
* airline_name
* booking_date
* shipment_date
* base_rate
* markup_amount
* gst_amount
* total_amount
* status
* created_by

### docket_bookings

* id
* docket_no
* party_id
* booking_date
* rate_fitted_amount
* markup_amount
* gst_amount
* total_amount
* status
* created_by

### invoices

* id
* invoice_no
* party_id
* booking_type
* booking_id
* invoice_date
* due_date
* subtotal
* gst_total
* grand_total
* paid_total
* outstanding_total
* status

### invoice_lines

* id
* invoice_id
* description
* qty
* rate
* amount
* tax_rate
* tax_amount
* line_total

### payment_receipts

* id
* receipt_no
* party_id
* invoice_id
* payment_date
* payment_amount
* gst_component
* freight_component
* payment_mode
* reference_no
* status

### outstanding_ledgers

* id
* party_id
* invoice_id
* original_amount
* paid_amount
* outstanding_amount
* invoice_date
* due_date
* aging_bucket
* last_updated_at

### import_jobs

* id
* file_name
* file_type
* source_module
* status
* error_summary
* uploaded_by
* created_at

### audit_logs

* id
* actor_user_id
* action_type
* entity_type
* entity_id
* before_data
* after_data
* ip_address
* user_agent
* created_at

This structure supports the operational flows already captured in the client call and the PRD: daily booking, invoice generation, outstanding, receipts, and exportable reporting. 

---

## 9. Booking Engine

## 9.1 AWB Booking flow

### Inputs

* AWB number
* party
* origin
* destination
* airline
* weight / pieces if needed
* imported rate sheet reference
* markup amount
* GST rule

### Flow

1. User creates or imports AWB booking.
2. System finds latest active rate version for airline and route.
3. System auto-populates base rate.
4. User can add extra price/markup.
5. System recalculates total.
6. Booking is saved.
7. Invoice may be generated immediately or later.

### Business rule

If client enters DEL → BLR, system must fetch the latest Indigo route rate and allow markup adjustment before invoice generation.

### Validation

* AWB number cannot duplicate within same carrier context.
* Base rate must exist or user must manually override with permission.
* Markup cannot make amount negative.
* Booking cannot proceed if mandatory customer fields are missing.

## 9.2 Docket Booking flow

### Inputs

* docket number
* party
* booking date
* route
* fitted rate
* markup
* GST
* due date policy

### Flow

1. User enters docket number.
2. System attaches party and route.
3. User fits rate manually or from reference rate table.
4. System stores booking.
5. Invoice can be generated on selected date.
6. Outstanding is calculated from invoice.

### Business rule

Invoice date is the date of generation, not docket entry date.

The call transcript and handwritten note both confirm this split between AWB-based and docket-based workflows. 

---

## 10. Freight Rate Management Engine

This is one of the most important parts.

### Purpose

Allow staff to upload a new carrier rate sheet in CSV, Excel, or PDF form and turn it into usable pricing rules without manual re-entry.

### Required features

* drag-and-drop upload
* file preview
* OCR/parsing for PDFs
* auto column/field mapping
* route extraction
* versioning
* effective date range
* route-level lookup
* markup overlay
* manual correction/editing
* publish/unpublish rate set

### Workflow

1. User uploads Indigo May rate PDF.
2. System extracts table data.
3. System identifies origin, destination, base rate, and conditions.
4. User verifies mapping in a grid.
5. System stores the rates as a new version.
6. When booking is created, system auto-fetches the latest active rate.
7. User can add company markup.
8. Final invoice uses base rate + markup + GST.

### Rate lookup precedence

1. exact carrier + origin + destination + active date
2. fallback to route family if configured
3. manual override by authorized user

### Versioning rule

Never overwrite historical rate sheets. Keep versions for audit and disputes.

---

## 11. Import Engine

### Supported uploads

* CSV
* XLSX
* PDF
* scanned PDF if OCR quality is acceptable

### Import behavior

* upload
* parse
* preview
* map columns
* validate rows
* flag errors
* allow user correction
* commit to DB only after confirmation

### Must support

* row-level error reporting
* duplicate detection
* partial import rejection
* retry after correction
* import history
* downloadable error file

### Import targets

* rate sheets
* AWB booking data
* docket data
* payment statement data
* customer master data

The earlier PRD specifically called out drag-drop import, editable mapping, and OCR-based document ingestion as a key workflow improvement. 

---

## 12. OCR / Parsing Service

### Purpose

Extract structured data from PDFs and scanned documents.

### Inputs

* freight rate PDFs
* invoices
* rate cards
* booking manifests
* payment advice documents

### Outputs

* structured JSON
* validation confidence
* extracted table rows
* detected entities

### Processing pipeline

1. file upload
2. OCR
3. structure detection
4. field mapping
5. confidence scoring
6. manual review screen
7. commit to domain service

### Reliability rule

If confidence is low, the system must not auto-commit. It must require human review.

### Parsing logs

Store:

* file name
* parse status
* fields extracted
* error details
* confidence score
* user correction history

---

## 13. Invoice Engine

### Purpose

Generate invoices from AWB or docket bookings.

### Rules

* invoice date = generation date
* invoice number auto-generated
* invoice must include GST breakup
* invoice can be edited before finalization
* invoice can be exported as PDF and Excel
* invoice line items remain editable
* invoice ties back to booking reference

### Workflow

1. user selects booking
2. system builds invoice draft
3. system applies freight rate
4. system adds markup
5. system calculates GST
6. user reviews/edit lines in table
7. user finalizes invoice
8. system saves invoice and updates outstanding

### Invoice states

* draft
* reviewed
* finalized
* sent
* partially paid
* paid
* cancelled

### Validation

* grand total = sum of lines + taxes
* invoice cannot be finalized if mandatory customer data missing
* final invoice must lock financial values except by credit note or authorized reversal

The PRD states invoice generation must be based on the booked shipment and due-date/aging logic must be visible in receivables. 

---

## 14. Payment and Receipt Engine

### Purpose

Track incoming money and reduce outstanding.

### Required fields

* party
* invoice reference
* payment date
* payment amount
* GST amount
* freight amount
* receipt number
* mode of payment
* bank reference
* remarks

### Workflow

1. payment received
2. accounts user records receipt
3. system creates receipt entry
4. outstanding reduces
5. ledger updates
6. dashboard reflects new balance
7. audit log stores event

### Important business rule

The user wants GST amount and amount breakup visible separately in payment and receipt views. That should be built into the data model and UI.

### Partial payment handling

* allow partial receipts
* reduce invoice balance proportionally
* keep aging on remaining balance
* show receipt history per invoice

### Reconciliation

Support bank statement matching later, but MVP can be manual with reference numbers.

The earlier notes specifically mention payment, GST amount, receipt generation, and ledger balance reduction as a linked flow. 

---

## 15. Outstanding and Aging Engine

### Purpose

Show party-wise receivables and overdue status in a way management can act on immediately.

### Features

* outstanding by party
* outstanding by invoice
* outstanding by docket
* aging buckets
* due date display
* over-limit alerts
* balance confirmation reports
* export to Excel/CSV/PDF

### Aging buckets

* current
* 1–15 days overdue
* 16–30 days overdue
* 31–60 days overdue
* 61–90 days overdue
* 90+ days overdue

### Dashboard rule

The dashboard must show:

* total outstanding
* overdue total
* due date
* credit limit used
* credit limit remaining
* top overdue parties

### Ledger rule

Every receipt must appear in the ledger with its date, amount, and invoice linkage.

The PRD makes it clear that outstanding and aging are central to the product, not an add-on. 

---

## 16. Dashboard Specification

### Dashboard must show

* today’s bookings
* today’s invoices
* total outstanding
* overdue receivables
* credit limit usage
* due invoices
* recent payments
* import job status
* failed imports
* rate sheet version status

### View filters

* day
* week
* month
* year
* custom range

### UX behavior

* one click to change time window
* widgets update without full page reload
* drill-down opens filtered list
* warning states use red/orange indicators
* balance and overdue figures must be prominent

The handwritten note specifically asked for outstanding dashboard visibility, credit limit, and due date display, which matches the PRD direction. 

---

## 17. Editable Grid / Table System

This must be a core platform component, not a one-off feature.

### Must support

* inline edit
* row edit
* multi-row selection
* keyboard navigation
* paste from Excel
* cell validation
* undo for unsaved changes
* save all / save row
* row locking after finalization

### Editable entities

* bookings
* invoices
* rates
* parties
* receipts
* imports

### UI rules

* numeric columns right aligned
* text columns left aligned
* filters at top
* sticky headers
* pagination or infinite scroll
* row-level status badges
* quick action buttons

The PRD explicitly described inline-editable tables as a required pattern. 

---

## 18. Notifications and Alerts

### Trigger events

* booking created
* invoice generated
* invoice overdue
* credit limit near breach
* credit limit breached
* payment received
* import success/failure
* OCR parse failure
* rate sheet approved

### Channels

* in-app
* email
* SMS
* WhatsApp
* push notification later

### Alert rules

* overdue invoices must be flagged
* limit breach must be flagged instantly
* failed imports must show row-level errors
* payment receipt should notify relevant user groups

---

## 19. API Design

### REST API conventions

Use versioned endpoints:

* `/api/v1/auth/login`
* `/api/v1/parties`
* `/api/v1/awb-bookings`
* `/api/v1/docket-bookings`
* `/api/v1/rate-versions`
* `/api/v1/invoices`
* `/api/v1/payments`
* `/api/v1/outstanding`
* `/api/v1/imports`
* `/api/v1/reports`
* `/api/v1/audit-logs`

### Core endpoints

* POST login
* POST refresh token
* GET/POST/PUT parties
* POST booking
* POST invoice generation
* POST payment receipt
* GET outstanding by party
* POST file upload/import
* GET report export
* GET audit trail

### API design rules

* all write routes require auth
* all financial writes use transactions
* all imports are asynchronous jobs
* all exports are permission-checked
* all sensitive fetches are logged

---

## 20. Backend Reliability Requirements

This is where enterprise level matters most.

### Transaction safety

Use database transactions for:

* booking creation
* invoice generation
* receipt posting
* outstanding update
* credit check + booking save

### Idempotency

Imports and payment posting must support idempotency to avoid double insert on retries.

### Queue-based jobs

Use background queues for:

* OCR parsing
* PDF generation
* exports
* notifications
* reconciliation tasks

### Retry policy

* network API calls retry with backoff
* import jobs retry safely
* OCR jobs retry only if file is intact
* never retry financial writes blindly

### Monitoring

* error rates
* response times
* queue length
* parse failures
* failed auth attempts
* DB query latency

### Backup and recovery

* daily backup
* point-in-time recovery
* tested restore drills
* immutable backup retention

---

## 21. Security Requirements

### Must-have controls

* password hashing with strong algorithm
* refresh token rotation
* CSRF protection if cookies are used
* rate limiting
* IP logging
* secure headers
* HTTPS everywhere
* field-level encryption for sensitive data where needed
* strict input validation
* output encoding
* file type validation
* malware scanning on upload
* least-privilege access

### File upload security

Because the ERP accepts CSV, Excel, and PDF uploads, every file must be:

* MIME validated
* size limited
* virus scanned
* stored safely
* processed in sandboxed workers

### Authorization security

* no direct client-side trust
* all permission checks in backend
* row-level access restrictions where required

### Audit security

* immutable audit history for financial changes
* admin override logs
* export logs
* deletions should be soft-delete or reversal-based, not hard delete

---

## 22. Database Reliability Rules

### Database design principles

* every table must have created_at and updated_at
* soft delete where business continuity matters
* immutable history for invoices, payments, and audit events
* foreign keys on all relationships
* unique constraints on business identifiers

### Concurrency handling

Use:

* row locking on critical invoice/payment operations
* optimistic locking on editable grids if needed
* version columns for update conflict detection

### Financial integrity

Never allow:

* negative receivable balance without explicit credit note logic
* duplicate receipt posting against same reference
* invoice change after finalization except through controlled reversal

---

## 23. Permission Model

Example matrix:

| Role        | Access                                   |
| ----------- | ---------------------------------------- |
| Super Admin | everything                               |
| Admin       | users, settings, parties, rates          |
| Operations  | bookings, dashboards, invoice drafts     |
| Accounts    | invoices, receipts, outstanding, reports |
| Branch User | booking entry, import upload             |
| Viewer      | read-only reports                        |
| Auditor     | reports + audit logs only                |

The PRD already set up role-based access as a system requirement. 

---

## 24. Edge Cases

1. Uploaded rate PDF has missing rows.
2. Duplicate AWB number in same day.
3. Invoice generated before rate approval.
4. Payment received for wrong invoice.
5. Partial payment with GST split.
6. Customer crosses credit limit while booking is in progress.
7. OCR confidence too low.
8. Excel file has merged cells or corrupted formatting.
9. Rate version validity overlaps another version.
10. Invoice finalized, then a correction is needed.
11. Overdue report after timezone/date boundary change.
12. User loses session mid-upload.
13. Export is requested for a very large result set.
14. Admin disables a party while outstanding still exists.

---

## 25. Acceptance Criteria

### Booking

* AWB booking can be created from uploaded or manual input.
* Docket booking can be created from manual input.
* Rates auto-apply from latest valid file.
* User can edit rows before save.

### Invoice

* Invoice date equals generation date.
* Markup can be added on top of airline rate.
* GST is calculated separately.
* Invoice export works.

### Outstanding

* Outstanding updates after invoice creation.
* Receipt reduces outstanding.
* Due date and aging are visible.
* Credit limit breach warns or blocks.

### Import

* CSV/Excel/PDF upload works.
* File can be mapped and corrected.
* Invalid rows are isolated.
* Parse errors are visible.

### Security

* Unauthorized access is blocked server-side.
* Audit log captures sensitive operations.
* Passwords are never stored in plain text.

---

## 26. Recommended MVP Build Order

1. Auth and user roles
2. Party master
3. Freight rate import
4. AWB booking
5. Docket booking
6. Invoice engine
7. Payment receipt engine
8. Outstanding and aging
9. Dashboard
10. Import wizard
11. Export and reports
12. Audit logs
13. Notifications
14. OCR parsing enhancements

This order keeps the first release focused on the exact business flow the client described. 

---

## 27. Suggested Tech Stack for Fast Vibe Coding

### Frontend

* Next.js
* TypeScript
* Tailwind CSS
* TanStack Table
* React Hook Form
* Zod

### Backend

* NestJS or FastAPI
* PostgreSQL
* Prisma or SQLAlchemy
* Redis
* BullMQ / Celery

### Infrastructure

* Docker
* S3 storage
* Cloud Run / ECS / Kubernetes
* GitHub Actions CI/CD
* Sentry
* Prometheus + Grafana

### File/ocr tools

* AWS Textract or similar OCR parser
* PDF extraction worker
* CSV/XLSX parsing libraries

---

## 28. Final Implementation Notes

This ERP must feel fast, simple, and operational, not heavy or overbuilt. The client’s real need is not a generic enterprise ERP; it is a **cargo billing and receivables control system** with:

* daily bookings
* invoice generation
* outstanding tracking
* due date visibility
* credit limit alerts
* rate-sheet import
* editable operations
* secure backend auth
* reliable data storage
* audit trails

That is the center of the product, and the implementation should stay loyal to that. 

If you want, I can turn this into a **developer-ready TDD in proper markdown format with tables, API specs, and folder structure**, or a **vibe-coding prompt pack** for Cursor/Replit/Claude Code.
