# SAFF — WhatsApp message templates (for Meta approval)

*Draft v0.1 · 20 Nov 2026 · Resolves RPC-SPEC Q-13 · **Copy must be reviewed by native speakers, and checked against the final consent text (B-6), before submission.***

SAFF sends **only** these pre-approved templates through the official WhatsApp Business Cloud API (never WhatsApp Web), and only to customers who gave explicit consent on the join form. There is one message per ticket event, and no marketing.

Submit each template in **three languages** (`fr`, `ar`, `en`), category **UTILITY**. Placeholders are numbered, and their order must match `supabase/functions/_shared/whatsappMessages.ts` (`templateParameters`), which is covered by unit tests. Meta rejects bodies that begin or end with a placeholder, so every body ends with plain text.

| Template name | Sent for (outbox type) | Parameters |
|---|---|---|
| `queue_ticket_created` | `ticket_created`, `link_resent` | {{1}} shop name · {{2}} ticket number (e.g. 014) · {{3}} private ticket link |
| `queue_turn_approaching` | `turn_approaching` (CALL NEXT) | {{1}} shop name · {{2}} ticket number · {{3}} grace period in minutes · {{4}} private ticket link |
| `queue_closed` | `queue_closed` (queue closed before the customer's turn) | {{1}} shop name · {{2}} ticket number |

Sample values for Meta's review: `Salon Amine`, `014`, `10`, `https://saff.ma/t#v1.AbCdEf…`

## queue_ticket_created

**fr**
> Bonjour, vous êtes dans la file de {{1}}. Votre numéro de ticket est le {{2}}. Suivez votre place ici : {{3}} — Ce lien est personnel, ne le partagez pas.

**ar**
> مرحبًا، أنت الآن في طابور {{1}}. رقم تذكرتك هو {{2}}. تابع مكانك من هنا: {{3}} — هذا الرابط خاص بك، لا تشاركه.

**en**
> Hello, you are in the queue at {{1}}. Your ticket number is {{2}}. Follow your place here: {{3}} — This link is personal, please don't share it.

## queue_turn_approaching

**fr**
> C’est bientôt votre tour chez {{1}} (ticket {{2}}). Merci de venir au salon dans les {{3}} minutes. Votre ticket : {{4}} — À tout de suite.

**ar**
> اقترب دورك في {{1}} (التذكرة {{2}}). يرجى الحضور إلى الصالون خلال {{3}} دقيقة. تذكرتك: {{4}} — نراك قريبًا.

**en**
> It’s almost your turn at {{1}} (ticket {{2}}). Please come to the shop within {{3}} minutes. Your ticket: {{4}} — See you soon.

## queue_closed

**fr**
> La file de {{1}} a fermé avant votre tour (ticket {{2}}). Nous sommes désolés pour ce désagrément. Vous pourrez la rejoindre une prochaine fois avec le QR code du salon.

**ar**
> أُغلق طابور {{1}} قبل دورك (التذكرة {{2}}). نعتذر عن هذا الإزعاج. يمكنك الانضمام مرة أخرى لاحقًا عبر رمز QR الخاص بالصالون.

**en**
> The queue at {{1}} closed before your turn (ticket {{2}}). We are sorry for the inconvenience. You can join again next time with the shop’s QR code.

## Notes

- **Re-sent links** use `queue_ticket_created` (a duplicate join re-sends the link; a barber can issue a new link). A dedicated `queue_link_resent` template can be added later without code changes beyond `templateParameters`.
- **The link travels in the body**, not in a URL button: button URLs take a dynamic *suffix*, and the ticket token lives in the URL fragment (`#`). Keep the body form unless Meta's review requires a button.
- **`queue_update`** exists in the outbox enum but is reserved; nothing sends it in the MVP (approved Q-14).
- Wording changes in any language need re-approval by Meta, and must stay consistent with the consent text version shown on the join form.
