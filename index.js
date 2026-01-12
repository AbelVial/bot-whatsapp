import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import P from 'pino'
import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode-terminal'

/* =========================
   CONFIGURAÇÕES
========================= */

const ESTADOS_DIR = './estados'
const MENSAGENS_FORA_HORARIO = './mensagens_fora_horario.json'
const WHITELIST_FILE = './whitelist.json'

const ADMINS = [
    '5527999975339@s.whatsapp.net' 
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

/* =========================
   SISTEMA DE ETIQUETAS (LABELS)
========================= */

const ETIQUETAS_CONFIG = {
    // Configuração das etiquetas (cores e nomes)
    labels: {
        'novo-contato': { nome: '👋 Novo Contato', cor: '#FF6900' },     // Laranja
        'no-menu': { nome: '📋 No Menu', cor: '#1ABC9C' },              // Verde água
        'orcamento': { nome: '💰 Orçamento', cor: '#FFD700' },          // Amarelo ouro
        'pedido': { nome: '📦 Pedido', cor: '#3498DB' },               // Azul
        'catalogo': { nome: '📚 Catálogo', cor: '#9B59B6' },           // Roxo
        'fora-expediente': { nome: '⏰ Fora Expediente', cor: '#95A5A6' }, // Cinza
        'atendimento-humano': { nome: '👤 Atendimento', cor: '#2ECC71' }, // Verde
        'finalizado': { nome: '✅ Finalizado', cor: '#27AE60' },        // Verde escuro
        'whitelist': { nome: '⭐ Whitelist', cor: '#F1C40F' }           // Amarelo
    },
    
    // Mapeamento de etapa para etiqueta
    etapaParaEtiqueta: {
        'inicio': 'novo-contato',
        'menu': 'no-menu',
        'aguardando_atendente': 'atendimento-humano',
        'fora_horario': 'fora-expediente'
    },
    
    // Mapeamento de opção para etiqueta
    opcaoParaEtiqueta: {
        '1': 'orcamento',
        '2': 'pedido', 
        '3': 'catalogo'
    }
}

/* =========================
   UTILITÁRIOS - ARQUIVOS INDIVIDUAIS
========================= */

// Garante que o diretório de estados existe
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
        return { 
            etapa: 'inicio', 
            ultimaInteracao: new Date().toISOString(),
            etiquetaAtual: 'novo-contato'
        }
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
        console.error(`❌ Erro ao ler estado do cliente ${numero}:`, error)
        return { 
            etapa: 'inicio', 
            ultimaInteracao: new Date().toISOString(),
            etiquetaAtual: 'novo-contato'
        }
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

/* =========================
   SISTEMA DE ETIQUETAS AUTOMÁTICO
========================= */

async function atualizarEtiquetaConversa(sock, numero, etiquetaKey) {
    try {
        const etiqueta = ETIQUETAS_CONFIG.labels[etiquetaKey]
        if (!etiqueta) return false

        // Verificar se a etiqueta já existe no WhatsApp
        let labels = await sock.fetchLabels()
        let targetLabel = labels.find(l => l.name === etiqueta.nome)
        
        // Se não existe, criar a etiqueta
        if (!targetLabel) {
            console.log(`🏷️ Criando etiqueta: ${etiqueta.nome}`)
            targetLabel = await sock.createLabel(etiqueta.nome, etiqueta.cor)
        }
        
        // Aplicar etiqueta à conversa
        await sock.labelChat(numero, targetLabel.id)
        
        console.log(`🏷️ Etiqueta "${etiqueta.nome}" aplicada em ${numero.split('@')[0]}`)
        return true
        
    } catch (error) {
        console.error(`❌ Erro ao atualizar etiqueta para ${numero}:`, error.message)
        return false
    }
}

async function gerenciarEtiquetasCliente(sock, numero, estado, texto, opcao = null) {
    let novaEtiqueta = null
    
    // 1. Se for número da whitelist
    if (isWhitelisted(numero) && !ADMINS.includes(numero)) {
        novaEtiqueta = 'whitelist'
    }
    // 2. Se escolheu uma opção no menu
    else if (opcao && ETIQUETAS_CONFIG.opcaoParaEtiqueta[opcao]) {
        novaEtiqueta = ETIQUETAS_CONFIG.opcaoParaEtiqueta[opcao]
    }
    // 3. Se está em uma etapa específica
    else if (ETIQUETAS_CONFIG.etapaParaEtiqueta[estado.etapa]) {
        novaEtiqueta = ETIQUETAS_CONFIG.etapaParaEtiqueta[estado.etapa]
    }
    // 4. Comando ENCERRAR
    else if (texto === 'ENCERRAR' || texto === 'FINALIZAR') {
        novaEtiqueta = 'finalizado'
    }
    
    // Aplicar etiqueta se for diferente da atual
    if (novaEtiqueta && estado.etiquetaAtual !== novaEtiqueta) {
        const sucesso = await atualizarEtiquetaConversa(sock, numero, novaEtiqueta)
        if (sucesso) {
            estado.etiquetaAtual = novaEtiqueta
            saveEstadoCliente(numero, estado)
        }
    }
}

/* =========================
   SISTEMA DE RESGATE
========================= */

function configurarSistemaResgate(sock) {
    setInterval(async () => {
        try {
            const clientes = getAllClientes()
            const agora = new Date()
            let resgatesEnviados = 0

            for (const { numero, estado } of clientes) {
                if (estado.etapa === 'menu' && estado.ultimaInteracao) {
                    const ultimaInteracao = new Date(estado.ultimaInteracao)
                    const minutosInativo = (agora - ultimaInteracao) / (1000 * 60)

                    if (minutosInativo >= RESGATE_CONFIG.TEMPO_ESPERA_MINUTOS && !estado.resgatado) {
                        
                        estado.resgatado = true
                        estado.ultimoResgate = agora.toISOString()
                        saveEstadoCliente(numero, estado)

                        try {
                            await sock.sendMessage(numero, {
                                text: RESGATE_CONFIG.MENSAGEM_RESGATE
                            })
                            resgatesEnviados++
                            console.log(`🔄 Resgate enviado para: ${numero.split('@')[0]} (${minutosInativo.toFixed(1)}min inativo)`)
                        } catch (error) {
                            console.error(`❌ Erro ao enviar resgate para ${numero}:`, error)
                        }
                    }
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

/* =========================
   INICIALIZAÇÃO DAS ETIQUETAS
========================= */

async function inicializarEtiquetas(sock) {
    try {
        console.log('🏷️ Inicializando sistema de etiquetas...')
        
        // Criar todas as etiquetas configuradas
        for (const [key, config] of Object.entries(ETIQUETAS_CONFIG.labels)) {
            try {
                let labels = await sock.fetchLabels()
                let labelExists = labels.find(l => l.name === config.nome)
                
                if (!labelExists) {
                    await sock.createLabel(config.nome, config.cor)
                    console.log(`✅ Etiqueta criada: ${config.nome}`)
                }
            } catch (error) {
                console.error(`❌ Erro ao criar etiqueta ${config.nome}:`, error.message)
            }
        }
        
        console.log('✅ Sistema de etiquetas inicializado')
    } catch (error) {
        console.error('❌ Erro na inicialização de etiquetas:', error)
    }
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

    sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
        if (qr) qrcode.generate(qr, { small: true })

        if (connection === 'close') {
            const logout = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut
            if (!logout) setTimeout(startBot, 5000)
        }

        if (connection === 'open') {
            console.log('✅ Bot conectado')
            console.log(`📁 Diretório de estados: ${ESTADOS_DIR}`)
            
            // Inicializar etiquetas
            await inicializarEtiquetas(sock)
            
            // Iniciar sistema de resgate
            configurarSistemaResgate(sock)
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid

        /* =========================
            WHITELIST (IGNORA BOT)
         ========================= */
         
        if (isWhitelisted(from) && !ADMINS.includes(from)) {
            console.log(`⭐ Número na whitelist (ignorado pelo bot): ${from}`)
            await gerenciarEtiquetasCliente(sock, from, { etapa: 'whitelist' }, 'WHITELIST')
            return
        }

        const texto = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''
        ).trim().toUpperCase()

        // Obtém estado individual do cliente
        const estado = getEstadoCliente(from)
        
        // Atualiza timestamp da última interação e reseta flag de resgate
        estado.ultimaInteracao = new Date().toISOString()
        estado.resgatado = false

        // Gerenciar etiqueta ANTES de processar a mensagem
        await gerenciarEtiquetasCliente(sock, from, estado, texto)

        if (podeMarcarComoLida(estado)) {
            await marcarComoLida(sock, msg)
        }

        /* =========================
           COMANDOS GLOBAIS
        ========================= */

        if (texto === 'MENU') {
            estado.etapa = 'menu'
            saveEstadoCliente(from, estado)
            await gerenciarEtiquetasCliente(sock, from, estado, texto)

            return sock.sendMessage(from, {
                text: `Como podemos ajudar você hoje? 🤔\n\n` +
                      `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                      `   ↳ Solicite um orçamento personalizado\n\n` +
                      `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                      `   ↳ Consulte o status do seu pedido\n\n` +
                      `3️⃣ 📋 *VER CATÁLOGO*\n` +
                      `   ↳ Consulte produtos e valores\n\n` +
                      `🔢 *Digite o número da opção desejada:*`
            })
        }

        if (texto === 'ENCERRAR' || texto === 'FINALIZAR') {
            estado.etapa = 'inicio'
            saveEstadoCliente(from, estado)
            await gerenciarEtiquetasCliente(sock, from, estado, texto)

            return sock.sendMessage(from, {
                text: `✅ *Atendimento encerrado com sucesso!*\n\n` +
                      `Se precisar de algo mais, é só enviar uma mensagem 😊`
            })
        }

        /* =========================
            COMANDOS ADMIN
         ========================= */
         
        if (texto.startsWith('/ADDWHITELIST')) {
            if (!ADMINS.includes(from)) {
                return sock.sendMessage(from, { text: '❌ Você não tem permissão.' })
            }
        
            const numero = texto.split(' ')[1]?.replace(/\D/g, '')
            if (!numero) {
                return sock.sendMessage(from, { text: '❌ Use: /addwhitelist 5599999999999' })
            }
        
            const jid = `${numero}@s.whatsapp.net`
            const lista = getWhitelist()
        
            if (lista[jid]) {
                return sock.sendMessage(from, { text: '⚠️ Número já está na whitelist.' })
            }
        
            lista[jid] = true
            saveWhitelist(lista)
        
            // Aplicar etiqueta de whitelist
            const estadoWhitelist = getEstadoCliente(jid)
            await gerenciarEtiquetasCliente(sock, jid, estadoWhitelist, 'WHITELIST')
        
            return sock.sendMessage(from, {
                text: `✅ Número ${numero} adicionado à whitelist.`
            })
        }

        
        if (texto.startsWith('/REMOVEWHITELIST')) {
            if (!ADMINS.includes(from)) {
                return sock.sendMessage(from, { text: '❌ Você não tem permissão.' })
            }
        
            const numero = texto.split(' ')[1]?.replace(/\D/g, '')
            if (!numero) {
                return sock.sendMessage(from, { text: '❌ Use: /removewhitelist 5599999999999' })
            }
        
            const jid = `${numero}@s.whatsapp.net`
            const lista = getWhitelist()
        
            if (!lista[jid]) {
                return sock.sendMessage(from, { text: '⚠️ Número não está na whitelist.' })
            }
        
            delete lista[jid]
            saveWhitelist(lista)
        
            // Remover etiqueta de whitelist
            const estadoCliente = getEstadoCliente(jid)
            delete estadoCliente.etiquetaAtual
            saveEstadoCliente(jid, estadoCliente)
        
            return sock.sendMessage(from, {
                text: `🗑️ Número ${numero} removido da whitelist.`
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
            saveEstadoCliente(from, estado)
            await gerenciarEtiquetasCliente(sock, from, estado, texto)
        
            return sock.sendMessage(from, {
                text: `⏰ *ATENDIMENTO FORA DO HORÁRIO*\n\n` +
                      `Olá! No momento estamos fora do nosso horário de funcionamento.\n\n` +
                      `📅 *Horários de atendimento: Seg-Sex 09:00 as 17:00*\n` +
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
            saveEstadoCliente(from, estado)
            await gerenciarEtiquetasCliente(sock, from, estado, texto)

            return sock.sendMessage(from, {
                text: `Como podemos ajudar você hoje? 🤔\n\n` +
                      `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                      `   ↳ Solicite um orçamento personalizado\n\n` +
                      `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                      `   ↳ Consulte o status do seu pedido\n\n` +
                      `3️⃣ 📋 *VER CATÁLOGO*\n` +
                      `   ↳ Consulte produtos e valores\n\n` +
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
                    saveEstadoCliente(from, estado)
                    await gerenciarEtiquetasCliente(sock, from, estado, texto, '1')

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
                    saveEstadoCliente(from, estado)
                    await gerenciarEtiquetasCliente(sock, from, estado, texto, '2')

                    return sock.sendMessage(from, {
                        text: `📦 *ACOMPANHAMENTO DE PEDIDO*\n\n` +
                              `Em breve você será atendido pelo atendente *${ATENDENTES.geral}*.\n\n` +
                              `Para adiantar, informe:\n` +
                              `• Nome completo\n` +
                              `• E/ou qualquer dúvida que tenha\n\n` +
                              `🏠 Digite *MENU* para voltar às opções principais.`
                    })

                case '3':
                    await gerenciarEtiquetasCliente(sock, from, estado, texto, '3')
                    return sock.sendMessage(from, {
                        text: `📋 *NOSSO CATÁLOGO*\n\n` +
                              `🌐 Acesse nosso catálogo completo:\n` +
                              `https://wa.me/c/5527999975339\n\n` +
                              `Ou nos siga no Instagram:\n` +
                              `📸 @cacrieartes\n\n` +
                              `🏠 Digite *MENU* para voltar.`
                    })

                default:
                    return sock.sendMessage(from, {
                        text: '❌ *Opção inválida*\n\n' +
                              'Digite *1* para orçamento, *2* para acompanhamento ou *3* para catálogo.'
                    })
            }
        }
    })
}

// Limpeza automática de sessões antigas (24h) e flags de resgate
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
                    console.log(`🧹 Sessão removida: ${numero.split('@')[0]} (${horasInativo.toFixed(1)}h inativo)`)
                }
            } else if (estado.resgatado && horasInativo > 0.5) {
                delete estado.resgatado
                if (estado.ultimoResgate) delete estado.ultimoResgate
                saveEstadoCliente(numero, estado)
                flagsRemovidos++
                console.log(`🔄 Flag de resgate removido: ${numero.split('@')[0]} (${horasInativo.toFixed(1)}h desde última interação)`)
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
