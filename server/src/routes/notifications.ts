import { Router } from 'express';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../lib/supabase';

const router = Router();

/**
 * POST /api/notifications/push
 * Envoie des notifications push via Expo Push API (admin uniquement)
 */
router.post('/push', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, body, segment, data } = req.body;

    if (!title || !body) {
      res.status(400).json({ error: 'title et body sont requis' });
      return;
    }

    // Récupérer les tokens selon le segment
    let tokens: string[] = [];

    if (segment === 'vip') {
      const { data: result } = await supabase
        .from('push_tokens')
        .select('token, profile:profiles!inner(vip_level)')
        .in('profiles.vip_level', ['silver', 'gold', 'platinum']);
      tokens = result?.map((r: any) => r.token) ?? [];
    } else if (segment === 'gold+') {
      const { data: result } = await supabase
        .from('push_tokens')
        .select('token, profile:profiles!inner(vip_level)')
        .in('profiles.vip_level', ['gold', 'platinum']);
      tokens = result?.map((r: any) => r.token) ?? [];
    } else if (segment === 'event_attendees') {
      const { data: tickets } = await supabase
        .from('event_tickets')
        .select('user_id')
        .in('status', ['active', 'used']);

      if (tickets && tickets.length > 0) {
        const userIds = [...new Set(tickets.map((t) => t.user_id))];
        const { data: result } = await supabase
          .from('push_tokens')
          .select('token')
          .in('user_id', userIds);
        tokens = result?.map((r) => r.token) ?? [];
      }
    } else {
      // all
      const { data: result } = await supabase
        .from('push_tokens')
        .select('token');
      tokens = result?.map((r) => r.token) ?? [];
    }

    if (tokens.length === 0) {
      res.json({ success: true, sent: 0 });
      return;
    }

    // Envoyer via Expo Push API (max 100 par requête)
    const BATCH_SIZE = 100;
    let totalSent = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const messages = batch.map((token) => ({
        to: token,
        title,
        body,
        sound: 'default' as const,
        ...(data ? { data } : {}),
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });

      if (response.ok) {
        totalSent += batch.length;
      } else {
        console.error(`Erreur Expo Push batch [${i}-${i + batch.length}]:`, await response.text());
      }
    }

    // Sauvegarder dans l'historique
    await supabase.from('push_notifications').insert({
      title,
      body,
      target_segment: segment ?? 'all',
      data: data ?? null,
      sent_count: totalSent,
      sent_at: new Date().toISOString(),
    });

    res.json({ success: true, sent: totalSent });
  } catch (err: any) {
    console.error('Erreur push notification:', err);
    res.status(500).json({ error: 'Erreur interne' });
  }
});

export default router;
