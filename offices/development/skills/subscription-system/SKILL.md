---
name: subscription-system
description: Integration with the Usabiliti Subscription Management System (subscription-system). Use when implementing SaaS features that require subscription management, billing, payments, multi-tenant customer management, trials, credits, invoices, or any recurring billing logic. This skill provides the architecture, API contracts, data models, and integration patterns for building on top of the subscription-system.
---

# Subscription System Integration

Skill for implementing SaaS solutions integrated with the Usabiliti subscription management system — a production-ready, multi-tenant billing platform built with Next.js 16, Prisma 7, and MySQL.

## When to use

- Implementing subscription flows (create, upgrade, downgrade, cancel, pause)
- Integrating payment gateways (Stripe, PagSeguro, Cielo)
- Building checkout experiences or customer self-service portals
- Managing customers, invoices, installments, or credits
- Adding trial logic, proration, or coupon systems
- Implementing webhook consumers or producers
- Building multi-tenant features that depend on billing state
- Creating external/partner API integrations
- Implementing LGPD-compliant data handling

## Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│                  Presentation Layer                     │
│  (API Routes, Middleware, Hooks, Components)            │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    Core Layer                           │
│  (Use Cases, Interfaces, Domain Errors, DI Container)  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Infrastructure Layer                       │
│  (Prisma Repos, Services, Gateways, Notifications)     │
└─────────────────────────────────────────────────────────┘
```

Dependencies always point inward: `Presentation → Core ← Infrastructure`

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| ORM | Prisma 7 + MySQL |
| Auth | NextAuth 5 (Credentials, Google, GitHub) |
| Validation | Zod 4 |
| Queues | BullMQ + IORedis |
| Payments | Stripe 20, PagSeguro, Cielo |
| Email | Nodemailer, Resend |
| SMS | Twilio |
| UI | React 19 + Radix UI + Tailwind 4 |

## Project location

Repository: `usabiliti/subscription-system`
Local path: `D:\Anselmo\Projetos\Repositorio\usabiliti\subscription-system`

## Multi-tenant model

Every data operation requires `companyId`. This is enforced at three levels:

1. **Auth**: `companyId` extracted from JWT session
2. **API routes**: Pass `companyId` to all service/repository calls
3. **Prisma middleware**: Intercepts queries, validates `companyId` present, blocks cross-tenant access

```typescript
// CORRECT — always include companyId
const customer = await customerRepo.findById(companyId, customerId);

// WRONG — never query without companyId
const customer = await prisma.customer.findUnique({ where: { id: customerId } });
```

**Roles**: GLOBAL_ADMIN, COMPANY_ADMIN, COMPANY_USER

## Core entities

### Primary entities (always require companyId)

| Entity | Purpose |
|--------|---------|
| Company | Tenant (empresa). Root of all data isolation. |
| User | Authenticated user with role and companyId. |
| Product | SaaS product with billing model, trial config, gateway config. |
| ProductPlan | Plan tier within a product (Free, Pro, Enterprise). |
| Customer | End customer who subscribes. Has payment data, credits. |
| Subscription | Active subscription linking Customer → ProductPlan. |
| Invoice | Billing document generated per billing cycle. |
| Installment | Individual payment installment within a subscription. |
| Payment | Payment attempt linked to invoice or installment. |

### Supporting entities

| Entity | Purpose |
|--------|---------|
| CustomerCredit / CreditUsage | Prepaid credit system with expiration. |
| Coupon / CouponRedemption | Discount coupons (percentage, fixed, trial extension). |
| SubscriptionPause / PausePolicy | Pause/resume logic with configurable policies. |
| SubscriptionUpgrade | Proration records for plan changes. |
| BillingModel | Billing interval (weekly, monthly, quarterly, semiannual, annual). |
| BillingPolicy | Dunning and retry rules. |
| NotificationConfig / NotificationLog | Multi-channel notification system. |
| WebhookEndpoint / WebhookDelivery | Outbound webhook system with retry. |
| ApiPartner / ApiAccessLog | External partner API with key management. |
| CheckoutSession / CheckoutBranding | Hosted checkout with per-tenant branding. |
| AuditLog | Immutable audit trail. |
| DataAnonymizationRequest | LGPD anonymization workflow. |

## Key enums

```typescript
// Subscription lifecycle
type SubscriptionStatus = 'TRIAL' | 'PENDING_CONFIRMATION' | 'ACTIVE' | 'PAUSED'
  | 'SUSPENDED' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

// Payment flow
type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
  | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'DISPUTED' | 'CHARGEBACK';

// Invoice lifecycle
type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';

// Installment lifecycle
type InstallmentStatus = 'PENDING' | 'DUE' | 'OVERDUE' | 'PAID'
  | 'PAID_WITH_CREDIT' | 'CANCELLED' | 'REFUNDED';

// Billing intervals
type BillingIntervalType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY'
  | 'SEMIANNUAL' | 'ANNUAL';

// Payment methods
type PaymentMethodType = 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO' | 'PIX';

// Notification channels
type NotifyChannel = 'EMAIL' | 'SMS' | 'BOTH';

// User roles
type UserRole = 'GLOBAL_ADMIN' | 'COMPANY_ADMIN' | 'COMPANY_USER';
```

## API endpoints reference

### Customers
```
GET    /api/v1/customers              # List (paginated, filtered by companyId)
POST   /api/v1/customers              # Create
GET    /api/v1/customers/:id          # Get by ID
PUT    /api/v1/customers/:id          # Update
POST   /api/v1/customers/:id/credits  # Add credits
```

### Subscriptions
```
GET    /api/v1/subscriptions              # List
POST   /api/v1/subscriptions              # Create
GET    /api/v1/subscriptions/:id          # Get by ID
PUT    /api/v1/subscriptions/:id          # Update
PATCH  /api/v1/subscriptions/:id/pause    # Pause
PATCH  /api/v1/subscriptions/:id/plan     # Upgrade/Downgrade
PATCH  /api/v1/subscriptions/:id/trial    # Manage trial
```

### Invoices & Installments
```
GET    /api/v1/invoices                   # List
POST   /api/v1/invoices                   # Create
GET    /api/v1/invoices/:id               # Get by ID
PUT    /api/v1/invoices/:id               # Update
GET    /api/v1/installments               # List
POST   /api/v1/installments               # Create
GET    /api/v1/installments/:id           # Get by ID
PUT    /api/v1/installments/:id           # Update
```

### Products & Plans
```
GET    /api/v1/products                   # List
POST   /api/v1/products                   # Create
GET    /api/v1/products/:id               # Get by ID
PUT    /api/v1/products/:id               # Update
GET    /api/v1/billing-models             # List billing models
POST   /api/v1/billing-models             # Create billing model
```

### Coupons
```
GET    /api/v1/coupons                    # List
POST   /api/v1/coupons                    # Create
GET    /api/v1/coupons/:id                # Get by ID
PUT    /api/v1/coupons/:id                # Update
```

### Webhooks
```
GET    /api/v1/webhooks                   # List endpoints
POST   /api/v1/webhooks                   # Create endpoint
GET    /api/v1/webhooks/:id               # Get endpoint
PUT    /api/v1/webhooks/:id               # Update endpoint
GET    /api/v1/webhooks/deliveries        # Delivery history
POST   /api/webhooks/payment/:gateway     # Receive gateway webhooks
```

### Customer Portal (Self-Service)
```
POST   /api/v1/portal/auth/magic-link     # Request magic link
POST   /api/v1/portal/auth/verify         # Verify magic link
POST   /api/v1/portal/auth/logout         # Logout
PATCH  /api/v1/portal/subscriptions/:id/cancel  # Cancel
PATCH  /api/v1/portal/subscriptions/:id/pause   # Pause
PATCH  /api/v1/portal/subscriptions/:id/plan    # Change plan
```

### External Partner API
```
GET    /api/external/v1/customers         # List customers
POST   /api/external/v1/customers         # Create customer
GET    /api/external/v1/subscriptions     # List subscriptions
POST   /api/external/v1/subscriptions     # Create subscription
GET    /api/external/v1/subscriptions/:id # Get subscription
PUT    /api/external/v1/subscriptions/:id # Update subscription
```

### LGPD
```
POST   /api/v1/lgpd/anonymize            # Request anonymization
PATCH  /api/v1/lgpd/anonymize/:id        # Confirm anonymization
GET    /api/v1/lgpd/export/:customerId   # Export customer data
```

## Dependency Injection

```typescript
import { getContainer, REPOSITORY_TOKENS, SERVICE_TOKENS } from '@/core/di/container-setup';

// Resolve repositories
const container = getContainer();
const customerRepo = container.resolve<ICustomerRepository>(REPOSITORY_TOKENS.CustomerRepository);
const subscriptionRepo = container.resolve<ISubscriptionRepository>(REPOSITORY_TOKENS.SubscriptionRepository);

// Resolve services
const logger = container.resolve<ILogger>(SERVICE_TOKENS.Logger);
```

### Repository tokens
- `REPOSITORY_TOKENS.CustomerRepository`
- `REPOSITORY_TOKENS.SubscriptionRepository`
- `REPOSITORY_TOKENS.InvoiceRepository`
- `REPOSITORY_TOKENS.InstallmentRepository`
- `REPOSITORY_TOKENS.PaymentRepository`
- `REPOSITORY_TOKENS.CreditRepository`

## Use case patterns

All use cases follow the same pattern:

```typescript
import { ICustomerRepository } from '@/core/repositories/customer.repository';
import { ISubscriptionRepository } from '@/core/repositories/subscription.repository';

export class CreateSubscriptionUseCase {
  constructor(
    private subscriptionRepo: ISubscriptionRepository,
    private customerRepo: ICustomerRepository
  ) {}

  async execute(params: CreateSubscriptionParams): Promise<Subscription> {
    // 1. Validate business rules
    // 2. Execute domain logic
    // 3. Persist via repository
    // 4. Return result
  }
}
```

### Available use cases

**Subscription**: CreateSubscription, CancelSubscription, PauseSubscription, ResumeSubscription, UpgradePlan, DowngradePlan, CalculateProrate, StartTrial, ExtendTrial, ConvertTrial, CancelTrial

**Credits**: AddCredit, ExpireCredits, TransferCredits, UseCreditsForInstallment, UseCreditsForInvoice

## Payment gateway integration

The system uses an adapter pattern for payment gateways:

```typescript
interface IPaymentGateway {
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;
  capturePayment(paymentId: string): Promise<CaptureResult>;
  refundPayment(paymentId: string, amount?: number): Promise<RefundResult>;
  createCustomer(params: CustomerParams): Promise<GatewayCustomer>;
  tokenizeCard(params: CardParams): Promise<TokenResult>;
}
```

**Supported gateways**: Stripe, PagSeguro, Cielo
**Supported methods**: CREDIT_CARD, DEBIT_CARD, BOLETO, PIX

Gateway selection is per-product via `ProductGatewayConfig`.

## Error handling

```typescript
import { withErrorHandler } from '@/presentation/middleware/error-handler.middleware';
import { NotFoundError, BusinessRuleViolationError } from '@/core/errors/domain-errors';

// In API routes — always wrap with error handler
export const GET = withErrorHandler(async (req: NextRequest) => {
  // Throw domain errors — they map to HTTP status automatically
  throw new NotFoundError('Customer', customerId);           // → 404
  throw new BusinessRuleViolationError('Subscription paused'); // → 422
  throw new DuplicateEntryError('Customer', 'email');         // → 409
  throw new SecurityViolationError('Cross-tenant access');    // → 403
});
```

## Validation with Zod

```typescript
import { z } from 'zod';

const createCustomerSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  document: z.string(),
  documentType: z.enum(['CPF', 'CNPJ']),
});

// In API route
const body = createCustomerSchema.parse(await req.json());
```

## Security rules (mandatory)

1. **Multi-tenancy**: ALWAYS include `companyId` in every query
2. **Ownership**: Validate entity belongs to company before UPDATE/DELETE
3. **Input sanitization**: Validate all inputs with Zod schemas
4. **Mass assignment**: Use whitelisted fields only (never spread raw input)
5. **Rate limiting**: Respect 50 queries/second per companyId
6. **Query timeout**: 30 seconds maximum
7. **Pagination**: Maximum 1000 results per page
8. **Secrets**: NEVER store API keys, tokens, or secrets in code

## Integration checklist

When building a new SaaS feature that integrates with subscription-system:

- [ ] Identify which subscription-system entities are involved
- [ ] Use DI container to resolve repositories and services (never import Prisma directly)
- [ ] Always pass `companyId` from authenticated session
- [ ] Validate inputs with Zod schemas
- [ ] Use domain error classes for business rule violations
- [ ] Wrap API routes with `withErrorHandler`
- [ ] Handle subscription status transitions correctly (check current status before mutations)
- [ ] Implement webhook consumers if reacting to payment/subscription events
- [ ] Add audit log entries for sensitive operations
- [ ] Write unit tests for use cases and integration tests for API routes
- [ ] Follow git-workflow: branch `agent/{agent-name}/{task-id}-{desc}`

## Common integration patterns

### Check subscription status before feature access
```typescript
const subscription = await subscriptionRepo.findActiveByCustomerId(companyId, customerId);
if (!subscription || !['ACTIVE', 'TRIAL'].includes(subscription.status)) {
  throw new BusinessRuleViolationError('Active subscription required');
}
```

### Create subscription with trial
```typescript
const startTrialUseCase = new StartTrialUseCase(subscriptionRepo, customerRepo);
await startTrialUseCase.execute({
  companyId,
  customerId,
  productPlanId,
  trialDays: 14,
});
```

### Process plan upgrade
```typescript
const upgradePlanUseCase = new UpgradePlanUseCase(subscriptionRepo);
await upgradePlanUseCase.execute({
  companyId,
  subscriptionId,
  newPlanId,
  prorate: true,
});
```

### Add customer credits
```typescript
const addCreditUseCase = new AddCreditUseCase(creditRepo, customerRepo);
await addCreditUseCase.execute({
  companyId,
  customerId,
  amount: 50.00,
  description: 'Referral bonus',
  expiresAt: new Date('2026-12-31'),
});
```

## Notification events

The system emits notifications for key lifecycle events:

| Event | Channel | Trigger |
|-------|---------|---------|
| Subscription created | EMAIL | On creation |
| Trial expiring | EMAIL, SMS | 3 days before |
| Payment succeeded | EMAIL | On payment |
| Payment failed | EMAIL, SMS | On failure + retry schedule |
| Invoice generated | EMAIL | On generation |
| Subscription cancelled | EMAIL | On cancellation |
| Subscription paused | EMAIL | On pause |

Configure triggers via `NotificationConfig` and `NotificationTrigger` entities.

## File structure reference

```
subscription-system/
├── prisma/schema.prisma              # 58 models, 1630 lines
├── src/
│   ├── app/api/v1/                   # Admin API routes
│   ├── app/api/external/v1/          # Partner API routes
│   ├── app/api/webhooks/             # Gateway webhook receivers
│   ├── core/
│   │   ├── di/                       # DI container + setup
│   │   ├── use-cases/                # Business logic
│   │   ├── repositories/             # Repository interfaces
│   │   ├── interfaces/               # Service interfaces
│   │   └── errors/                   # Domain errors
│   ├── infrastructure/
│   │   ├── database/repositories/    # Prisma implementations
│   │   ├── services/                 # Payment, notification, webhook, LGPD
│   │   └── gateways/                 # Stripe, PagSeguro, Cielo adapters
│   └── presentation/
│       ├── middleware/               # Error handler, auth middleware
│       └── hooks/                    # React hooks for API
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── CHECKOUT.md
│   └── EXAMPLES.md
```
