import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason
} from '@whiskeysockets/baileys'
import P from 'pino'
import fs from 'fs'
import qrcode from 'qrcode-terminal'
import {
    catalogo,
    textoCatalogoPorCategoria
} from './catalogo.js'

/* =========================
   CONFIGURAÇÕES
========================= */
const ESTADOS_FILE = './estados.json'
const PEDIDOS_FILE = './pedidos.json'
const HORARIO_FILE = './horario_status.json'

const HORARIO_ATENDIMENTO = {
    dias: [1, 2, 3, 4, 5, 6], // Segunda a Sábado
    inicio: 9,
    fim: 18,
    sabadoFim: 13
}

const ATENDENTES = {
    orcamento: process.env.ATENDENTE_ORCAMENTO || "Abel",
    acompanhamento: process.env.ATENDENTE_ACOMPANHAMENTO || "Cristiane",
    whatsapp: process.env.WHATSAPP_CONTATO || "27999999999"
}

/* =========================
   FUNÇÕES UTILITÁRIAS
========================= */
function dentroHorario() {
    const agora = new Date()
    const diaSemana = agora.getDay()
    const hora = agora.getHours()
    const minutos = agora.getMinutes()
    const horaAtual = hora + (minutos / 60)

    if (!HORARIO_ATENDIMENTO.dias.includes(diaSemana)) {
        return false
    }

    if (diaSemana === 6) { // Sábado
        return horaAtual >= HORARIO_ATENDIMENTO.inicio &&
            horaAtual < HORARIO_ATENDIMENTO.sabadoFim
    }

    return horaAtual >= HORARIO_ATENDIMENTO.inicio &&
        horaAtual < HORARIO_ATENDIMENTO.fim
}

function getJSONFile(filename, defaultData = {}) {
    try {
        if (!fs.existsSync(filename)) {
            fs.writeFileSync(filename, JSON.stringify(defaultData, null, 2))
            return defaultData
        }
        const data = fs.readFileSync(filename, 'utf-8')
        return data ? JSON.parse(data) : defaultData
    } catch (error) {
        console.error(`Erro ao ler ${filename}:`, error)
        return defaultData
    }
}

function saveJSONFile(filename, data) {
    try {
        fs.writeFileSync(filename, JSON.stringify(data, null, 2))
    } catch (error) {
        console.error(`Erro ao salvar ${filename}:`, error)
    }
}

function formatarHorarioAtendimento() {
    return `Segunda a Sexta: ${HORARIO_ATENDIMENTO.inicio.toString().padStart(2, '0')}:00 às ${HORARIO_ATENDIMENTO.fim.toString().padStart(2, '0')}:00\n` +
        `Sábado: ${HORARIO_ATENDIMENTO.inicio.toString().padStart(2, '0')}:00 às ${HORARIO_ATENDIMENTO.sabadoFim.toString().padStart(2, '0')}:00`
}

function getSaudacao() {
    const hora = new Date().getHours()
    if (hora < 12) return '☀️ Bom dia! '
    if (hora < 18) return '🌤️ Boa tarde! '
    return '🌙 Boa noite! '
}

function gerarNumeroPedido() {
    const data = new Date()
    const ano = data.getFullYear().toString().slice(-2)
    const mes = (data.getMonth() + 1).toString().padStart(2, '0')
    const dia = data.getDate().toString().padStart(2, '0')
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `PED${ano}${mes}${dia}${random}`
}

/* =========================
   BOT SIMPLIFICADO
========================= */
async function startBot() {
    console.log('🤖 INICIANDO BOT DE ATENDIMENTO CRIEARTES\n')

    const { state, saveCreds } = await useMultiFileAuthState('auth')

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ["CrieArtes Bot", "Chrome", "3.0"],
        markOnlineOnConnect: true
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
        if (qr) {
            console.log('\n' + '═'.repeat(50))
            console.log('📱 QR CODE PARA CONEXÃO:')
            console.log('═'.repeat(50) + '\n')
            qrcode.generate(qr, { small: true })
            console.log('\n⚠️  Escaneie este QR Code no WhatsApp Web')
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            
            if (shouldReconnect) {
                console.log('🔌 Reconectando em 5 segundos...')
                setTimeout(() => startBot(), 5000)
            } else {
                console.log('❌ Sessão finalizada. Reinicie o bot.')
            }
        }

        if (connection === 'open') {
            console.log('✅ CONECTADO COM SUCESSO!')
            console.log('🎨 Bot CrieArtes pronto para atendimento')
            console.log('📊 Status:', dentroHorario() ? '🟢 DENTRO DO HORÁRIO' : '🔴 FORA DO HORÁRIO')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0]
            if (!msg.message || msg.key.fromMe) return

            const from = msg.key.remoteJid
            const texto = msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.buttonsResponseMessage?.selectedButtonId ||
                ''

            const estados = getJSONFile(ESTADOS_FILE)

            if (!estados[from]) {
                estados[from] = {
                    etapa: 'inicio',
                    ultimaInteracao: new Date().toISOString(),
                    nomeCliente: ''
                }
            }

            const estado = estados[from]
            estado.ultimaInteracao = new Date().toISOString()

            console.log(`\n📨 [${new Date().toLocaleTimeString('pt-BR')}] ${from.split('@')[0]}: ${texto.substring(0, 100)}`)

            /* =========================
               VERIFICAÇÃO DE HORÁRIO
            ========================= */
            const horarioAtual = dentroHorario()

            if (!horarioAtual && estado.etapa === 'inicio') {
                saveJSONFile(HORARIO_FILE, {
                    cliente: from,
                    mensagem: texto,
                    data: new Date().toISOString()
                })

                await sock.sendMessage(from, {
                    text: `⏰ *ATENDIMENTO FORA DO HORÁRIO*\n\n` +
                        `Olá! No momento estamos fora do nosso horário de funcionamento.\n\n` +
                        `📅 *Horários de atendimento:*\n` +
                        `${formatarHorarioAtendimento()}\n\n` +
                        `💬 Sua mensagem foi registrada e responderemos assim que possível.\n\n` +
                        `Agradecemos sua compreensão! 💙`
                })

                estado.etapa = 'menu_fora_horario'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `🎯 *OPÇÕES DISPONÍVEIS:*\n\n` +
                        `1️⃣ 📋 VER CATÁLOGO DE PRODUTOS\n` +
                        `2️⃣ 📞 FALAR COM ATENDENTE AGORA\n` +
                        `3️⃣ 🏠 INFORMAÇÕES DA EMPRESA\n\n` +
                        `Digite o número da opção desejada:`
                })
            }

            /* =========================
               MENU FORA DO HORÁRIO
            ========================= */
            if (estado.etapa === 'menu_fora_horario') {
                switch (texto) {
                    case '1':
                        estado.etapa = 'catalogo_fora_horario'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `${textoCatalogoPorCategoria()}\n\n` +
                                `⚠️ *Importante:* Para solicitar orçamento, entre em contato diretamente:\n` +
                                `📱 ${ATENDENTES.whatsapp}\n\n` +
                                `🏠 Digite *MENU* para voltar`
                        })

                    case '2':
                        return sock.sendMessage(from, {
                            text: `📞 *CONTATO DIRETO*\n\n` +
                                `Para atendimento imediato:\n\n` +
                                `👤 *${ATENDENTES.orcamento}*\n` +
                                `📱 ${ATENDENTES.whatsapp}\n\n` +
                                `*Horário de resposta:*\n` +
                                `${formatarHorarioAtendimento()}\n\n` +
                                `🏠 Digite *MENU* para voltar`
                        })

                    case '3':
                        return sock.sendMessage(from, {
                            text: `🏪 *CRIEARTES PERSONALIZADOS*\n\n` +
                                `Transformamos seus sonhos em arte! Especializados em personalização de produtos.\n\n` +
                                `📍 *Instagram:* @cacrieartes\n` +
                                `📱 *WhatsApp:* ${ATENDENTES.whatsapp}\n\n` +
                                `🏠 Digite *MENU* para voltar`
                        })

                    case 'MENU':
                        estado.etapa = 'menu_fora_horario'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `🎯 *OPÇÕES DISPONÍVEIS:*\n\n` +
                                `1️⃣ 📋 VER CATÁLOGO DE PRODUTOS\n` +
                                `2️⃣ 📞 FALAR COM ATENDENTE AGORA\n` +
                                `3️⃣ 🏠 INFORMAÇÕES DA EMPRESA\n\n` +
                                `Digite o número da opção desejada:`
                        })
                }
            }

            /* =========================
               INÍCIO DENTRO DO HORÁRIO
            ========================= */
            if (estado.etapa === 'inicio') {
                const saudacao = getSaudacao()

                await sock.sendMessage(from, {
                    text: `${saudacao}*BEM-VINDO(A) À CRIEARTES PERSONALIZADOS!* 🎨\n\n` +
                        `Somos especialistas em transformar suas ideias em produtos únicos e personalizados! 💙`
                })

                estado.etapa = 'menu_principal'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `📋 *MENU PRINCIPAL - CRIEARTES*\n\n` +
                        `Como podemos ajudar você hoje?\n\n` +
                        `1️⃣ 📝 *FAZER UM PEDIDO*\n` +
                        `   ↳ Solicitar orçamento/compra\n\n` +
                        `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                        `   ↳ Consultar status do pedido\n\n` +
                        `3️⃣ 📋 *CONSULTAR PRODUTOS/PREÇOS*\n` +
                        `   ↳ Ver catálogo completo\n\n` +
                        `🔢 *Digite o número da opção desejada:*`
                })
            }

            /* =========================
               MENU PRINCIPAL
            ========================= */
            if (estado.etapa === 'menu_principal') {
                switch (texto) {
                    case '1': // FAZER PEDIDO
                        estado.etapa = 'fazer_pedido'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `📝 *FAZER UM PEDIDO*\n\n` +
                                `Em breve você será atendido pelo atendente *${ATENDENTES.orcamento}*.\n\n` +
                                `Para adiantar, informe:\n` +
                                `• Nome completo\n` +
                                `• Produto desejado e quantidade\n` +
                                `• E/ou qualquer dúvida que tenha\n\n` +
                                `Agradecemos sua preferência! 💙\n\n` +
                                `🏠 Digite *MENU* para voltar às opções principais.`
                        })

                    case '2': // ACOMPANHAR PEDIDO
                        estado.etapa = 'acompanhar_pedido'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `📦 *ACOMPANHAMENTO DE PEDIDO*\n\n` +
                                `Em breve você será atendido pelo atendente *${ATENDENTES.acompanhamento}*.\n\n` +
                                `Para adiantar, informe:\n` +
                                `• Nome completo\n` +
                                `• E/ou qualquer dúvida que tenha\n\n` +
                                `Agradecemos sua preferência! 💙\n\n` +
                                `🏠 Digite *MENU* para voltar às opções principais.`
                        })

                    case '3': // CONSULTAR PRODUTOS
                        estado.etapa = 'consultar_produtos'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `${textoCatalogoPorCategoria()}\n\n` +
                                `Para fazer um pedido ou tirar dúvidas:\n` +
                                `Digite *VOLTAR* e escolha a opção 1️⃣\n\n` +
                                `🏠 Digite *MENU* para menu principal`
                        })

                    case 'MENU':
                        estado.etapa = 'menu_principal'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `📋 *MENU PRINCIPAL - CRIEARTES*\n\n` +
                                `Como podemos ajudar você hoje?\n\n` +
                                `1️⃣ 📝 *FAZER UM PEDIDO*\n` +
                                `   ↳ Solicitar orçamento/compra\n\n` +
                                `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                                `   ↳ Consultar status do pedido\n\n` +
                                `3️⃣ 📋 *CONSULTAR PRODUTOS/PREÇOS*\n` +
                                `   ↳ Ver catálogo completo\n\n` +
                                `🔢 *Digite o número da opção desejada:*`
                        })

                    default:
                        return sock.sendMessage(from, {
                            text: '❌ Opção inválida. Digite 1, 2, 3 ou MENU.'
                        })
                }
            }

            /* =========================
               FLUXO: FAZER PEDIDO
            ========================= */
            if (estado.etapa === 'fazer_pedido') {
                if (texto.toUpperCase() === 'MENU') {
                    estado.etapa = 'menu_principal'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from, {
                        text: `📋 *MENU PRINCIPAL - CRIEARTES*\n\n` +
                            `Como podemos ajudar você hoje?\n\n` +
                            `1️⃣ 📝 *FAZER UM PEDIDO*\n` +
                            `   ↳ Solicitar orçamento/compra\n\n` +
                            `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                            `   ↳ Consultar status do pedido\n\n` +
                            `3️⃣ 📋 *CONSULTAR PRODUTOS/PREÇOS*\n` +
                            `   ↳ Ver catálogo completo\n\n` +
                            `🔢 *Digite o número da opção desejada:*`
                    })
                }

                // Salvar pedido
                const pedidos = getJSONFile(PEDIDOS_FILE, [])
                const numeroPedido = gerarNumeroPedido()

                pedidos.push({
                    id: numeroPedido,
                    cliente: from,
                    mensagem: texto,
                    data: new Date().toISOString(),
                    atendente: ATENDENTES.orcamento,
                    status: 'orcamento_solicitado'
                })

                saveJSONFile(PEDIDOS_FILE, pedidos)

                console.log(`✅ Pedido salvo: ${numeroPedido} para ${from}`)

                return sock.sendMessage(from, {
                    text: `✅ *MENSAGEM ENCAMINHADA!*\n\n` +
                        `*Número do seu pedido:* ${numeroPedido}\n\n` +
                        `Sua solicitação foi enviada para o atendente *${ATENDENTES.orcamento}*.\n\n` +
                        `📞 Ele entrará em contato em breve para:\n` +
                        `• Confirmar detalhes do pedido\n` +
                        `• Enviar orçamento\n` +
                        `• Informar prazo de entrega\n\n` +
                        `Agradecemos sua preferência! 💙\n\n` +
                        `🏠 Digite *MENU* para voltar às opções principais.`
                })
            }

            /* =========================
               FLUXO: ACOMPANHAR PEDIDO
            ========================= */
            if (estado.etapa === 'acompanhar_pedido') {
                if (texto.toUpperCase() === 'MENU') {
                    estado.etapa = 'menu_principal'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from, {
                        text: `📋 *MENU PRINCIPAL - CRIEARTES*\n\n` +
                            `Como podemos ajudar você hoje?\n\n` +
                            `1️⃣ 📝 *FAZER UM PEDIDO*\n` +
                            `   ↳ Solicitar orçamento/compra\n\n` +
                            `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                            `   ↳ Consultar status do pedido\n\n` +
                            `3️⃣ 📋 *CONSULTAR PRODUTOS/PREÇOS*\n` +
                            `   ↳ Ver catálogo completo\n\n` +
                            `🔢 *Digite o número da opção desejada:*`
                    })
                }

                // Registrar solicitação de acompanhamento
                const pedidos = getJSONFile(PEDIDOS_FILE, [])
                pedidos.push({
                    id: `CONSULTA-${Date.now()}`,
                    cliente: from,
                    tipo: 'acompanhamento',
                    mensagem: texto,
                    data: new Date().toISOString(),
                    atendente: ATENDENTES.acompanhamento
                })

                saveJSONFile(PEDIDOS_FILE, pedidos)

                return sock.sendMessage(from, {
                    text: `✅ *SOLICITAÇÃO ENCAMINHADA!*\n\n` +
                        `Sua mensagem foi enviada para a atendente *${ATENDENTES.acompanhamento}*.\n\n` +
                        `📞 Ela entrará em contato em breve para:\n` +
                        `• Consultar seu pedido\n` +
                        `• Informar status atual\n` +
                        `• Tirar suas dúvidas\n\n` +
                        `Agradecemos sua paciência! 💙\n\n` +
                        `🏠 Digite *MENU* para voltar às opções principais.`
                })
            }

            /* =========================
               FLUXO: CONSULTAR PRODUTOS
            ========================= */
            if (estado.etapa === 'consultar_produtos') {
                if (texto.toUpperCase() === 'MENU' || texto.toUpperCase() === 'VOLTAR') {
                    estado.etapa = 'menu_principal'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from, {
                        text: `📋 *MENU PRINCIPAL - CRIEARTES*\n\n` +
                            `Como podemos ajudar você hoje?\n\n` +
                            `1️⃣ 📝 *FAZER UM PEDIDO*\n` +
                            `   ↳ Solicitar orçamento/compra\n\n` +
                            `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                            `   ↳ Consultar status do pedido\n\n` +
                            `3️⃣ 📋 *CONSULTAR PRODUTOS/PREÇOS*\n` +
                            `   ↳ Ver catálogo completo\n\n` +
                            `🔢 *Digite o número da opção desejada:*`
                    })
                }

                // Manter na página do catálogo
                return sock.sendMessage(from, {
                    text: `${textoCatalogoPorCategoria()}\n\n` +
                        `Para fazer um pedido ou tirar dúvidas:\n` +
                        `Digite *VOLTAR* e escolha a opção 1️⃣\n\n` +
                        `🏠 Digite *MENU* para menu principal`
                })
            }

            /* =========================
               MENSAGEM NÃO RECONHECIDA
            ========================= */
            return sock.sendMessage(from, {
                text: `🤔 *Não entendi sua mensagem*\n\n` +
                    `Por favor, digite:\n\n` +
                    `📋 *MENU* para ver o menu principal\n\n` +
                    `Ou aguarde que um atendente responderá em breve!`
            })

        } catch (error) {
            console.error('❌ ERRO:', error)
        }
    })

    // Limpeza automática de sessões
    setInterval(() => {
        try {
            const estados = getJSONFile(ESTADOS_FILE)
            const agora = new Date()
            let modificado = false

            for (const [numero, estado] of Object.entries(estados)) {
                const ultimaInteracao = new Date(estado.ultimaInteracao)
                const horasInativo = (agora - ultimaInteracao) / (1000 * 60 * 60)

                if (horasInativo > 48) {
                    delete estados[numero]
                    modificado = true
                }
            }

            if (modificado) {
                saveJSONFile(ESTADOS_FILE, estados)
            }
        } catch (error) {
            console.error('Erro na limpeza:', error)
        }
    }, 3600000)
}

// Iniciar o bot
startBot()
