import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY non configurée');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
}

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

export interface StripeWebhookRequest extends Request {
  stripeEvent?: Stripe.Event;
}

export function verifyStripeWebhook(
  req: StripeWebhookRequest,
  res: Response,
  next: NextFunction,
): void {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    res.status(400).json({ error: 'Signature Stripe manquante' });
    return;
  }

  try {
    req.stripeEvent = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
    next();
  } catch (err: any) {
    console.error('Erreur vérification webhook Stripe:', err.message);
    res.status(400).json({ error: 'Signature invalide' });
  }
}
