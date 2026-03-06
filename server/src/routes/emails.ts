import { Router } from 'express';
import { Resend } from 'resend';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';

const router = Router();

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY non configurée');
  return new Resend(process.env.RESEND_API_KEY);
}
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'reservations@laplage-tournesol.com';

/**
 * POST /api/emails/confirmation
 * Envoie un email de confirmation de réservation
 */
router.post('/confirmation', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { to, type, reservationData } = req.body;

    if (!to || !type) {
      res.status(400).json({ error: 'to et type sont requis' });
      return;
    }

    const typeLabels: Record<string, string> = {
      beach: 'Transat',
      restaurant: 'Restaurant',
      event: 'Événement',
    };

    const { error } = await getResend().emails.send({
      from: fromEmail,
      to,
      subject: `Confirmation ${typeLabels[type] ?? type} - La Plage Tournesol`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a5276;">Réservation confirmée</h2>
          <p>Votre réservation <strong>${typeLabels[type] ?? type}</strong> est confirmée.</p>
          ${reservationData?.date ? `<p>Date : <strong>${reservationData.date}</strong></p>` : ''}
          ${reservationData?.guests ? `<p>Personnes : <strong>${reservationData.guests}</strong></p>` : ''}
          ${reservationData?.id ? `<p>Référence : <strong>${reservationData.id}</strong></p>` : ''}
          <p>Merci et à bientôt !</p>
          <p style="color: #888; font-size: 12px;">La Plage Tournesol</p>
        </div>
      `,
    });

    if (error) {
      console.error('Erreur envoi email:', error);
      res.status(500).json({ error: 'Erreur envoi email' });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Erreur email confirmation:', err);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

/**
 * POST /api/emails/broadcast
 * Envoie un email de masse (admin uniquement)
 */
router.post('/broadcast', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { subject, html, segment } = req.body;

    if (!subject || !html) {
      res.status(400).json({ error: 'subject et html sont requis' });
      return;
    }

    // Récupérer les emails selon le segment
    let query = supabase.from('profiles').select('email');

    if (segment === 'vip') {
      query = query.in('vip_level', ['silver', 'gold', 'platinum']);
    } else if (segment === 'gold+') {
      query = query.in('vip_level', ['gold', 'platinum']);
    } else if (segment === 'event_attendees') {
      const { data: tickets } = await supabase
        .from('event_tickets')
        .select('user_id')
        .in('status', ['active', 'used']);

      if (tickets && tickets.length > 0) {
        const userIds = [...new Set(tickets.map((t) => t.user_id))];
        query = query.in('id', userIds);
      } else {
        res.json({ success: true, sent: 0 });
        return;
      }
    }

    const { data: profiles } = await query;
    const emails = profiles
      ?.map((p) => p.email)
      .filter((e): e is string => !!e) ?? [];

    if (emails.length === 0) {
      res.json({ success: true, sent: 0 });
      return;
    }

    // Envoyer en batch (Resend supporte jusqu'à 100 destinataires par appel)
    const BATCH_SIZE = 50;
    let totalSent = 0;

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const { error } = await getResend().emails.send({
        from: fromEmail,
        to: batch,
        subject,
        html,
      });

      if (error) {
        console.error(`Erreur batch email [${i}-${i + batch.length}]:`, error);
      } else {
        totalSent += batch.length;
      }
    }

    res.json({ success: true, sent: totalSent });
  } catch (err: any) {
    console.error('Erreur email broadcast:', err);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

export default router;
