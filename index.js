import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason
} from '@whiskeysockets/baileys'
import P from 'pino'
import fs from 'fs'
import qrcode from 'qrcode-terminal'
import { catalogo, textoCatalogo } from './catalogo.js'

/* =========================
   CONFIGURAÇÕES
========================= */

const ESTADOS_FILE = './estados.json'

const HORARIO_ATENDIMENTO = {
    0: { inicio: 10, fim: 14 }, // Domingo
    1: { inicio: 9,  fim: 18 }, // Segunda
    2: { inicio: 9,  fim: 18 }, // Terça
    3: { inicio: 9,  fim: 18 }, // Quarta
    4: { inicio: 9,  fim: 18 }, // Quinta
    5: { inicio: 9,  fim: 18 }, // Sexta
    6: { inicio: 9,  fim: 13 }  // Sábado
}

const ATENDENTES = {
    pedido: 'Abel',
    acompanhamento: 'Cristiane'
}

/* =========================
   FUNÇÕES
========================= */

function dentroHorario() {
    const agora = new Date()
    const dia = agora.getDay()
    const horaAtual = agora.getHours() + agora.getMinutes() / 60

    const horarioDia = HORARIO_ATENDIMENTO[dia]

    if (!horarioDia) return false

    return horaAtual >= horarioDia.inicio &&
           horaAtual < horarioDia.fim
}

function getEstados() {
    if (!fs.existsSync(ESTADOS_FILE)) {
        fs.writeFileSync(ESTADOS_FILE, JSON.stringify({}, null, 2))
    }
    return JSON.parse(fs.readFileSync(ESTADOS_FILE))
}

function saveEstados(estados) {
    fs.writeFileSync(ESTADOS_FILE, JSON.stringify(estados, null, 2))
}

/* =========================
   BOT
========================= */

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ['CrieArtes Bot', 'Chrome', '1.0']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, qr }) => {
        if (qr) qrcode.generate(qr, { small: true })
        if (connection === 'open') console.log('✅ Bot conectado')
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const texto =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''

        const estados = getEstados()

        if (!estados[from]) {
            estados[from] = { etapa: 'menu' }
        }

        const estado = estados[from]

        /* =========================
           FORA DO HORÁRIO
        ========================= */

        if (!dentroHorario()) {
            await sock.sendMessage(from, {
                text:
`⏰ *FORA DO HORÁRIO DE ATENDIMENTO*

Nosso horário:
🕘 Segunda a Sexta: 09h às 18h
🕘 Sábado: 09h às 13h

Deixe sua mensagem que responderemos assim que possível 💙

🏠 Digite *MENU* para ver opções`
            })
            return
        }

        /* =========================
           MENU
        ========================= */

        if (texto.toUpperCase() === 'MENU') {
            estado.etapa = 'menu'
            saveEstados(estados)

            return sock.sendMessage(from, {
                text:
`📋 *MENU PRINCIPAL*

1️⃣ Fazer um pedido
2️⃣ Acompanhamento de pedido
3️⃣ Consultar produtos/preços

🔢 Digite o número da opção`
            })
        }

        /* =========================
           MENU PRINCIPAL
        ========================= */

        if (estado.etapa === 'menu') {
            switch (texto) {
                case '1':
                    estado.etapa = 'pedido'
                    saveEstados(estados)
                    return sock.sendMessage(from, {
                        text:
`📝 *FAZER UM PEDIDO*

Em breve você será atendido pelo atendente *${ATENDENTES.pedido}*.

Para adiantar, informe:
• Nome completo
• Produto desejado e quantidade
• E/ou qualquer dúvida

Agradecemos sua preferência! 💙

🏠 Digite *MENU* para voltar`
                    })

                case '2':
                    estado.etapa = 'acompanhamento'
                    saveEstados(estados)
                    return sock.sendMessage(from, {
                        text:
`📦 *ACOMPANHAMENTO DE PEDIDO*

Em breve você será atendido pela atendente *${ATENDENTES.acompanhamento}*.

Para adiantar, informe:
• Nome completo
• E/ou qualquer dúvida

Agradecemos sua preferência! 💙

🏠 Digite *MENU* para voltar`
                    })

                case '3':
                    estado.etapa = 'catalogo'
                    saveEstados(estados)
                    return sock.sendMessage(from, {
                        text: textoCatalogo()
                    })

                default:
                    return sock.sendMessage(from, {
                        text: '❌ Opção inválida. Digite *MENU* para ver as opções.'
                    })
            }
        }

        /* =========================
           CATÁLOGO
        ========================= */

        if (estado.etapa === 'catalogo') {
            if (texto.toUpperCase() === 'MENU') {
                estado.etapa = 'menu'
                saveEstados(estados)
                return sock.sendMessage(from, {
                    text:
`📋 *MENU PRINCIPAL*

1️⃣ Fazer um pedido
2️⃣ Acompanhamento de pedido
3️⃣ Consultar produtos/preços`
                })
            }
        }
    })
}

startBot()
