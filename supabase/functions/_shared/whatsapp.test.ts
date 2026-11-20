import { describe, expect, it } from 'vitest'
import { constantTimeEqual, signMetaBody, verifyMetaSignature } from './crypto'
import { buildTemplateMessage, classifySendFailure, type ClaimedNotification } from './whatsappMessages'

const base: ClaimedNotification = {
  id: 'n1', notification_type: 'ticket_created', recipient_phone: '+212612345678', template_name: 'queue_ticket_created',
  template_language: 'ar', attempt: 1, ticket_id: 't1', ticket_number: 7, token_version: 1,
  shop_name: 'Salon Amine', grace_period_minutes: 10,
}

describe('WhatsApp template messages', () => {
  it('builds a template message with ordered parameters and the ticket language', () => {
    const msg = buildTemplateMessage(base, 'https://saff.ma/t#tok')
    expect(msg.to).toBe('212612345678')
    expect(msg.type).toBe('template')
    expect(msg.template.name).toBe('queue_ticket_created')
    expect(msg.template.language.code).toBe('ar')
    expect(msg.template.components[0].parameters.map((p) => p.text)).toEqual(['Salon Amine', '007', 'https://saff.ma/t#tok'])
  })

  it('turn approaching includes the grace period; queue closed has no link', () => {
    const turn = buildTemplateMessage({ ...base, notification_type: 'turn_approaching', template_name: 'queue_turn_approaching' }, 'L')
    expect(turn.template.components[0].parameters.map((p) => p.text)).toEqual(['Salon Amine', '007', '10', 'L'])
    const closed = buildTemplateMessage({ ...base, notification_type: 'queue_closed', template_name: 'queue_closed' }, 'L')
    expect(closed.template.components[0].parameters.map((p) => p.text)).toEqual(['Salon Amine', '007'])
  })

  it('refuses unknown templates (only approved templates are sent)', () => {
    expect(() => buildTemplateMessage({ ...base, template_name: 'marketing_promo' }, 'L')).toThrow()
  })
})

describe('send failure classification (approved Q-11)', () => {
  it('retries network errors, throttling and server errors', () => {
    expect(classifySendFailure(0, null).retryable).toBe(true)
    expect(classifySendFailure(429, null)).toMatchObject({ retryable: true, code: 'http_429' })
    expect(classifySendFailure(503, null)).toMatchObject({ retryable: true, code: 'http_503' })
    expect(classifySendFailure(400, { error: { code: 130429, message: 'Rate limit hit' } })).toMatchObject({ retryable: true, code: 'meta_130429' })
  })
  it('does not retry permanent errors', () => {
    expect(classifySendFailure(400, { error: { code: 131026, message: 'Message undeliverable' } })).toMatchObject({ retryable: false, code: 'meta_131026' })
    expect(classifySendFailure(400, { error: { code: 132001, message: 'Template does not exist' } }).retryable).toBe(false)
    expect(classifySendFailure(401, { error: { code: 190 } }).retryable).toBe(false)
  })
})

describe('Meta webhook signature', () => {
  const secret = 'app-secret-for-tests'
  const body = '{"object":"whatsapp_business_account"}'
  it('accepts a correct signature and rejects tampering', async () => {
    const header = await signMetaBody(secret, body)
    expect(await verifyMetaSignature(secret, body, header)).toBe(true)
    expect(await verifyMetaSignature(secret, body + ' ', header)).toBe(false)
    expect(await verifyMetaSignature('other-secret', body, header)).toBe(false)
    expect(await verifyMetaSignature(secret, body, null)).toBe(false)
    expect(await verifyMetaSignature(secret, body, 'sha256=xyz')).toBe(false)
  })
  it('compares secrets in constant time', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
  })
})
