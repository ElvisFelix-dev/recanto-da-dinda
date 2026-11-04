import CommunicationLog from '../models/CommunicationLog.js'
import Admin from '../models/Admin.js'

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


async function deliverBrevoEmail({ pet, guardian = null, recipient, recipientName, event, subject, htmlContent, dedupeKey }) {
  if (!recipient) {
    await saveLog({ pet: pet._id, guardian: guardian?._id || null, channel: 'email', event, recipient: 'não informado', status: 'skipped', provider: 'brevo', error: 'Destinatário sem e-mail cadastrado.', dedupeKey })
    return { status: 'skipped', reason: 'Destinatário sem e-mail cadastrado.' }
  }
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
    const reason = 'Brevo não configurado: verifique BREVO_API_KEY e BREVO_SENDER_EMAIL no Render.'
    await saveLog({ pet: pet._id, guardian: guardian?._id || null, channel: 'email', event, recipient, status: 'skipped', provider: 'brevo', error: reason, dedupeKey })
    console.error('[BREVO]', reason)
    return { status: 'skipped', reason }
  }
  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || 'Recanto da Dinda', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: recipient, name: recipientName || recipient }],
        subject,
        htmlContent,
        tags: ['recanto-dinda', event],
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.message || result.code || `Brevo respondeu com HTTP ${response.status}.`)
    await saveLog({ pet: pet._id, guardian: guardian?._id || null, channel: 'email', event, recipient, status: 'sent', provider: 'brevo', providerMessageId: result.messageId || '', dedupeKey })
    console.info(`[BREVO] E-mail aceito para ${recipient} (${event}). messageId=${result.messageId || 'n/a'}`)
    return { status: 'sent', providerMessageId: result.messageId || '' }
  } catch (error) {
    await saveLog({ pet: pet._id, guardian: guardian?._id || null, channel: 'email', event, recipient, status: 'failed', provider: 'brevo', error: error.message, dedupeKey })
    console.error(`[BREVO] Falha no envio para ${recipient} (${event}):`, error.message)
    return { status: 'failed', reason: error.message }
  }
}

export async function sendRegistrationEmails({ pet, guardian }) {
  const tutorName = escapeHtml(guardian?.name || 'Tutor')
  const petName = escapeHtml(pet?.name || 'seu pet')
  const base = `<div style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;font-family:Arial,sans-serif;color:#26372e"><div style="background:#173f32;padding:28px 32px;color:#fff"><div style="font-size:13px;letter-spacing:2px;color:#dcebe0">RECANTO DA DINDA</div><h1 style="font-size:24px;margin:12px 0 0">Cadastro recebido! 🐾</h1></div><div style="padding:32px"><p>Olá, ${tutorName}!</p><p>Recebemos o cadastro de <strong>${petName}</strong> e ele já está aguardando a análise da nossa equipe.</p><p>Assim que houver uma atualização, entraremos em contato por e-mail.</p><p style="margin-top:28px">Com carinho,<br><strong>Equipe Recanto da Dinda</strong></p></div></div>`
  const tutorResult = await deliverBrevoEmail({
    pet, guardian, recipient: guardian?.email, recipientName: guardian?.name,
    event: 'registration_received', subject: `Recebemos o cadastro de ${pet.name}! 🐾`, htmlContent: base,
    dedupeKey: `pet:${pet._id}:registration_received`,
  })

  const admins = await Admin.find({ role: { $in: ['admin', 'manager'] }, isActive: true }).select('name email').lean()
  const adminResults = await Promise.all(admins.map((admin) => deliverBrevoEmail({
    pet, guardian, recipient: admin.email, recipientName: admin.name,
    event: 'new_registration_admin', subject: `Novo cadastro aguardando análise: ${pet.name}`,
    htmlContent: `<div style="font-family:Arial,sans-serif;color:#26372e"><h2>Novo cadastro recebido</h2><p>Um novo pet foi cadastrado e aguarda análise no painel do Recanto da Dinda.</p><p><strong>Pet:</strong> ${petName}<br><strong>Tutor:</strong> ${tutorName}<br><strong>E-mail do tutor:</strong> ${escapeHtml(guardian?.email || 'Não informado')}</p><p>Acesse o painel administrativo para revisar o cadastro.</p></div>`,
    dedupeKey: `pet:${pet._id}:new_registration_admin:${admin._id}`,
  })))
  if (!admins.length) console.warn('[BREVO] Nenhum admin/gerente ativo encontrado para aviso de novo cadastro.')
  return { tutor: tutorResult, admins: adminResults }
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
