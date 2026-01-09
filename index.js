import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys'

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  })

  sock.ev.on('creds.update', saveCreds)

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
