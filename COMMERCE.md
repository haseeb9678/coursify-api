# Course enrollment and Stripe Sandbox

## Architecture

The commerce module uses the existing cookie JWT and current-user checks. Student GraphQL queries scope every enrollment, order, payment, and learning query to the authenticated student. Admin queries require the admin role. Commerce mutations verify the frontend origin in addition to Apollo CSRF protection.

An enrollment is a unique student/course entitlement. A purchase order records a title and integer pricing snapshot. A payment records a Stripe Checkout attempt. Refunds and disputes are separate records linked to the attempt. The webhook table stores delivery and processing metadata, including a retry lease and a safe error code. Card data and Stripe secrets stay out of these tables. A verified Stripe-hosted receipt link is available in the owning student?s purchase details.

The migration creates commerce tables, indexes, constraints, and foreign keys. Restrictive foreign keys preserve access and financial history. Draft courses with no review, enrollment, or order history remain eligible for deletion. The existing user deletion policy continues to apply.

## State and access rules

- **Free enrollment** creates an active enrollment in a serializable transaction. Repeating enrollment returns the existing active or completed record. It creates zero orders and payments.
- **Pending checkout** saves the order and attempt before sending a Stripe request. Stripe requests use the persisted idempotency key and frozen checkout parameters. PostgreSQL restricts each student/course/environment to one pending order and each order to one open attempt. Consecutive attempts after expiration receive a new order and payment ID. Card retries inside an open Stripe session update the failure details on that attempt.
- **Payment confirmation** verifies provider metadata, references, Sandbox mode, currency, amounts, Checkout completion, succeeded PaymentIntent, and captured card charge. One transaction records the payment, order, entitlement, and any webhook completion. A verified duplicate payment or entitlement conflict is retained and flagged for review.
- **Cancellation return** reads provider state. An open session can be resumed, and a verified expired or failed session can be followed by a new checkout. The browser's return URL has no effect on access or payment state.
- **Refunds and disputes** are reconciled from Stripe and recorded individually. A partial, pending, or failed refund preserves access. A full successful refund or lost dispute revokes the associated paid entitlement unless another valid purchase supports it. Open disputes are flagged for review and preserve access. A later event cannot automatically reactivate a revoked enrollment. Operators initiate refunds and manage disputes in Stripe Sandbox.
- **Course lifecycle** allows new enrollments only while published. Enrolled students can access published and archived curricula. Returning a course to draft keeps the entitlement and withholds the latest editable content until republished. The LMS currently has no published curriculum snapshots. A payment that succeeds after a course becomes unavailable is recorded and flagged for operator review.
- **Learning materials** are returned only through the enrollment-gated GraphQL query. Existing media and document origins retain their current storage permissions. External public URLs remain reachable by anyone who already has the URL.

## Stripe setup

Use a separate development or staging database and Stripe Sandbox. Install the server dependencies using the committed npm lockfile. To add the pinned SDK in a fresh integration branch, use `npm install --save-exact stripe@23.2.0`. The provider pins API version `2026-11-18.endive` and uses Stripe-hosted card Checkout.

Set these variables in the server environment.

| Variable | Development value or purpose |
| --- | --- |
| `FRONTEND_URL` | Trusted application origin such as `http://localhost:3000` |
| `PAYMENTS_ENABLED` | `true` after configuring both Sandbox secrets |
| `STRIPE_MODE` | `test` |
| `STRIPE_SECRET_KEY` | Stripe Sandbox secret or appropriately restricted test key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the relevant CLI listener or Dashboard endpoint |
| `STRIPE_USD_MIN_MINOR_UNITS` | Defaults to 50. Set the account-appropriate effective minimum for USD |
| `STRIPE_PKR_MIN_MINOR_UNITS` | Set the account-appropriate amount in PKR minor units to allow PKR |

Course pricing values are already stored in minor units. Rs. 3,999 is 399900. The initial currency allowlist is USD and optionally PKR. If the Stripe account rejects the course currency or minimum, use its Sandbox settings to verify capability. The backend never converts the currency or changes course prices.

Before running a migration, confirm that the server's Prisma URL points to the intended development database. Run `npm run prisma:migrate:deploy` against that database, then `npm run prisma:generate`. Migration SQL is under `prisma/migrations/20261127170000_add_course_commerce/`. `npx prisma validate` verifies the schema.

For the default local backend port, start the Stripe CLI listener.

```sh
stripe login
stripe listen --forward-to http://localhost:4000/webhooks/stripe
```

Use the signing secret printed by the listener locally. For a deployed Sandbox environment, register `https://<backend-origin>/webhooks/stripe` in Stripe using the actual public NestJS host. The Stripe Dashboard signing secret is distinct from the Stripe CLI listener secret. Configure a normal snapshot webhook destination for the platform account. The application verifies the original raw request bytes before recording a delivery.

Subscribe to these event families.

- `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`
- `payment_intent.succeeded` and `payment_intent.payment_failed`
- `refund.created`, `refund.updated`, `refund.failed`, and `charge.refunded`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, and `charge.dispute.funds_reinstated`

The endpoint responds after durable processing. Concurrent deliveries use a fenced database lease. Failed and stale deliveries can retry, and confirmed duplicates are acknowledged. On-demand, owner-checked reconciliation retrieves Stripe state and uses the same fulfillment path. A checkout with an ambiguous provider response uses its original idempotency key while eligible. Outside that window the app looks for the known Stripe reference or searches for the attempt metadata. If recovery is inconclusive, the attempt stays flagged and a second session is blocked until an operator can verify the Stripe history. There is no in-process background worker.

## GraphQL and pages

| Audience | Operations |
| --- | --- |
| Student queries | `courseEnrollmentStatus`, `checkoutQuote`, `checkoutStatus`, `myEnrollments`, `myEnrollment`, `myOrders`, `myOrder`, `myPayments`, `myPayment`, `myCourseLearningContent` |
| Student mutations | `enrollInFreeCourse`, `createCheckoutSession`, `reconcileCheckout` |
| Admin queries | `adminEnrollments`, `adminEnrollment`, `adminEnrollmentStats`, `adminOrders`, `adminOrder`, `adminOrderStats`, `adminPayments`, `adminPayment`, `adminPaymentStats`, `adminCommerceWebhooks` |

Checkout pages are `/checkout/[courseId]`, `/checkout/success`, and `/checkout/cancel`. The student dashboard links to `/student/my-learning` and `/student/purchase-history`, with details under the latter and lesson content at `/student/learning/[courseId]`. Admin routes are `/admin/enrollments`, `/admin/orders`, `/admin/transactions`, and `/admin/webhooks`.

TanStack Query keys for private data include the role and user ID. Confirmed enrollment and checkout state changes invalidate relevant commerce keys. Existing logout clears all query caches, and login across accounts removes commerce entries. Checkout status polling is bounded and reads the durable backend state.

## Testing

1. Sign in to the development site as a student and open a published free course. Choose **Enroll for free**, confirm the course appears in My Courses, and open its lessons. The admin Enrollments view should show a Free record and Orders should have no entry for it.
2. Open a published paid course supported by the configured Stripe account. Choose **Buy now**, review the price, and proceed to the application's generated Stripe Checkout Session. Use `4242 4242 4242 4242` with a future expiry and test CVC. The return page should show verification and eventually confirm access when the webhook or reconciliation completes.
3. Exercise a generic decline (`4000 0000 0000 0002`), insufficient funds (`4000 0000 0000 9995`), and 3D Secure (`4000 0025 0000 3155`). Return from an open checkout and resume it. Verify that a success URL by itself leaves an unpaid order pending.
4. In Stripe Sandbox, issue a partial refund and then the remaining refund on the test purchase. Confirm both are recorded and access changes only after the full successful refund. Review delivery status in Stripe and in the LMS webhook monitor.

Run `npm test -- src/modules/commerce/payment-policy.spec.ts` for pricing, signature, and GraphQL schema tests. To run the service integration tests, migrate a disposable loopback PostgreSQL database named `coursify_commerce_test`, supply its URL via `COMMERCE_TEST_DATABASE_URL`, then run `npm test -- src/modules/commerce/commerce.postgres.spec.ts`. These tests use simulated Stripe responses, signed fixtures, and actual persistence. A complete acceptance test uses the application-generated Checkout Session and real Sandbox webhook delivery.

Before production payment use, agree on unavailable-course charge resolution, refund and dispute access rules, published curriculum retention, and private delivery of protected media. This implementation processes Sandbox payments only. Financial reports separate environments and currencies, and net collection is shown before provider fees, payouts, and dispute balance movements.

Stripe references [Checkout creation](https://docs.stripe.com/api/checkout/sessions/create), [webhook signature verification](https://docs.stripe.com/webhooks/signature), [idempotent requests](https://docs.stripe.com/api/idempotent_requests), [supported currencies](https://docs.stripe.com/currencies), and [Sandbox cards](https://docs.stripe.com/testing).
