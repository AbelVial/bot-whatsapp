import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import P from 'pino'
import qrcode from 'qrcode-terminal'

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')

  const sock = makeWASocket({
    logger: P({ level: 'debug' }),
    auth: state,
    printQRInTerminal: true
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true })

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid

    const opcao =
      msg.message.listResponseMessage?.singleSelectReply?.selectedRowId

    // MENU PRINCIPAL
    if (!opcao) {
      return sock.sendMessage(from, {
        listMessage: {
          title: '🎨 TESTE DE MENU',
          description: 'Escolha uma opção abaixo',
          buttonText: 'Abrir menu',
          sections: [
            {
              title: 'Opções',
              rows: [
                { title: '📝 Fazer orçamento', rowId: 'orcamento' },
                { title: '📦 Acompanhar pedido', rowId: 'pedido' },
                { title: '👤 Falar com atendente', rowId: 'atendente' }
              ]
            }
          ]
        }
      })
    }

    // RESPOSTAS
    if (opcao === 'orcamento') {
      await sock.sendMessage(from, {
        text: '📝 Você escolheu *Fazer orçamento*'
      })
    }

    if (opcao === 'pedido') {
      await sock.sendMessage(from, {
        text: '📦 Você escolheu *Acompanhar pedido*'
      })
    }

    if (opcao === 'atendente') {
      await sock.sendMessage(from, {
        text: '👤 Você escolheu *Falar com atendente*'
      })
    }

    // VOLTA PRO MENU
    await sock.sendMessage(from, {
      text: '⬇️ Escolha outra opção:'
    })

    return sock.sendMessage(from, {
      listMessage: {
        title: '🎨 TESTE DE MENU',
        description: 'Menu principal',
        buttonText: 'Abrir menu',
        sections: [
          {
            title: 'Opções',
            rows: [
              { title: '📝 Fazer orçamento', rowId: 'orcamento' },
              { title: '📦 Acompanhar pedido', rowId: 'pedido' },
              { title: '👤 Falar com atendente', rowId: 'atendente' }
            ]
          }
        ]
      }
    })
  })
}

startBot()
