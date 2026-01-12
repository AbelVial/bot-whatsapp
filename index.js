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
const ESTADOS_NAO_LER = ['aguardando_atendente', 'fora_horario']

const HORARIO_ATENDIMENTO = {
    0: null,
    1: { inicio: '12:00', fim: '18:00' },
    2: { inicio: '09:00', fim: '18:00' },
    3: { inicio: '09:00', fim: '18:00' },
    4: { inicio: '09:00', fim: '18:00' },
    5: { inicio: '09:00', fim: '18:00' },
    6: null
}

const ATENDENTES = {
    geral: process.env.ATENDENTE_GERAL || 'Cristiane',
    orcamento: process.env.ATENDENTE_ORCAMENTO || 'Cristiane'
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

function podeMarcarComoLida(estado) {
    return !ESTADOS_NAO_LER.includes(estado.etapa)
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

        const texto = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''
        ).trim().toUpperCase()

        const estados = getJSONFile(ESTADOS_FILE)
        if (!estados[from]) {
            estados[from] = { etapa: 'inicio', ultimaInteracao: new Date().toISOString() }
        }

        const estado = estados[from]
        estado.ultimaInteracao = new Date().toISOString()

         if (podeMarcarComoLida(estado)) {
             await marcarComoLida(sock, msg)
         }

        /* =========================
           COMANDOS GLOBAIS
        ========================= */

        if (texto === 'MENU') {
            estado.etapa = 'menu'
            saveJSONFile(ESTADOS_FILE, estados)

            return sock.sendMessage(from, {
                text: `Como podemos ajudar você hoje? 🤔\n\n` +
                      `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                      `   ↳ Solicite um orçamento personalizado\n\n` +
                      `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                      `   ↳ Consulte o status do seu pedido\n\n` +
                      `🔢 *Digite o número da opção desejada:*`
            })
        }

        if (texto === 'ENCERRAR' || texto === 'FINALIZAR') {
            estado.etapa = 'inicio'
            saveJSONFile(ESTADOS_FILE, estados)

            return sock.sendMessage(from, {
                text: `✅ *Atendimento encerrado com sucesso!*\n\n` +
                      `Se precisar de algo mais, é só enviar uma mensagem 😊`
            })
        }

        /* =========================
           BLOQUEIO HUMANO
        ========================= */

        if (ESTADOS_HUMANOS.includes(estado.etapa)) {
            console.log(`👤 Atendimento humano ativo: ${from}`)
            return
        }

        /* =========================
           FORA DO HORÁRIO
        ========================= */

        if (!dentroHorario() && estado.etapa === 'inicio') {
          
          const msgs = getJSONFile(MENSAGENS_FORA_HORARIO, [])
          msgs.push({ cliente: from, texto, data: new Date().toISOString() })
          saveJSONFile(MENSAGENS_FORA_HORARIO, msgs)
      
          estado.etapa = 'fora_horario'
          saveJSONFile(ESTADOS_FILE, estados)
      
          return sock.sendMessage(from, {
              text: `⏰ *ATENDIMENTO FORA DO HORÁRIO*\n\n` +
                    `Olá! No momento estamos fora do nosso horário de funcionamento.\n\n` +
                    `📅 *Horários de atendimento: Seg-Sex 08-18:00*\n` +
                    `✅ Deixe uma mensagem. Nossa equipe responderá assim que possível.\n\n` +
                    `Agradecemos sua compreensão! 💙`
          })
      }

        /* =========================
           INÍCIO
        ========================= */

        if (estado.etapa === 'inicio') {
            const saudacao = getSaudacao()

            await sock.sendMessage(from, {
                text: `${saudacao} *BEM-VINDO(A) À CRIEARTES PERSONALIZADOS!* 🎨\n\n` +
                      `Somos especialistas em transformar suas ideias em produtos únicos e personalizados com muita qualidade e criatividade! 💙\n\n` +
                      `📍 *Nossos canais oficiais:*\n` +
                      `📸 Instagram: @cacrieartes\n` +
                      `📦 Catálogo completo: https://wa.me/c/5527999975339\n\n`
            })

            estado.etapa = 'menu'
            saveJSONFile(ESTADOS_FILE, estados)

            return sock.sendMessage(from, {
                text: `Como podemos ajudar você hoje? 🤔\n\n` +
                      `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                      `   ↳ Solicite um orçamento personalizado\n\n` +
                      `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                      `   ↳ Consulte o status do seu pedido\n\n` +
                      `🔢 *Digite o número da opção desejada:*`
            })
        }

        /* =========================
           MENU PRINCIPAL
        ========================= */

        if (estado.etapa === 'menu') {
            switch (texto) {

                case '1':
                    estado.etapa = 'aguardando_atendente'
                    saveJSONFile(ESTADOS_FILE, estados)

                    return sock.sendMessage(from, {
                        text: `📝 *FAZER ORÇAMENTO*\n\n` +
                              `Em breve você será atendido pelo atendente *${ATENDENTES.orcamento}*.\n\n` +
                              `Para adiantar, informe:\n` +
                              `• Nome completo\n` +
                              `• Produto desejado e quantidade\n` +
                              `• E/ou qualquer dúvida que tenha\n\n` +
                              `🏠 Digite *MENU* para voltar às opções principais.`
                    })

                case '2':
                    estado.etapa = 'aguardando_atendente'
                    saveJSONFile(ESTADOS_FILE, estados)

                    return sock.sendMessage(from, {
                        text: `📦 *ACOMPANHAMENTO DE PEDIDO*\n\n` +
                              `Em breve você será atendido pelo atendente *${ATENDENTES.geral}*.\n\n` +
                              `Para adiantar, informe:\n` +
                              `• Nome completo\n` +
                              `• E/ou qualquer dúvida que tenha\n\n` +
                              `🏠 Digite *MENU* para voltar às opções principais.`
                    })

                default:
                    return sock.sendMessage(from, {
                        text: '❌ *Opção inválida*\n\nDigite *1* para orçamento ou *2* para acompanhamento.'
                    })
            }
        }
    })
}

// Limpeza automática de sessões antigas (24h)
setInterval(() => {
    try {
        const estados = getJSONFile(ESTADOS_FILE)
        const agora = new Date()
        let modificado = false

        for (const [numero, estado] of Object.entries(estados)) {
            if (!estado.ultimaInteracao) continue

            const ultimaInteracao = new Date(estado.ultimaInteracao)
            const horasInativo = (agora - ultimaInteracao) / (1000 * 60 * 60)

            // Remove sessões inativas há mais de 24 horas
            if (horasInativo > 24) {
                delete estados[numero]
                modificado = true

                console.log(
                    `🧹 Sessão removida: ${numero.split('@')[0]} ` +
                    `(${horasInativo.toFixed(1)}h inativo)`
                )
            }
        }

        if (modificado) {
            saveJSONFile(ESTADOS_FILE, estados)
        }
    } catch (error) {
        console.error('❌ Erro na limpeza automática:', error)
    }
}, 60 * 60 * 1000) // Executa a cada 1 hora

startBot()
