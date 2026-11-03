import CommunicationLog from '../models/CommunicationLog.js'

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

async function saveLog(data) {
  try {
    return await CommunicationLog.create(data)
  } catch (error) {
    if (error.code === 11000) return null
    console.error('[COMMUNICATION LOG]', error.message)
    return null
  }
}

export async function sendPetStatusEmail({ pet, guardian, status, notes = '' }) {
  const event = status === 'approved' ? 'pet_approved' : 'pet_rejected'
  const emailRecipient = guardian?.email || ''
  const recipient = emailRecipient || 'não informado'
  const dedupeKey = `pet:${pet._id}:${event}:${pet.reviewedAt?.getTime?.() || Date.now()}`

  if (!emailRecipient) {
    await saveLog({ pet: pet._id, guardian: guardian?._id, channel: 'email', event, recipient, status: 'skipped', provider: 'brevo', error: 'Tutor sem e-mail cadastrado.', dedupeKey })
    return { status: 'skipped', reason: 'Tutor sem e-mail cadastrado.' }
  }

  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
    await saveLog({ pet: pet._id, guardian: guardian?._id, channel: 'email', event, recipient, status: 'skipped', provider: 'brevo', error: 'Brevo não configurado no ambiente.', dedupeKey })
    return { status: 'skipped', reason: 'Brevo não configurado.' }
  }

  const approved = status === 'approved'
  const tutorName = escapeHtml(guardian.name || 'Tutor')
  const petName = escapeHtml(pet.name || 'seu pet')
  const safeNotes = escapeHtml(notes)
  const subject = approved
    ? `Boas notícias! O cadastro de ${pet.name} foi aprovado 🐾`
    : `Atualização sobre o cadastro de ${pet.name} — Recanto da Dinda`
  const content = approved
    ? `<p>Temos uma ótima notícia: o cadastro de <strong>${petName}</strong> foi aprovado pela equipe do Recanto da Dinda!</p><p>Estamos muito felizes em recebê-lo em nossa família. Em breve, nossa equipe poderá entrar em contato para orientar sobre os próximos passos.</p>`
    : `<p>Após analisar o cadastro de <strong>${petName}</strong>, nossa equipe não conseguiu aprová-lo neste momento.</p>${safeNotes ? `<p><strong>Motivo informado:</strong> ${safeNotes}</p>` : ''}<p>Se precisar de esclarecimentos, entre em contato com nossa equipe.</p>`
  const htmlContent = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f7f3;padding:32px 12px;font-family:Arial,sans-serif;color:#26372e"><div style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#173f32;padding:28px 32px;color:#fff"><div style="font-size:13px;letter-spacing:2px;color:#dcebe0">RECANTO DA DINDA</div><h1 style="font-size:24px;margin:12px 0 0">${approved ? 'Que alegria! 🐾' : 'Atualização do cadastro'}</h1></div><div style="padding:32px"><p>Olá, ${tutorName}!</p>${content}<p style="margin-top:28px">Com carinho,<br><strong>Equipe Recanto da Dinda</strong></p></div><div style="padding:18px 32px;background:#f5f7f3;color:#718078;font-size:12px">Esta é uma mensagem automática sobre o cadastro do seu pet.</div></div></body></html>`

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || 'Recanto da Dinda', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: recipient, name: guardian.name || 'Tutor' }],
        subject,
        htmlContent,
        tags: ['recanto-dinda', event],
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.message || `Brevo respondeu com HTTP ${response.status}.`)

    await saveLog({ pet: pet._id, guardian: guardian?._id, channel: 'email', event, recipient, status: 'sent', provider: 'brevo', providerMessageId: result.messageId || '', dedupeKey })
    return { status: 'sent', providerMessageId: result.messageId || '' }
  } catch (error) {
    await saveLog({ pet: pet._id, guardian: guardian?._id, channel: 'email', event, recipient, status: 'failed', provider: 'brevo', error: error.message, dedupeKey })
    console.error('[BREVO] Falha ao enviar e-mail:', error.message)
    return { status: 'failed', reason: error.message }
  }
}

function normalizeBrazilPhone(phone = '') {
  let digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('55')) digits = `55${digits}`
  return digits
}

export async function sendPetApprovalWhatsApp({ pet, guardian, adminId }) {
  const event = 'manual_whatsapp'
  const phoneRecipient = normalizeBrazilPhone(guardian?.phone)
  const recipient = phoneRecipient || 'não informado'
  const dedupeKey = `pet:${pet._id}:whatsapp-approval:${Date.now()}`

  if (guardian?.whatsappConsent?.status !== 'granted') {
    await saveLog({ pet: pet._id, guardian: guardian?._id, channel: 'whatsapp', event, recipient, status: 'skipped', provider: 'meta_whatsapp', error: 'O tutor ainda não autorizou o recebimento de mensagens pelo WhatsApp.', sentBy: adminId, dedupeKey })
    throw new Error('O tutor ainda não autorizou o recebimento de mensagens pelo WhatsApp.')
  }
  if (!phoneRecipient || phoneRecipient.length < 12 || phoneRecipient.length > 13) {
    await saveLog({ pet: pet._id, guardian: guardian?._id, channel: 'whatsapp', event, recipient, status: 'failed', provider: 'meta_whatsapp', error: 'O telefone do tutor não possui um número válido para WhatsApp.', sentBy: adminId, dedupeKey })
    throw new Error('O telefone do tutor não possui um número válido para WhatsApp.')
  }
  const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APPROVAL_TEMPLATE } = process.env
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_APPROVAL_TEMPLATE) {
    const message = 'Configure WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_APPROVAL_TEMPLATE no backend.'
    await saveLog({ pet: pet._id, guardian: guardian?._id, channel: 'whatsapp', event, recipient, status: 'skipped', provider: 'meta_whatsapp', error: message, sentBy: adminId, dedupeKey })
    throw new Error(message)
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: WHATSAPP_APPROVAL_TEMPLATE,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: guardian.name || 'Tutor' },
          { type: 'text', text: pet.name || 'seu pet' },
        ],
      }],
    },
  }

  try {
    const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v22.0'
    const response = await fetch(`https://graph.facebook.com/${version}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error?.message || `WhatsApp respondeu com HTTP ${response.status}.`)

    await saveLog({ pet: pet._id, guardian: guardian._id, channel: 'whatsapp', event, recipient, status: 'sent', provider: 'meta_whatsapp', providerMessageId: result.messages?.[0]?.id || '', sentBy: adminId, dedupeKey })
    return { status: 'sent', messageId: result.messages?.[0]?.id || '' }
  } catch (error) {
    await saveLog({ pet: pet._id, guardian: guardian?._id, channel: 'whatsapp', event, recipient, status: 'failed', provider: 'meta_whatsapp', error: error.message, sentBy: adminId, dedupeKey })
    throw error
  }
}

export async function listPetCommunications(petId) {
  return CommunicationLog.find({ pet: petId }).sort({ createdAt: -1 }).limit(50).populate('sentBy', 'name email')
}
