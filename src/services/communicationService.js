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


function premiumEmailTemplate({ eyebrow = 'RECANTO DA DINDA', title, greeting, body, accent = '#c99b54', preheader = '' }) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f2f5f1;font-family:Arial,Helvetica,sans-serif;color:#26372e;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f5f1;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;">
        <tr><td style="background:#173f32;padding:30px 36px 28px;border-bottom:4px solid ${accent};">
          <div style="font-size:11px;line-height:1.4;letter-spacing:3px;font-weight:700;color:#dce9df;">${eyebrow}</div>
          <div style="font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;margin-top:14px;">${title}</div>
          <div style="font-size:13px;line-height:1.6;color:#dce9df;margin-top:8px;">Cuidado, carinho e confiança em cada detalhe.</div>
        </td></tr>
        <tr><td style="padding:34px 36px 30px;">
          <p style="font-size:16px;line-height:1.7;margin:0 0 18px;">${greeting}</p>
          <div style="font-size:15px;line-height:1.8;color:#43534a;">${body}</div>
          <p style="font-size:15px;line-height:1.7;margin:28px 0 0;color:#43534a;">Com carinho,<br><strong style="color:#173f32;">Equipe Recanto da Dinda</strong></p>
        </td></tr>
        <tr><td style="background:#f7f8f5;border-top:1px solid #e8ede7;padding:20px 36px;">
          <p style="font-size:11px;line-height:1.7;color:#7b887f;margin:0;">Esta é uma mensagem automática relacionada ao cadastro do seu pet. Caso precise de ajuda, entre em contato com a equipe do Recanto da Dinda.</p>
          <p style="font-size:10px;letter-spacing:1.5px;font-weight:700;color:#8b9a8f;margin:12px 0 0;">RECANTO DA DINDA · CUIDADO COM AMOR</p>
        </td></tr>
      </table>
      <div style="font-size:10px;line-height:1.5;color:#9aa59d;padding:16px 10px;">Você recebeu este e-mail porque um cadastro foi realizado ou atualizado em nosso sistema.</div>
    </td></tr>
  </table>
</body></html>`
}

export async function sendRegistrationEmails({ pet, guardian }) {
  const tutorName = escapeHtml(guardian?.name || 'Tutor')
  const petName = escapeHtml(pet?.name || 'seu pet')
  console.info(`[BREVO] Iniciando e-mails de novo cadastro. pet=${pet?._id || 'n/a'}`)

  const tutorHtml = premiumEmailTemplate({
    title: 'Cadastro recebido com sucesso!',
    greeting: `Olá, <strong>${tutorName}</strong>!`,
    preheader: `Recebemos o cadastro de ${petName}.`,
    body: `<p style="margin:0 0 16px;">Recebemos os dados de <strong style="color:#173f32;">${petName}</strong>. O cadastro foi registrado e agora está aguardando a análise da nossa equipe.</p><div style="margin:22px 0;padding:18px 20px;background:#f4f7f2;border-left:3px solid #c99b54;border-radius:8px;"><div style="font-size:11px;letter-spacing:1px;color:#77857b;text-transform:uppercase;">Próxima etapa</div><div style="font-size:15px;font-weight:700;color:#173f32;margin-top:6px;">Análise da equipe</div><div style="font-size:13px;color:#657369;line-height:1.6;margin-top:5px;">Assim que houver uma atualização, enviaremos uma nova mensagem para você.</div></div><p style="margin:0;">Agradecemos por escolher o Recanto da Dinda para fazer parte da rotina do seu melhor amigo.</p>`,
  })
  const tutorResult = await deliverBrevoEmail({
    pet, guardian, recipient: guardian?.email, recipientName: guardian?.name,
    event: 'registration_received',
    subject: `Cadastro recebido: ${pet.name} | Recanto da Dinda`,
    htmlContent: tutorHtml,
    dedupeKey: `pet:${pet._id}:registration_received`,
  })

  const admins = await Admin.find({ role: { $in: ['admin', 'manager'] }, isActive: true }).select('name email').lean()
  const adminResults = await Promise.all(admins.map((admin) => {
    const adminHtml = premiumEmailTemplate({
      title: 'Novo cadastro aguardando análise',
      greeting: `Olá, <strong>${escapeHtml(admin.name || 'equipe')}</strong>.`,
      preheader: `${petName} acabou de ser cadastrado.`,
      body: `<p style="margin:0 0 18px;">Um novo pet foi cadastrado no Recanto da Dinda e aguarda revisão administrativa.</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f6f8f5;border:1px solid #e7ece6;border-radius:10px;"><tr><td style="padding:12px 16px;font-size:12px;color:#7b887f;">PET</td><td style="padding:12px 16px;font-size:14px;font-weight:700;color:#173f32;text-align:right;">${petName}</td></tr><tr><td style="padding:12px 16px;border-top:1px solid #e7ece6;font-size:12px;color:#7b887f;">TUTOR</td><td style="padding:12px 16px;border-top:1px solid #e7ece6;font-size:14px;color:#26372e;text-align:right;">${tutorName}</td></tr><tr><td style="padding:12px 16px;border-top:1px solid #e7ece6;font-size:12px;color:#7b887f;">E-MAIL</td><td style="padding:12px 16px;border-top:1px solid #e7ece6;font-size:13px;color:#26372e;text-align:right;">${escapeHtml(guardian?.email || 'Não informado')}</td></tr></table><p style="margin:18px 0 0;">Acesse o painel administrativo do Recanto da Dinda para conferir os dados e documentos enviados.</p>`,
    })
    return deliverBrevoEmail({
      pet, guardian, recipient: admin.email, recipientName: admin.name,
      event: 'new_registration_admin',
      subject: `Novo cadastro para análise: ${pet.name}`,
      htmlContent: adminHtml,
      dedupeKey: `pet:${pet._id}:new_registration_admin:${admin._id}`,
    })
  }))
  if (!admins.length) console.warn('[BREVO] Nenhum administrador/gerente ativo encontrado para o aviso de novo cadastro.')
  return { tutor: tutorResult, admins: adminResults }
}

export async function sendPetStatusEmail({ pet, guardian, status, notes = '' }) {
  const event = status === 'approved' ? 'pet_approved' : 'pet_rejected'
  const emailRecipient = guardian?.email || ''
  const recipient = emailRecipient || 'não informado'
  const dedupeKey = `pet:${pet._id}:${event}:${pet.reviewedAt?.getTime?.() || Date.now()}`

  console.info(`[BREVO] Iniciando comunicação de status. pet=${pet?._id || 'n/a'} status=${status} destinatario=${recipient}`)

  if (!emailRecipient) {
    const reason = 'Tutor sem e-mail cadastrado.'
    await saveLog({ pet: pet._id, guardian: guardian?._id || null, channel: 'email', event, recipient, status: 'skipped', provider: 'brevo', error: reason, dedupeKey })
    console.warn(`[BREVO] Envio ignorado (${event}): ${reason}`)
    return { status: 'skipped', reason }
  }

  const approved = status === 'approved'
  const tutorName = escapeHtml(guardian?.name || 'Tutor')
  const petName = escapeHtml(pet?.name || 'seu pet')
  const safeNotes = escapeHtml(notes)
  const htmlContent = premiumEmailTemplate({
    title: approved ? 'Temos uma ótima notícia!' : 'Atualização sobre o cadastro',
    greeting: `Olá, <strong>${tutorName}</strong>!`,
    accent: approved ? '#c99b54' : '#b66b57',
    preheader: approved ? `O cadastro de ${petName} foi aprovado.` : `Há uma atualização sobre o cadastro de ${petName}.`,
    body: approved
      ? `<div style="margin:0 0 20px;padding:20px;background:#f1f7f1;border:1px solid #dceadd;border-radius:12px;"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#66816c;">Cadastro aprovado</div><div style="font-size:21px;line-height:1.35;font-weight:700;color:#173f32;margin-top:7px;">${petName} agora faz parte da nossa família!</div></div><p style="margin:0 0 16px;">É com muita alegria que informamos que o cadastro de <strong>${petName}</strong> foi aprovado pela equipe do Recanto da Dinda.</p><p style="margin:0;">Estamos muito felizes em receber vocês. Nossa equipe poderá entrar em contato para orientar sobre os próximos passos.</p>`
      : `<p style="margin:0 0 16px;">Após analisar o cadastro de <strong>${petName}</strong>, nossa equipe não conseguiu aprová-lo neste momento.</p>${safeNotes ? `<div style="margin:20px 0;padding:18px 20px;background:#fbf5f2;border-left:3px solid #b66b57;border-radius:8px;"><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#956b60;font-weight:700;">Observação da equipe</div><div style="font-size:14px;line-height:1.7;color:#5a463f;margin-top:7px;white-space:pre-line;">${safeNotes}</div></div>` : ''}<p style="margin:0;">Se precisar de esclarecimentos ou desejar conversar sobre o cadastro, entre em contato com nossa equipe.</p>`,
  })

  return deliverBrevoEmail({
    pet, guardian, recipient: emailRecipient, recipientName: guardian?.name,
    event,
    subject: approved
      ? `Cadastro aprovado: ${pet.name} | Recanto da Dinda`
      : `Atualização do cadastro: ${pet.name} | Recanto da Dinda`,
    htmlContent,
    dedupeKey,
  })
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
