import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys'
import P from 'pino'
import qrcode from 'qrcode-terminal'

const ATENDENTES = {
    pedido: 'Abel',
    acompanhamento: 'Cristiane'
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ['CrieArtes Bot', 'Chrome', '1.0']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ qr, connection }) => {
        if (qr) {
            console.log('\n📱 Escaneie o QR Code:\n')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'open') {
            console.log('✅ Bot conectado com sucesso!')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const texto =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''

        const textoLimpo = texto.trim().toUpperCase()

        // MENU PRINCIPAL
        if (
            textoLimpo === 'OI' ||
            textoLimpo === 'OLÁ' ||
            textoLimpo === 'OLA' ||
            textoLimpo === 'MENU'
        ) {
            return sock.sendMessage(from, {
                text:
`👋 Olá! Seja bem-vindo(a) à *CrieArtes Personalizados* 🎨

Como podemos te ajudar?

1️⃣ *Fazer um pedido*
2️⃣ *Acompanhamento de pedido*

🔢 Digite o número da opção desejada`
            })
        }

        // OPÇÃO 1 - FAZER PEDIDO
        if (textoLimpo === '1') {
            return sock.sendMessage(from, {
                text:
`📝 *FAZER UM PEDIDO*

Em breve você será atendido pelo atendente *${ATENDENTES.pedido}*.

Para adiantar, informe:
• Nome completo
• Produto desejado e quantidade
• E/ou qualquer dúvida que tenha

Agradecemos sua preferência! 💙

🏠 Digite *MENU* para voltar às opções principais.`
            })
        }

        // OPÇÃO 2 - ACOMPANHAMENTO
        if (textoLimpo === '2') {
            return sock.sendMessage(from, {
                text:
`📦 *ACOMPANHAMENTO DE PEDIDO*

Em breve você será atendido pela atendente *${ATENDENTES.acompanhamento}*.

Para adiantar, informe:
• Nome completo
• E/ou qualquer dúvida que tenha

Agradecemos sua preferência! 💙

🏠 Digite *MENU* para voltar às opções principais.`
            })
        }

        // QUALQUER OUTRA MENSAGEM
        return sock.sendMessage(from, {
            text:
`🤔 Não entendi sua mensagem.

Digite:
• *MENU* para ver as opções
• *OI* para iniciar o atendimento`
        })
    })
}

startBot()
