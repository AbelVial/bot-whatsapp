import http from 'http'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from '@whiskeysockets/baileys'

// 🌐 PORTA OBRIGATÓRIA PARA O RENDER
const PORT = process.env.PORT || 3000

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Bot WhatsApp rodando ✅')
}).listen(PORT, () => {
  console.log(`Servidor HTTP ativo na porta ${PORT}`)
})

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')

  const sock = makeWASocket({
    auth: state
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      console.log('==============================')
      console.log('QR CODE PARA CONECTAR 👇')
      console.log(qr)
      console.log('==============================')
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp conectado com sucesso!')
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) {
        console.log('Reconectando...')
        startBot()
      } else {
        console.log('Sessão encerrada.')
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    const msgText = text.toLowerCase()

    if (msgText === 'oi' || msgText === 'menu') {
      await sock.sendMessage(msg.key.remoteJid, {
        text:
`Olá 👋
Escolha uma opção:
1️⃣ Orçamento
2️⃣ Acompanhar pedido
3️⃣ Falar com atendente`
      })
    }

    if (msgText === '1') {
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'Envie os detalhes do orçamento.'
      })
    }

    if (msgText === '2') {
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'Informe o número do pedido.'
      })
    }

    if (msgText === '3') {
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'Um atendente humano continuará o atendimento.'
      })
    }
  })
}

startBot()
