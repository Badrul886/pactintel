# PactIntel Webhooks Guide & Documentation

PactIntel webhooks allow your external applications and services to receive real-time, event-driven HTTP notifications whenever key milestones occur in your contract lifecycles, signature workflows, forms, or payments.

---

## 1. Security & Signature Verification

Every outbound webhook request contains an HMAC-SHA256 signature header:
`X-Webhook-Signature: sha256=<hex_digest>`

The signature is computed using the secret key provided when creating the webhook subscription and the raw HTTP request body bytes.

### Signature Verification Examples

#### TypeScript (Node.js)

```typescript
import * as crypto from 'crypto';

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  const [algo, signature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !signature) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}
```

#### Python

```python
import hmac
import hashlib

def verify_webhook_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    try:
        algo, signature = signature_header.split("=")
        if algo != "sha256":
            return False
        expected = hmac.new(secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)
    except Exception:
        return False
```

#### Go

```go
package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func VerifyWebhookSignature(payload []byte, header string, secret string) bool {
	parts := strings.Split(header, "=")
	if len(parts) != 2 || parts[0] != "sha256" {
		return false
	}
	expectedMAC := parts[1]

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	actualMAC := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(actualMAC), []byte(expectedMAC))
}
```

---

## 2. Event Catalog

| Event Name           | Description                              | Payload Key Entities                  |
| -------------------- | ---------------------------------------- | ------------------------------------- |
| `document.created`   | New document or contract initialized     | `documentId`, `title`, `type`         |
| `document.sent`      | Document dispatched to all signers       | `documentId`, `signers`               |
| `document.viewed`    | Signer opened the document viewer        | `documentId`, `signerEmail`           |
| `document.signed`    | Individual recipient completed signing   | `documentId`, `signerEmail`           |
| `document.completed` | All parties have signed; document sealed | `documentId`, `sealedPdfUrl`          |
| `document.declined`  | Recipient declined to sign               | `documentId`, `signerEmail`, `reason` |
| `document.expired`   | Signing window elapsed                   | `documentId`                          |
| `payment.completed`  | BYOK payment charge settled              | `paymentId`, `amount`, `currency`     |
| `form.submitted`     | Standalone form response submitted       | `formId`, `submissionId`              |
| `form.completed`     | Staged multi-role form completed         | `formId`, `submissionId`              |
| `workflow.completed` | Custom workflow execution finished       | `workflowId`, `instanceId`            |

---

## 3. Retry Policy & Delivery Guarantees

- **Delivery Guarantee**: At-least-once delivery. Consumers should make their handlers idempotent using the `id` field of the event payload.
- **Timeout**: Consumer endpoints must respond with HTTP `2xx` within 10 seconds.
- **Retry Schedule**: Failed deliveries (status `4xx`, `5xx`, or timeout) retry up to 3 times with exponential backoff:
  - Attempt 1: Immediate
  - Attempt 2: 1 second delay
  - Attempt 3: 4 seconds delay
  - Final Attempt: 16 seconds delay
- **Audit Logs**: All deliveries, response codes, and timestamps are visible via `GET /api/v1/webhooks/:id/delivery-logs`.

---

## 4. Interactive Testing

You can dispatch a test event to verify your endpoint's network connectivity and signature logic:
`POST /api/v1/webhooks/:id/test`
