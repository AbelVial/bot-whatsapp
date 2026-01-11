import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from '@whiskeysockets/baileys'

import P from 'pino'
import qrcode from 'qrcode-terminal'

async function startTest() {
  const { state, saveCreds } = await useMultiFileAuthState('auth-test')

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'debug' }),
    printQRInTerminal: true
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    console.log('🔌 CONNECTION:', update.connection)

    if (update.qr) {
      qrcode.generate(update.qr, { small: true })
    }

    if (
      update.connection === 'close' &&
      update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
    ) {
      startTest()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    console.log('📩 MENSAGEM RECEBIDA:')
    console.log(JSON.stringify(msg, null, 2))

    const from = msg.key.remoteJid

    const rowId =
      msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId

    if (!rowId) {
      await sock.sendMessage(from, {
        listMessage: {
          title: '🧪 TESTE MENU',
          description: 'Clique em uma opção',
          buttonText: 'Abrir menu',
          sections: [
            {
              title: 'Opções',
              rows: [
                { title: 'Opção 1', rowId: 'op1' },
                { title: 'Opção 2', rowId: 'op2' }
              ]
            }
          ]
        }
      })
      return
    }

    await sock.sendMessage(from, {
      text: `✅ Você clicou em: ${rowId}`
    })
  })
}

startTest()
