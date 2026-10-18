'use client';

import React, { useState, useEffect } from 'react';
import { Check, Clock, ExternalLink, Users, FileText } from 'lucide-react';

interface SubscriptionData {
  tier: string;
  status: 'active' | 'in_grace_period' | 'past_due' | 'cancelled';
  priceFormatted: string;
  renewalDate: string;
  gracePeriodEnd: string | null;
  documentsUsed: number;
  documentsLimit: number;
  seatsUsed: number;
  seatsLimit: number;
}

const AVAILABLE_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$29',
    cadence: 'per month',
    description: 'Essential document automation for small teams and solo practitioners.',
    documentsLimit: 25,
    seatsLimit: 2,
    features: [
      '25 documents per month',
      '2 team seats',
      'Legally binding e-signatures',
      'Audit trail certificates',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$79',
    cadence: 'per month',
    description: 'High-volume contract execution and BYOK payment automation.',
    documentsLimit: 100,
    seatsLimit: 5,
    features: [
      '100 documents per month',
      '5 team seats',
      'BYOK payment links upon signing',
      'Custom branding & logos',
      'Priority email & chat support',
      'Cryptographic tamper verification',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$249',
    cadence: 'per month',
    description: 'Maximum scale, dedicated regional cells, and compliance tooling.',
    documentsLimit: 500,
    seatsLimit: 20,
    features: [
      '500 documents per month',
      '20 team seats',
      'Multi-region data residency',
      'Dedicated Cloud KMS envelope keys',
      'SAML SSO & SCIM directory sync',
      'Dedicated compliance manager',
    ],
  },
];

export default function BillingSettingsPage() {
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Initial state with defaults
  const [subscription, setSubscription] = useState<SubscriptionData>({
    tier: 'growth',
    status: 'active',
    priceFormatted: '$79.00 / month',
    renewalDate: 'November 18, 2026',
    gracePeriodEnd: null,
    documentsUsed: 28,
    documentsLimit: 100,
    seatsUsed: 3,
    seatsLimit: 5,
  });

  useEffect(() => {
    async function loadSubscription() {
      try {
        const res = await fetch('/api/billing/subscription');
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setSubscription((prev) => ({
              ...prev,
              tier: data.tier || prev.tier,
              status: data.status || prev.status,
              documentsUsed: data.documentsUsed ?? prev.documentsUsed,
              documentsLimit: data.documentsLimit ?? prev.documentsLimit,
              seatsUsed: data.seatsUsed ?? prev.seatsUsed,
              seatsLimit: data.seatsLimit ?? prev.seatsLimit,
              gracePeriodEnd: data.gracePeriodEnd || prev.gracePeriodEnd,
            }));
          }
        }
      } catch {
        // Fallback to active defaults
      }
    }
    loadSubscription();
  }, []);

  const docPercentage = Math.min(
    100,
    Math.round((subscription.documentsUsed / subscription.documentsLimit) * 100),
  );
  const seatPercentage = Math.min(
    100,
    Math.round((subscription.seatsUsed / subscription.seatsLimit) * 100),
  );

  const handleCheckout = async (planId: string) => {
    if (planId === subscription.tier) return;
    setSubscribingPlanId(planId);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      if (!res.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      alert(
        'Paddle checkout could not be opened. Please verify Paddle test environment credentials.',
      );
    } finally {
      setSubscribingPlanId(null);
    }
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal');
      if (!res.ok) {
        throw new Error('Failed to retrieve customer portal URL');
      }
      const data = await res.json();
      if (data.portalUrl) {
        window.open(data.portalUrl, '_blank');
      }
    } catch {
      alert('Unable to open customer billing portal.');
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Page Header */}
      <div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--color-gray-950)',
            marginBottom: '4px',
          }}
        >
          Billing & Subscription
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
          Manage your organization plan, document execution allowance, and payment credentials.
        </p>
      </div>

      {/* Grace Period Warning (RULE PAD-002) */}
      {subscription.status === 'in_grace_period' && subscription.gracePeriodEnd && (
        <div
          style={{
            backgroundColor: 'var(--status-warning-bg)',
            border: '1px solid var(--status-warning-dot)',
            borderRadius: '6px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <Clock
            size={20}
            color="var(--status-warning-text)"
            style={{ flexShrink: 0, marginTop: '2px' }}
          />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-warning-text)' }}>
              Subscription Scheduled for Downgrade
            </div>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--color-gray-800)',
                marginTop: '4px',
                lineHeight: '18px',
              }}
            >
              Your subscription was cancelled, but full Growth tier access remains active during the
              30-day grace period ending on <strong>{subscription.gracePeriodEnd}</strong>. After
              this date, excess seats and document quotas will be gracefully decommissioned.
            </p>
          </div>
        </div>
      )}

      {/* Current Plan Overview Card */}
      <div
        style={{
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '20px',
            marginBottom: '20px',
          }}
        >
          <div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}
            >
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'var(--color-gray-950)',
                  textTransform: 'capitalize',
                }}
              >
                {subscription.tier} Plan
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-badge)',
                  fontSize: '12px',
                  fontWeight: 500,
                  backgroundColor:
                    subscription.status === 'active'
                      ? 'var(--status-success-bg)'
                      : subscription.status === 'in_grace_period'
                        ? 'var(--status-warning-bg)'
                        : 'var(--status-error-bg)',
                  color:
                    subscription.status === 'active'
                      ? 'var(--status-success-text)'
                      : subscription.status === 'in_grace_period'
                        ? 'var(--status-warning-text)'
                        : 'var(--status-error-text)',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor:
                      subscription.status === 'active'
                        ? 'var(--status-success-dot)'
                        : subscription.status === 'in_grace_period'
                          ? 'var(--status-warning-dot)'
                          : 'var(--status-error-dot)',
                  }}
                />
                {subscription.status === 'active'
                  ? 'Active'
                  : subscription.status === 'in_grace_period'
                    ? 'Grace Period'
                    : 'Past Due'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
              Renews automatically on {subscription.renewalDate} via Paddle platform billing.
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
              {subscription.priceFormatted}
            </div>
            <button
              onClick={handleOpenPortal}
              disabled={portalLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '8px',
                padding: '6px 12px',
                backgroundColor: 'var(--color-white)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--color-gray-800)',
                cursor: portalLoading ? 'not-allowed' : 'pointer',
              }}
            >
              <span>{portalLoading ? 'Loading...' : 'Manage Invoices & Billing'}</span>
              <ExternalLink size={13} />
            </button>
          </div>
        </div>

        {/* Meters (RULE BILL-002: reset monthly) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Document Meter */}
          <div
            style={{
              padding: '16px',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={16} color="var(--color-gray-500)" />
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-gray-900)' }}>
                  Documents Used
                </span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                {subscription.documentsUsed} / {subscription.documentsLimit}
              </span>
            </div>
            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'var(--color-gray-100)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${docPercentage}%`,
                  height: '100%',
                  backgroundColor:
                    docPercentage > 90 ? 'var(--status-error-dot)' : 'var(--color-primary)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '8px' }}>
              Usage counter automatically rolls over on next billing cycle.
            </div>
          </div>

          {/* Seat Meter */}
          <div
            style={{
              padding: '16px',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="var(--color-gray-500)" />
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-gray-900)' }}>
                  Team Seats Occupied
                </span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                {subscription.seatsUsed} / {subscription.seatsLimit}
              </span>
            </div>
            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'var(--color-gray-100)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${seatPercentage}%`,
                  height: '100%',
                  backgroundColor: 'var(--color-primary)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '8px' }}>
              {subscription.seatsLimit - subscription.seatsUsed} seats available to invite
              collaborators.
            </div>
          </div>
        </div>
      </div>

      {/* Available Plans Grid */}
      <div>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--color-gray-950)',
            marginBottom: '16px',
          }}
        >
          Available Subscription Tiers
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {AVAILABLE_PLANS.map((plan) => {
            const isCurrent = plan.id === subscription.tier;
            return (
              <div
                key={plan.id}
                style={{
                  backgroundColor: 'var(--surface-card)',
                  border: isCurrent
                    ? '2px solid var(--color-primary)'
                    : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                {isCurrent && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-badge)',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: 'var(--color-primary-subtle)',
                      color: 'var(--color-primary)',
                    }}
                  >
                    CURRENT PLAN
                  </div>
                )}

                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-950)',
                    marginBottom: '4px',
                  }}
                >
                  {plan.name}
                </h3>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--color-gray-600)',
                    marginBottom: '16px',
                    minHeight: '36px',
                  }}
                >
                  {plan.description}
                </p>

                <div style={{ marginBottom: '20px' }}>
                  <span
                    style={{ fontSize: '26px', fontWeight: 600, color: 'var(--color-gray-950)' }}
                  >
                    {plan.price}
                  </span>
                  <span
                    style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginLeft: '4px' }}
                  >
                    / month
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCheckout(plan.id)}
                  disabled={isCurrent || subscribingPlanId === plan.id}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: isCurrent ? 'default' : 'pointer',
                    backgroundColor: isCurrent ? 'var(--color-gray-100)' : 'var(--color-primary)',
                    color: isCurrent ? 'var(--color-gray-600)' : 'var(--color-white)',
                    border: 'none',
                    marginBottom: '20px',
                  }}
                >
                  {isCurrent
                    ? 'Current Plan'
                    : subscribingPlanId === plan.id
                      ? 'Redirecting to Paddle...'
                      : 'Switch to ' + plan.name}
                </button>

                <div
                  style={{
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {plan.features.map((feature, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        color: 'var(--color-gray-800)',
                      }}
                    >
                      <Check size={14} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
