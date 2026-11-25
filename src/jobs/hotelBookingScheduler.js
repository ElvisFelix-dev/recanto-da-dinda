import cron from 'node-cron'
import HotelBooking from '../models/HotelBooking.js'

/**
 * Retorna o início do dia atual em São Paulo,
 * representado como uma data UTC.
 *
 * Considera requestedCheckOut como uma data de calendário,
 * conforme o formulário de hospedagem.
 */
function getStartOfTodayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  )

  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
  )
}

/**
 * Finaliza hospedagens cuja data de saída
 * já passou.
 */
export async function finishExpiredHotelBookings() {
  try {
    const today = getStartOfTodayInSaoPaulo()

    const result = await HotelBooking.updateMany(
      {
        status: 'approved',
        requestedCheckOut: { $lt: today },
      },
      {
        $set: {
          status: 'completed',
        },
      },
    )

    if (result.modifiedCount > 0) {
      console.log(
        `[HOTEL] ${result.modifiedCount} hospedagem(ns) finalizada(s) automaticamente.`,
      )
    }

    return result.modifiedCount
  } catch (error) {
    console.error(
      '[HOTEL SCHEDULER] Erro ao finalizar hospedagens:',
      error.message,
    )

    return 0
  }
}

/**
 * Executa uma verificação a cada 5 minutos.
 */
export function startHotelBookingScheduler() {
  // Executa também quando o servidor inicia.
  finishExpiredHotelBookings()

  cron.schedule(
    '*/5 * * * *',
    () => {
      finishExpiredHotelBookings()
    },
    {
      timezone: 'America/Sao_Paulo',
    },
  )

  console.log('[HOTEL SCHEDULER] Agendador iniciado.')
}
