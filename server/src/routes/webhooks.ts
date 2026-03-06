import { Router } from 'express';
import express from 'express';
import { Resend } from 'resend';
import { verifyStripeWebhook, StripeWebhookRequest } from '../middleware/stripe-webhook';
import { supabase } from '../lib/supabase';

const router = Router();

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY non configurée');
  return new Resend(process.env.RESEND_API_KEY);
}
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'reservations@laplage-tournesol.com';

/**
 * POST /api/webhooks/stripe
 * Reçoit les événements Stripe (raw body requis)
 */
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  verifyStripeWebhook,
  async (req: StripeWebhookRequest, res) => {
    const event = req.stripeEvent!;

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          const { type, reservationId, table, userId } = paymentIntent.metadata;

          if (!table || !reservationId) {
            console.warn('Webhook: metadata incomplète', paymentIntent.metadata);
            break;
          }

          // Marquer la réservation comme payée
          const { error } = await supabase
            .from(table)
            .update({
              deposit_paid: true,
              stripe_payment_intent_id: paymentIntent.id,
            })
            .eq('id', reservationId);

          if (error) {
            console.error('Erreur mise à jour réservation:', error);
            break;
          }

          console.log(`Paiement confirmé: ${type} #${reservationId}`);

          // Récupérer l'email du user pour confirmation
          if (userId) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('email, first_name')
              .eq('id', userId)
              .single();

            if (profile?.email) {
              // Envoyer email de confirmation
              await getResend().emails.send({
                from: fromEmail,
                to: profile.email,
                subject: 'Confirmation de réservation - La Plage Tournesol',
                html: `
                  <h2>Réservation confirmée !</h2>
                  <p>Bonjour ${profile.first_name ?? ''},</p>
                  <p>Votre acompte pour votre réservation <strong>${type}</strong> a bien été reçu.</p>
                  <p>Numéro de réservation : <strong>${reservationId}</strong></p>
                  <p>Merci et à bientôt à La Plage Tournesol !</p>
                `,
              });
            }

            // Envoyer push de confirmation
            const { data: tokens } = await supabase
              .from('push_tokens')
              .select('token')
              .eq('user_id', userId);

            if (tokens && tokens.length > 0) {
              const messages = tokens.map((t) => ({
                to: t.token,
                title: 'Réservation confirmée',
                body: `Votre acompte pour votre réservation ${type} a été reçu.`,
                sound: 'default' as const,
              }));

              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messages),
              });
            }
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          console.error('Paiement échoué:', {
            id: paymentIntent.id,
            metadata: paymentIntent.metadata,
            lastError: paymentIntent.last_payment_error?.message,
          });
          break;
        }

        default:
          console.log(`Événement Stripe non géré: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Erreur traitement webhook:', err);
      res.status(500).json({ error: 'Erreur interne' });
    }
  },
);

export default router;
