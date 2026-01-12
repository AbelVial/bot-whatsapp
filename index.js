import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import P from 'pino'
import fs from 'fs'
import qrcode from 'qrcode-terminal'

/* =========================
   CONFIGURAÇÕES
========================= */

const NUMERO_TESTE = '5527997600138@s.whatsapp.net'

const ESTADOS_FILE = './estados.json'
const MENSAGENS_FORA_HORARIO = './mensagens_fora_horario.json'

const ESTADOS_HUMANOS = ['aguardando_atendente']

const HORARIO_ATENDIMENTO = {
    0: null,
    1: { inicio: '08:00', fim: '18:00' },
    2: { inicio: '09:00', fim: '18:00' },
    3: { inicio: '09:00', fim: '18:00' },
    4: { inicio: '09:00', fim: '18:00' },
    5: { inicio: '09:00', fim: '18:00' },
    6: { inicio: '09:00', fim: '13:00' }
}

const ATENDENTES = {
    geral: process.env.ATENDENTE_GERAL
}

/* =========================
   UTILITÁRIOS
========================= */

function dentroHorario() {
    const agora = new Date()
    const dia = agora.getDay()
    const cfg = HORARIO_ATENDIMENTO[dia]
    if (!cfg) return false

    const [hi, mi] = cfg.inicio.split(':').map(Number)
    const [hf, mf] = cfg.fim.split(':').map(Number)

    const atual = agora.getHours() * 60 + agora.getMinutes()
    const ini = hi * 60 + mi
    const fim = hf * 60 + mf

    return atual >= ini && atual <= fim
}

function getJSONFile(file, def = {}) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(def, null, 2))
        return def
    }
    return JSON.parse(fs.readFileSync(file))
}

function saveJSONFile(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

async function marcarComoLida(sock, msg) {
    await sock.readMessages([msg.key])
}

function getSaudacao() {
    const h = new Date().getHours()
    if (h < 12) return '☀️ Bom dia!'
    if (h < 18) return '🌤️ Boa tarde!'
    return '🌙 Boa noite!'
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
        browser: ['CrieArtes Bot', 'Chrome', '3.0']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
        if (qr) qrcode.generate(qr, { small: true })

        if (connection === 'close') {
            const logout = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut
            if (!logout) setTimeout(startBot, 5000)
        }

        if (connection === 'open') {
            console.log('✅ Bot conectado')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        if (from !== NUMERO_TESTE) return

        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

        const estados = getJSONFile(ESTADOS_FILE)
        if (!estados[from]) {
            estados[from] = { etapa: 'inicio', ultimaInteracao: new Date().toISOString() }
        }

        const estado = estados[from]
        estado.ultimaInteracao = new Date().toISOString()

        if (ESTADOS_HUMANOS.includes(estado.etapa)) {
            console.log(`👤 Humano ativo: ${from}`)
            return
        }

        await marcarComoLida(sock, msg)

        if (!dentroHorario() && estado.etapa === 'inicio') {
            const msgs = getJSONFile(MENSAGENS_FORA_HORARIO, [])
            msgs.push({ cliente: from, texto, data: new Date().toISOString() })
            saveJSONFile(MENSAGENS_FORA_HORARIO, msgs)

            estado.etapa = 'fora_horario'
            saveJSONFile(ESTADOS_FILE, estados)

            return sock.sendMessage(from, {
                text: `⏰ *ATENDIMENTO FORA DO HORÁRIO*\n\n` +
                        `Olá! No momento estamos fora do nosso horário de funcionamento.\n\n` +
                        `📅 *Horários de atendimento:*\n` +
                        `${formatarHorarioAtendimento()}\n\n` +
                        `✅ Deixe uma mensagem. Nossa equipe responderá assim que possível.\n\n` +
                        `Agradecemos sua compreensão! 💙`
            })
        }

        if (estado.etapa === 'inicio') {
            await sock.sendMessage(from, {
                text: `${getSaudacao()} Bem-vindo à *CrieArtes* 🎨`
            })

            estado.etapa = 'menu'
            saveJSONFile(ESTADOS_FILE, estados)
        }

        if (estado.etapa === 'menu') {
            if (texto === '1') {
                estado.etapa = 'aguardando_atendente'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `${saudacao} *BEM-VINDO(A) À CRIEARTES PERSONALIZADOS!* 🎨\n\n` +
                        `Somos especialistas em transformar suas ideias em produtos únicos e personalizados com muita qualidade e criatividade! 💙\n\n` +
                        `📍 *Nossos canais oficiais:*\n` +
                        `📸 Instagram: @cacrieartes\n` +
                        `📦 Catálogo completo: https://wa.me/c/5527999975339\n\n` 
                })
            }

            if (texto === '2') {
                estado.etapa = 'aguardando_atendente'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `📦 *ACOMPANHAMENTO DE PEDIDO*\n\nVocê será atendido por *${ATENDENTES.geral}* em instantes.\n\nPor favor, descreva sua necessidade:`
                })
            }

            return sock.sendMessage(from, {
                text: 'Digite:\n1️⃣ Fazer orçamento\n2️⃣ Acompanhar pedido'
            })
        }
    })
}

startBot()
