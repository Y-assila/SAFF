/**
 * Version of the WhatsApp consent text shown on the join form; stored with every ticket
 * (tickets.consent_text_version). Bump it whenever the wording in any language changes.
 *
 * DRAFT — pending Moroccan legal review (Law 09-08 / CNDP, blocker B-6). Must not launch until approved.
 */
// draft-2026-11b: layered notice. The checkbox label is a short summary (join.consentShort) and the
// full text (join.consent) is one tap away. The lawyer must approve both layers together.
export const CONSENT_TEXT_VERSION = 'draft-2026-11b'
