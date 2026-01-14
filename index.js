import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import P from 'pino'
import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode-terminal'

const ANTI_BAN_CONFIG = {
    ATIVO: true,
    DELAY_MINIMO: 1000,
    DELAY_MAXIMO: 5000,
    VARIACAO_HUMANA: true,
    BLOQUEIO_RAPIDO: true,
    MAX_MENSAGENS_MINUTO: 15,
    PAUSA_OCASIONAL: true,
    PAUSA_PROBABILIDADE: 0.1,
    PAUSA_TEMPO: 30000,
    LOG_DELAYS: true
}

class RateLimiter {
    constructor() {
        this.contadorMensagens = []
        this.ultimoEnvio = new Map()
        this.bloqueiosAtivos = new Map()
    }

    podeEnviar(numero) {
        if (!ANTI_BAN_CONFIG.BLOQUEIO_RAPIDO) return true
        
        const agora = Date.now()
        
        const bloqueadoAte = this.bloqueiosAtivos.get(numero)
        if (bloqueadoAte && agora < bloqueadoAte) {
            const segundosRestantes = Math.ceil((bloqueadoAte - agora) / 1000)
            console.log(`⏳ ${numero} bloqueado por mais ${segundosRestantes}s`)
            return false
        }
        
        if (bloqueadoAte && agora >= bloqueadoAte) {
            this.bloqueiosAtivos.delete(numero)
        }
        
        const umMinutoAtras = agora - 60000
        this.contadorMensagens = this.contadorMensagens.filter(
            item => item.timestamp > umMinutoAtras
        )
        
        const mensagensNumero = this.contadorMensagens.filter(
            item => item.numero === numero
        ).length
        
        if (mensagensNumero >= ANTI_BAN_CONFIG.MAX_MENSAGENS_MINUTO) {
            const bloqueioAte = agora + 60000
            this.bloqueiosAtivos.set(numero, bloqueioAte)
            console.log(`🚫 ${numero} excedeu limite de mensagens. Bloqueado por 1 minuto.`)
            return false
        }
        
        return true
    }

    registrarEnvio(numero) {
        this.contadorMensagens.push({
            numero,
            timestamp: Date.now()
        })
        this.ultimoEnvio.set(numero, Date.now())
    }

    tempoDesdeUltimoEnvio(numero) {
        const ultimo = this.ultimoEnvio.get(numero)
        if (!ultimo) return null
        return Date.now() - ultimo
    }

    limparAntigos() {
        const umaHoraAtras = Date.now() - 3600000
        this.contadorMensagens = this.contadorMensagens.filter(
            item => item.timestamp > umaHoraAtras
        )
    }
}

class DelayHumano {
    static getDelay() {
        if (!ANTI_BAN_CONFIG.ATIVO) return 0
        
        let delay = Math.floor(
            Math.random() * 
            (ANTI_BAN_CONFIG.DELAY_MAXIMO - ANTI_BAN_CONFIG.DELAY_MINIMO) + 
            ANTI_BAN_CONFIG.DELAY_MINIMO
        )
        
        if (ANTI_BAN_CONFIG.VARIACAO_HUMANA) {
            const variacao = Math.random() * 0.3 + 0.85
            delay = Math.floor(delay * variacao)
            
            if (Math.random() < 0.05) {
                delay += Math.floor(Math.random() * 3000)
            }
        }
        
        if (ANTI_BAN_CONFIG.PAUSA_OCASIONAL && 
            Math.random() < ANTI_BAN_CONFIG.PAUSA_PROBABILIDADE) {
            delay += ANTI_BAN_CONFIG.PAUSA_TEMPO
            console.log(`⏸️ Pausa longa simulada: ${ANTI_BAN_CONFIG.PAUSA_TEMPO/1000}s`)
        }
        
        if (ANTI_BAN_CONFIG.LOG_DELAYS) {
            console.log(`⏱️ Delay gerado: ${delay}ms`)
        }
        
        return delay
    }
    
    static getDelayPorTipo(tipo) {
        const delays = {
            'menu': { min: 1500, max: 4000 },
            'texto': { min: 1000, max: 3000 },
            'complexo': { min: 2000, max: 5000 },
            'imagem': { min: 3000, max: 7000 },
            'erro': { min: 800, max: 2000 }
        }
        
        const config = delays[tipo] || delays['texto']
        return Math.floor(
            Math.random() * (config.max - config.min) + config.min
        )
    }
}

class GestorEnvio {
    constructor(sock) {
        this.sock = sock
        this.rateLimiter = new RateLimiter()
        this.filaEnvio = []
        this.processando = false
        
        setInterval(() => {
            this.rateLimiter.limparAntigos()
        }, 3600000)
    }

    async enviarMensagem(numero, conteudo, tipo = 'texto') {
        return new Promise((resolve, reject) => {
            this.filaEnvio.push({
                numero,
                conteudo,
                tipo,
                resolve,
                reject,
                timestamp: Date.now()
            })
            
            if (!this.processando) {
                this.processarFila()
            }
        })
    }

    async processarFila() {
        if (this.filaEnvio.length === 0) {
            this.processando = false
            return
        }
        
        this.processando = true
        const item = this.filaEnvio.shift()
        
        try {
            if (!this.rateLimiter.podeEnviar(item.numero)) {
                setTimeout(() => {
                    this.filaEnvio.unshift(item)
                    this.processarFila()
                }, 30000)
                return
            }
            
            let delay = ANTI_BAN_CONFIG.ATIVO ? DelayHumano.getDelayPorTipo(item.tipo) : 0
            
            const tempoDesdeUltimo = this.rateLimiter.tempoDesdeUltimoEnvio(item.numero)
            if (tempoDesdeUltimo !== null && tempoDesdeUltimo < 1000) {
                delay += 2000
            }
            
            if (delay > 0) {
                if (ANTI_BAN_CONFIG.LOG_DELAYS) {
                    console.log(`⏳ Aguardando ${delay}ms antes de enviar para ${item.numero.split('@')[0]}`)
                }
                await this.delay(delay)
            }
            
            const resultado = await this.sock.sendMessage(item.numero, item.conteudo)
            
            this.rateLimiter.registrarEnvio(item.numero)
            
            if (ANTI_BAN_CONFIG.LOG_DELAYS) {
                console.log(`✅ Mensagem enviada para ${item.numero.split('@')[0]}`)
            }
            
            item.resolve(resultado)
            
        } catch (error) {
            console.error(`❌ Erro ao enviar mensagem para ${item.numero}:`, error)
            
            if (error.message?.includes('rate limit') || error.message?.includes('too many')) {
                console.log('🚨 Rate limit detectado pelo WhatsApp. Pausando por 2 minutos...')
                await this.delay(120000)
            }
            
            item.reject(error)
        }
        
        setTimeout(() => this.processarFila(), 100)
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

const ESTADOS_DIR = './estados'
const MENSAGENS_FORA_HORARIO = './mensagens_fora_horario.json'
const WHITELIST_FILE = './whitelist.json'
const STATS_FILE = './stats_anti_ban.json'

const ADMINS = [
    '27999975339@s.whatsapp.net' 
]

const ESTADOS_HUMANOS = ['aguardando_atendente']
const ESTADOS_NAO_LER = ['aguardando_atendente', 'fora_horario']

const HORARIO_ATENDIMENTO = {
    0: null,
    1: { inicio: '09:00', fim: '19:00' },
    2: { inicio: '09:00', fim: '17:00' },
    3: { inicio: '09:00', fim: '17:00' },
    4: { inicio: '09:00', fim: '17:00' },
    5: { inicio: '09:00', fim: '17:00' },
    6: null
}

const ATENDENTES = {
    geral: process.env.ATENDENTE_GERAL,
    orcamento: process.env.ATENDENTE_ORCAMENTO
}

const RESGATE_CONFIG = {
    TEMPO_ESPERA_MINUTOS: 5,
    MENSAGEM_RESGATE: "Oi 😊 ainda posso te ajudar?\nDigite MENU para ver as opções."
}

class EstatisticasAntiBan {
    constructor() {
        this.stats = this.carregarStats()
    }

    carregarStats() {
        if (!fs.existsSync(STATS_FILE)) {
            return {
                totalMensagens: 0,
                totalDelays: 0,
                tempoTotalDelay: 0,
                bloqueios: 0,
                rateLimits: 0,
                inicio: new Date().toISOString()
            }
        }
        return getJSONFile(STATS_FILE)
    }

    salvarStats() {
        saveJSONFile(STATS_FILE, this.stats)
    }

    registrarEnvio(delay = 0) {
        this.stats.totalMensagens++
        if (delay > 0) {
            this.stats.totalDelays++
            this.stats.tempoTotalDelay += delay
        }
        this.salvarStats()
    }

    registrarBloqueio() {
        this.stats.bloqueios++
        this.salvarStats()
    }

    registrarRateLimit() {
        this.stats.rateLimits++
        this.salvarStats()
    }

    getResumo() {
        const avgDelay = this.stats.totalDelays > 0 
            ? Math.floor(this.stats.tempoTotalDelay / this.stats.totalDelays)
            : 0
        
        return `📊 ESTATÍSTICAS ANTI-BAN:
• Mensagens enviadas: ${this.stats.totalMensagens}
• Delays aplicados: ${this.stats.totalDelays}
• Delay médio: ${avgDelay}ms
• Bloqueios: ${this.stats.bloqueios}
• Rate limits: ${this.stats.rateLimits}
• Desde: ${new Date(this.stats.inicio).toLocaleString()}`
    }
}

if (!fs.existsSync(ESTADOS_DIR)) {
    fs.mkdirSync(ESTADOS_DIR, { recursive: true })
}

function getNumeroFile(numero) {
    const numeroLimpo = numero.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
    return path.join(ESTADOS_DIR, `${numeroLimpo}.json`)
}

function getEstadoCliente(numero) {
    const file = getNumeroFile(numero)
    if (!fs.existsSync(file)) {
        return { etapa: 'inicio', ultimaInteracao: new Date().toISOString() }
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
        console.error(`❌ Erro ao ler estado do cliente ${numero}:`, error)
        return { etapa: 'inicio', ultimaInteracao: new Date().toISOString() }
    }
}

function saveEstadoCliente(numero, estado) {
    const file = getNumeroFile(numero)
    try {
        fs.writeFileSync(file, JSON.stringify(estado, null, 2))
    } catch (error) {
        console.error(`❌ Erro ao salvar estado do cliente ${numero}:`, error)
    }
}

function deleteEstadoCliente(numero) {
    const file = getNumeroFile(numero)
    if (fs.existsSync(file)) {
        try {
            fs.unlinkSync(file)
            return true
        } catch (error) {
            console.error(`❌ Erro ao deletar estado do cliente ${numero}:`, error)
        }
    }
    return false
}

function getAllClientes() {
    const clientes = []
    try {
        const files = fs.readdirSync(ESTADOS_DIR)
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(ESTADOS_DIR, file)
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
                    const numero = `55${file.replace('.json', '')}@s.whatsapp.net`
                    clientes.push({ numero, estado: data })
                } catch (error) {
                    console.error(`❌ Erro ao ler arquivo ${file}:`, error)
                }
            }
        }
    } catch (error) {
        console.error('❌ Erro ao listar clientes:', error)
    }
    return clientes
}

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
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
        console.error(`❌ Erro ao ler arquivo ${file}:`, error)
        return def
    }
}

function saveJSONFile(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2))
    } catch (error) {
        console.error(`❌ Erro ao salvar arquivo ${file}:`, error)
    }
}

async function marcarComoLida(sock, msg) {
    try {
        await sock.readMessages([msg.key])
    } catch (error) {
        console.error('❌ Erro ao marcar mensagem como lida:', error)
    }
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

function getWhitelist() {
    return getJSONFile(WHITELIST_FILE, {})
}

function saveWhitelist(lista) {
    saveJSONFile(WHITELIST_FILE, lista)
}

function isWhitelisted(numero) {
    const lista = getWhitelist()
    return !!lista[numero]
}

function configurarSistemaResgate(sock, gestorEnvio) {
    setInterval(async () => {
        try {
            const clientes = getAllClientes()
            const agora = new Date()
            let resgatesEnviados = 0

            for (const { numero, estado } of clientes) {
                if (
                      estado.etapa === 'menu' &&
                      (estado.tentativasResgate ?? 0) < 2
                  ) {
                      const ultima = estado.ultimaTentativaResgate
                          ? new Date(estado.ultimaTentativaResgate)
                          : new Date(estado.ultimaInteracao)
                  
                      const minutos = (agora - ultima) / (1000 * 60)
                  
                      if (minutos >= RESGATE_CONFIG.TEMPO_ESPERA_MINUTOS) {
                          estado.tentativasResgate = (estado.tentativasResgate ?? 0) + 1
                          estado.ultimaTentativaResgate = agora.toISOString()
                  
                          saveEstadoCliente(numero, estado)
                  
                          await gestorEnvio.enviarMensagem(
                              numero,
                              { text: RESGATE_CONFIG.MENSAGEM_RESGATE },
                              'texto'
                          )
                        resgatesEnviados++
                      }
                  }

              if ((estado.tentativasResgate ?? 0) >= 2) {
                  estado.resgateEncerrado = true
                  saveEstadoCliente(numero, estado)
                  continue
              }
            }

            if (resgatesEnviados > 0) {
                console.log(`📤 Total de resgates enviados: ${resgatesEnviados}`)
            }
        } catch (error) {
            console.error('❌ Erro no sistema de resgate:', error)
        }
    }, 60 * 1000)
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ['CrieArtes Bot', 'Chrome', '3.0']
    })

    const gestorEnvio = new GestorEnvio(sock)
    const estatisticas = new EstatisticasAntiBan()

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
        if (qr) qrcode.generate(qr, { small: true })

        if (connection === 'close') {
            const logout = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut
            if (!logout) setTimeout(startBot, 5000)
        }

        if (connection === 'open') {
            console.log('✅ Bot conectado com sistema Anti-Ban')
            console.log(`📊 Config Anti-Ban: ${ANTI_BAN_CONFIG.ATIVO ? 'ATIVO' : 'INATIVO'}`)
            console.log(`⏱️ Delays: ${ANTI_BAN_CONFIG.DELAY_MINIMO}-${ANTI_BAN_CONFIG.DELAY_MAXIMO}ms`)
            console.log(estatisticas.getResumo())
            
            configurarSistemaResgate(sock, gestorEnvio)
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
      if (msg.key.fromMe) {
            const numero = msg.key.remoteJid
        
            if (
                numero === 'status@broadcast' ||
                numero.endsWith('@broadcast') ||
                numero.endsWith('@g.us')
            ) return
        
            saveEstadoCliente(numero, {
                etapa: 'aguardando_atendente',
                intervencaoHumana: true,
                ultimaInteracao: new Date().toISOString()
            })
        
            console.log(`👤 Conversa assumida manualmente: ${numero.split('@')[0]}`)
            return
        }
      
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid

        // Ignora status, broadcast e grupos
        if (
            from === 'status@broadcast' ||
            from.endsWith('@broadcast') ||
            from.endsWith('@g.us')
        ) {
            return
        }
        
        const texto = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''
        ).trim().toUpperCase()

        if (texto === '/ANTIBANSTATS') {
            if (!ADMINS.includes(from)) {
                return gestorEnvio.enviarMensagem(from, { 
                    text: '❌ Você não tem permissão.' 
                }, 'texto')
            }
            
            const resumo = estatisticas.getResumo()
            const config = `⚙️ CONFIG ATUAL:
• Ativo: ${ANTI_BAN_CONFIG.ATIVO}
• Delay: ${ANTI_BAN_CONFIG.DELAY_MINIMO}-${ANTI_BAN_CONFIG.DELAY_MAXIMO}ms
• Máx/min: ${ANTI_BAN_CONFIG.MAX_MENSAGENS_MINUTO} msg/min
• Variação: ${ANTI_BAN_CONFIG.VARIACAO_HUMANA ? 'ON' : 'OFF'}
• Pausas: ${ANTI_BAN_CONFIG.PAUSA_OCASIONAL ? 'ON' : 'OFF'}`
            
            return gestorEnvio.enviarMensagem(from, { 
                text: `${resumo}\n\n${config}` 
            }, 'texto')
        }

        if (texto.startsWith('/SETDELAY')) {
            if (!ADMINS.includes(from)) {
                return gestorEnvio.enviarMensagem(from, { 
                    text: '❌ Você não tem permissão.' 
                }, 'texto')
            }

            const partes = texto.split(' ')
            if (partes.length !== 3) {
                return gestorEnvio.enviarMensagem(from, { 
                    text: '❌ Use: /setdelay MIN MAX (em ms)\nEx: /setdelay 1000 5000' 
                }, 'texto')
            }

            const min = parseInt(partes[1])
            const max = parseInt(partes[2])

            if (isNaN(min) || isNaN(max) || min < 0 || max < min) {
                return gestorEnvio.enviarMensagem(from, { 
                    text: '❌ Valores inválidos. Use números positivos com MIN < MAX' 
                }, 'texto')
            }

            ANTI_BAN_CONFIG.DELAY_MINIMO = min
            ANTI_BAN_CONFIG.DELAY_MAXIMO = max

            return gestorEnvio.enviarMensagem(from, { 
                text: `✅ Delay configurado: ${min}-${max}ms` 
            }, 'texto')
        }

        if (texto === '/TOGGLEANTIBAN') {
            if (!ADMINS.includes(from)) {
                return gestorEnvio.enviarMensagem(from, { 
                    text: '❌ Você não tem permissão.' 
                }, 'texto')
            }

            ANTI_BAN_CONFIG.ATIVO = !ANTI_BAN_CONFIG.ATIVO
            const status = ANTI_BAN_CONFIG.ATIVO ? 'ATIVADO' : 'DESATIVADO'

            return gestorEnvio.enviarMensagem(from, { 
                text: `✅ Sistema Anti-Ban ${status}` 
            }, 'texto')
        }

        if (texto.startsWith('/ADDWHITELIST')) {
            if (!ADMINS.includes(from)) {
                return gestorEnvio.enviarMensagem(from, { text: '❌ Você não tem permissão.' }, 'texto')
            }
        
            const numero = texto.split(' ')[1]?.replace(/\D/g, '')
            if (!numero) {
                return gestorEnvio.enviarMensagem(from, { text: '❌ Use: /addwhitelist 5599999999999' }, 'texto')
            }
        
            const jid = `${numero}@s.whatsapp.net`
            const lista = getWhitelist()
        
            if (lista[jid]) {
                return gestorEnvio.enviarMensagem(from, { text: '⚠️ Número já está na whitelist.' }, 'texto')
            }
        
            lista[jid] = true
            saveWhitelist(lista)
        
            estatisticas.registrarEnvio()
            return gestorEnvio.enviarMensagem(from, {
                text: `✅ Número ${numero} adicionado à whitelist.`
            }, 'texto')
        }
        
        if (texto.startsWith('/REMOVEWHITELIST')) {
            if (!ADMINS.includes(from)) {
                return gestorEnvio.enviarMensagem(from, { text: '❌ Você não tem permissão.' }, 'texto')
            }
        
            const numero = texto.split(' ')[1]?.replace(/\D/g, '')
            if (!numero) {
                return gestorEnvio.enviarMensagem(from, { text: '❌ Use: /removewhitelist 5599999999999' }, 'texto')
            }
        
            const jid = `${numero}@s.whatsapp.net`
            const lista = getWhitelist()
        
            if (!lista[jid]) {
                return gestorEnvio.enviarMensagem(from, { text: '⚠️ Número não está na whitelist.' }, 'texto')
            }
        
            delete lista[jid]
            saveWhitelist(lista)
        
            estatisticas.registrarEnvio()
            return gestorEnvio.enviarMensagem(from, {
                text: `🗑️ Número ${numero} removido da whitelist.`
            }, 'texto')
        }

        if (isWhitelisted(from) && !ADMINS.includes(from)) {
            console.log(`⭐ Número na whitelist (ignorado): ${from.split('@')[0]}`)
            return
        }

        const estado = getEstadoCliente(from)
        if (estado.intervencaoHumana) {
            console.log(`🛑 Fluxo automático bloqueado por intervenção humana: ${from.split('@')[0]}`)
            return
        }
      
        estado.ultimaInteracao = new Date().toISOString()

        if (podeMarcarComoLida(estado)) {
            await marcarComoLida(sock, msg)
        }

      if (estado.resgateEncerrado && estado.etapa === 'menu') {
          console.log(`🛑 Resgate encerrado para ${from.split('@')[0]}`)
          return
      }

        if (texto === 'MENU') {
            estado.etapa = 'menu'
            estado.tentativasResgate = 0
            estado.resgateEncerrado = false
            saveEstadoCliente(from, estado)

            estatisticas.registrarEnvio()
            return gestorEnvio.enviarMensagem(from, {
                text: `Como podemos ajudar você hoje? 🤔\n\n` +
                      `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                      `   ↳ Solicite um orçamento personalizado\n\n` +
                      `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                      `   ↳ Consulte o status do seu pedido\n\n` +
                      `3️⃣ 📋 *VER CATÁLOGO*\n` +
                      `   ↳ Consulte produtos e valores\n\n` +
                      `🔢 *Digite o número da opção desejada:*`
            }, 'menu')
        }

        if (texto === 'ENCERRAR' || texto === 'FINALIZAR') {
            saveEstadoCliente(from, {
                etapa: 'inicio',
                intervencaoHumana: false,
                tentativasResgate: 0,
                resgateEncerrado: false,
                ultimaInteracao: new Date().toISOString()
            })
        
            estatisticas.registrarEnvio()
            return gestorEnvio.enviarMensagem(from, {
                text: `✅ *Atendimento encerrado com sucesso!*\n\n` +
                      `Se precisar de algo mais, é só enviar uma mensagem 😊`
            }, 'texto')
        }  

        if (ESTADOS_HUMANOS.includes(estado.etapa)) {
            console.log(`👤 Atendimento humano ativo: ${from}`)
            return
        }

        if (!dentroHorario() && estado.etapa === 'inicio') {
          
          const msgs = getJSONFile(MENSAGENS_FORA_HORARIO, [])
          msgs.push({ cliente: from, texto, data: new Date().toISOString() })
          saveJSONFile(MENSAGENS_FORA_HORARIO, msgs)
      
          estado.etapa = 'fora_horario'
          saveEstadoCliente(from, estado)
      
          estatisticas.registrarEnvio()
          return gestorEnvio.enviarMensagem(from, {
              text: `⏰ *ATENDIMENTO FORA DO HORÁRIO*\n\n` +
                    `Olá! No momento estamos fora do nosso horário de funcionamento.\n\n` +
                    `📅 *Horários de atendimento: Seg-Sex 09:00 as 17:00*\n` +
                    `✅ Deixe uma mensagem. Nossa equipe responderá assim que possível.\n\n` +
                    `Agradecemos sua compreensão! 💙`
          }, 'texto')
        }

        if (estado.etapa === 'inicio') {
            const saudacao = getSaudacao()

            await gestorEnvio.enviarMensagem(from, {
                text: `${saudacao} *BEM-VINDO(A) À CRIEARTES PERSONALIZADOS!* 🎨\n\n` +
                      `Somos especialistas em transformar suas ideias em produtos únicos e personalizados com muita qualidade e criatividade! 💙\n\n` +
                      `📍 *Nossos canais oficiais:*\n` +
                      `📸 Instagram: @cacrieartes\n` +
                      `📦 Catálogo completo: https://wa.me/c/5527999975339\n\n`
            }, 'texto')

            estado.etapa = 'menu'
            saveEstadoCliente(from, estado)

            estatisticas.registrarEnvio()
            return gestorEnvio.enviarMensagem(from, {
                text: `Como podemos ajudar você hoje? 🤔\n\n` +
                      `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                      `   ↳ Solicite um orçamento personalizado\n\n` +
                      `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                      `   ↳ Consulte o status do seu pedido\n\n` +
                      `3️⃣ 📋 *VER CATÁLOGO*\n` +
                      `   ↳ Consulte produtos e valores\n\n` +
                      `🔢 *Digite o número da opção desejada:*`
            }, 'menu')
        }

        if (estado.etapa === 'menu') {
            switch (texto) {

                case '1':
                    estado.etapa = 'aguardando_atendente'
                    saveEstadoCliente(from, estado)

                    estatisticas.registrarEnvio()
                    return gestorEnvio.enviarMensagem(from, {
                        text: `📝 *FAZER ORÇAMENTO*\n\n` +
                              `Em breve você será atendido pelo atendente *${ATENDENTES.orcamento}*.\n\n` +
                              `Para adiantar, informe:\n` +
                              `• Nome completo\n` +
                              `• Produto desejado e quantidade\n` +
                              `• E/ou qualquer dúvida que tenha\n\n` +
                              `🏠 Digite *MENU* para voltar às opções principais.`
                    }, 'texto')

                case '2':
                    estado.etapa = 'aguardando_atendente'
                    saveEstadoCliente(from, estado)

                    estatisticas.registrarEnvio()
                    return gestorEnvio.enviarMensagem(from, {
                        text: `📦 *ACOMPANHAMENTO DE PEDIDO*\n\n` +
                              `Em breve você será atendido pelo atendente *${ATENDENTES.geral}*.\n\n` +
                              `Para adiantar, informe:\n` +
                              `• Nome completo\n` +
                              `• E/ou qualquer dúvida que tenha\n\n` +
                              `🏠 Digite *MENU* para voltar às opções principais.`
                    }, 'texto')

                case '3':
                    estatisticas.registrarEnvio()
                    return gestorEnvio.enviarMensagem(from, {
                        text: `📋 *NOSSO CATÁLOGO*\n\n` +
                              `🌐 Acesse nosso catálogo completo:\n` +
                              `https://wa.me/c/5527999975339\n\n` +
                              `Ou nos siga no Instagram:\n` +
                              `📸 @cacrieartes\n\n` +
                              `🏠 Digite *MENU* para voltar.`
                    }, 'texto')

                default:
                    estatisticas.registrarEnvio()
                    return gestorEnvio.enviarMensagem(from, {
                        text: '❌ *Opção inválida*\n\nDigite *1* para orçamento ou *2* para acompanhamento.'
                    }, 'erro')
            }
        }
    })
}

setInterval(() => {
    if (ANTI_BAN_CONFIG.LOG_DELAYS) {
        console.log('📈 Sistema Anti-Ban em execução...')
    }
}, 300000)

setInterval(() => {
    try {
        const clientes = getAllClientes()
        const agora = new Date()
        let sessõesRemovidas = 0
        let flagsRemovidos = 0

        for (const { numero, estado } of clientes) {
            if (!estado.ultimaInteracao) continue

            const ultimaInteracao = new Date(estado.ultimaInteracao)
            const horasInativo = (agora - ultimaInteracao) / (1000 * 60 * 60)

            if (horasInativo > 24) {
                if (deleteEstadoCliente(numero)) {
                    sessõesRemovidas++
                    console.log(
                        `🧹 Sessão removida: ${numero.split('@')[0]} ` +
                        `(${horasInativo.toFixed(1)}h inativo)`
                    )
                }
            }
        }

        if (sessõesRemovidas > 0 || flagsRemovidos > 0) {
            console.log(`📊 Limpeza: ${sessõesRemovidas} sessões removidas, ${flagsRemovidos} flags removidos`)
        }
    } catch (error) {
        console.error('❌ Erro na limpeza automática:', error)
    }
}, 60 * 60 * 1000)

startBot()
