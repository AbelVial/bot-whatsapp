const NUMERO_TESTE = '5527997600138@s.whatsapp.net'

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason
} from '@whiskeysockets/baileys'
import P from 'pino'
import fs from 'fs'
import qrcode from 'qrcode-terminal'
import {
    catalogo,
    textoCatalogoPorCategoria,
    getDetalhesProduto,
    getProdutoPorNumero
} from './catalogo.js'

/* =========================
   CONFIGURAÇÕES AVANÇADAS
========================= */

const ESTADOS_FILE = './estados.json'
const PEDIDOS_FILE = './pedidos.json'
const MENSAGENS_FORA_HORARIO = './mensagens_fora_horario.json'

const HORARIO_ATENDIMENTO = {
    0: { inicio: '09:00', fim: '00:00' }, // Domingo (fechado)
    1: { inicio: '09:00', fim: '18:00' }, // Segunda
    2: { inicio: '09:00', fim: '18:00' }, // Terça
    3: { inicio: '09:00', fim: '18:00' }, // Quarta
    4: { inicio: '09:00', fim: '18:00' }, // Quinta
    5: { inicio: '09:00', fim: '18:00' }, // Sexta
    6: { inicio: '09:00', fim: '13:00' }  // Sábado
}

const ATENDENTES = {
    orcamento: process.env.ATENDENTE_ORCAMENTO,
    acompanhamento: process.env.ATENDENTE_ACOMPANHAMENTO,
    geral: process.env.ATENDENTE_GERAL,
    whatsapp: process.env.WHATSAPP_CONTATO
}

/* =========================
   FUNÇÕES UTILITÁRIAS MELHORADAS
========================= */

function dentroHorario() {
    const agora = new Date()
    const dia = agora.getDay()
    const horarioDia = HORARIO_ATENDIMENTO[dia]

    // Dia não atende
    if (!horarioDia) return false

    const [hIni, mIni] = horarioDia.inicio.split(':').map(Number)
    const [hFim, mFim] = horarioDia.fim.split(':').map(Number)

    const minutosAtual = agora.getHours() * 60 + agora.getMinutes()
    const minutosInicio = hIni * 60 + mIni
    const minutosFim = hFim * 60 + mFim

    return minutosAtual >= minutosInicio && minutosAtual < minutosFim
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

function textoCatalogo(porCategoria = true) {
    if (porCategoria) {
        return textoCatalogoPorCategoria()
    }

    let texto = '📦 *CATÁLOGO DE PRODUTOS*\n\n'
    let i = 1
    for (const produto in catalogo) {
        texto += `${i}️⃣ *${produto}* — R$ ${catalogo[produto].toFixed(2)}\n`
        i++
    }
    texto += `\n📝 Digite o *NÚMERO* do produto desejado\n`
    texto += `🔄 Digite *VOLTAR* para menu anterior\n`
    texto += `🏠 Digite *MENU* para menu principal`
    return texto
}

function resumoCarrinho(carrinho) {
    if (!carrinho || carrinho.length === 0) {
        return '🛒 *Seu carrinho está vazio*'
    }

    let total = 0
    let texto = '🧾 *RESUMO DO PEDIDO*\n'
    texto += '══════════════════════════\n\n'

    carrinho.forEach((item, i) => {
        const subtotal = item.preco * item.qtd
        total += subtotal
        texto += `${i + 1}. *${item.nome}*\n`
        texto += `   ${item.qtd} × R$ ${item.preco.toFixed(2)} = R$ ${subtotal.toFixed(2)}\n\n`
    })

    texto += '══════════════════════════\n'
    texto += `💰 *TOTAL: R$ ${total.toFixed(2)}*\n`
    return texto
}

function formatarHorarioAtendimento(detalhado = false) {
    const diasMap = {
        0: 'Domingo',
        1: 'Segunda-feira',
        2: 'Terça-feira',
        3: 'Quarta-feira',
        4: 'Quinta-feira',
        5: 'Sexta-feira',
        6: 'Sábado'
    }

    let texto = ''

    for (const dia in HORARIO_ATENDIMENTO) {
        const config = HORARIO_ATENDIMENTO[dia]
        if (!config) {
            texto += `${diasMap[dia]}: Fechado\n`
        } else {
            texto += `${diasMap[dia]}: ${config.inicio} às ${config.fim}\n`
        }
    }

    return texto.trim()
}

function gerarNumeroPedido() {
    const data = new Date()
    const ano = data.getFullYear().toString().slice(-2)
    const mes = (data.getMonth() + 1).toString().padStart(2, '0')
    const dia = data.getDate().toString().padStart(2, '0')
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `PED${ano}${mes}${dia}${random}`
}

function salvarPedido(from, carrinho, nomeCliente = '') {
    try {
        const pedidos = getJSONFile(PEDIDOS_FILE, [])
        const numeroPedido = gerarNumeroPedido()

        const pedido = {
            id: numeroPedido,
            cliente: from,
            nomeCliente,
            data: new Date().toISOString(),
            itens: carrinho,
            total: carrinho.reduce((sum, item) => sum + (item.preco * item.qtd), 0),
            status: 'orcamento_solicitado',
            atendente: ATENDENTES.orcamento
        }

        pedidos.push(pedido)
        saveJSONFile(PEDIDOS_FILE, pedidos)

        console.log(`✅ Pedido salvo: ${numeroPedido} para ${from}`)
        return numeroPedido
    } catch (error) {
        console.error('Erro ao salvar pedido:', error)
        return null
    }
}

function buscarPedido(numeroPedido) {
    try {
        const pedidos = getJSONFile(PEDIDOS_FILE, [])
        return pedidos.find(p => p.id === numeroPedido.toUpperCase())
    } catch (error) {
        console.error('Erro ao buscar pedido:', error)
        return null
    }
}

function getSaudacao() {
    const hora = new Date().getHours()
    if (hora < 12) return '☀️ Bom dia! '
    if (hora < 18) return '🌤️ Boa tarde! '
    return '🌙 Boa noite! '
}

/* =========================
   BOT PROFISSIONAL
========================= */

async function startBot() {
    console.log('🤖 INICIANDO BOT DE ATENDIMENTO CRIEARTES\n')

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState('auth')

    const sock = makeWASocket({
        logger: P({
            level: 'silent'
        }),
        auth: state,
        printQRInTerminal: true,
        browser: ["CrieArtes Bot", "Chrome", "3.0"],
        markOnlineOnConnect: true
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({
        connection,
        qr,
        lastDisconnect
    }) => {
        if (qr) {
            console.log('\n' + '═'.repeat(50))
            console.log('📱 QR CODE PARA CONEXÃO:')
            console.log('═'.repeat(50) + '\n')
            qrcode.generate(qr, {
                small: true
            })
            console.log('\n⚠️  Escaneie este QR Code no WhatsApp Web')
            console.log('⏰  Válido por 60 segundos\n')
        }

        if (connection === 'close') {
            const isLoggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut

            if (!isLoggedOut) {
                console.log('🔌 Conexão perdida. Reconectando em 5 segundos...')
                setTimeout(() => startBot(), 5000)
            } else {
                console.log('❌ Sessão finalizada. Escaneie o QR Code novamente.')
                rmSync('auth', { recursive: true, force: true }) // opcional: apagar pasta auth
            }
            
            if (shouldReconnect) {
                console.log('🔌 Conexão perdida. Reconectando em 5 segundos...')
                setTimeout(() => {
                    console.log('🔄 Tentando reconectar...')
                    startBot()
                }, 5000)
            } else {
                console.log('❌ Sessão finalizada. Exclua a pasta "auth" e reinicie.')
            }
        }

        if (connection === 'open') {
            console.log('✅ CONECTADO COM SUCESSO!')
            console.log('🎨 Bot CrieArtes pronto para atendimento')
            console.log('🕘 Horário atual:', new Date().toLocaleString('pt-BR'))
            console.log('📊 Status:', dentroHorario() ? '🟢 DENTRO DO HORÁRIO' : '🔴 FORA DO HORÁRIO')
        }
    })

    sock.ev.on('messages.upsert', async ({
        messages
    }) => {
        try {
            const msg = messages[0]
            if (!msg.message || msg.key.fromMe) return

            const from = msg.key.remoteJid
            
            // =========================
            // BOT ATIVO APENAS PARA TESTE
            // =========================
            if (from !== NUMERO_TESTE) {
                // Não responde, não cria estado, não executa menu
                return
            }
            
            const texto = msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.buttonsResponseMessage?.selectedButtonId ||
                ''

            const estados = getJSONFile(ESTADOS_FILE)

            if (!estados[from]) {
                estados[from] = {
                    etapa: 'inicio',
                    carrinho: [],
                    atendente: null,
                    ultimaInteracao: new Date().toISOString(),
                    nomeCliente: '',
                    pedidos: [],
                    sessaoIniciada: new Date().toISOString()
                }
            }

            const estado = estados[from]
            estado.ultimaInteracao = new Date().toISOString()

            // Log da interação
            console.log(`\n📨 [${new Date().toLocaleTimeString('pt-BR')}] ${from.split('@')[0]}: ${texto.substring(0, 50)}...`)
            console.log(`   Etapa: ${estado.etapa}, Carrinho: ${estado.carrinho.length} itens`)

            /* =========================
               COMANDOS INTERNOS (ADMIN)
            ========================= */

            if (texto.startsWith('/admin ')) {
                const comando = texto.replace('/admin ', '').trim()

                switch (comando) {
                    case 'status':
                        const horarioStatus = dentroHorario() ? '🟢 DENTRO DO HORÁRIO' : '🔴 FORA DO HORÁRIO'
                        const clientesAtivos = Object.keys(estados).length

                        return sock.sendMessage(from, {
                            text: `📊 *STATUS DO SISTEMA*\n\n` +
                                `Horário: ${horarioStatus}\n` +
                                `Clientes ativos: ${clientesAtivos}\n` +
                                `Hora atual: ${new Date().toLocaleString('pt-BR')}\n` +
                                `Pedidos registrados: ${getJSONFile(PEDIDOS_FILE).length}\n` +
                                `Mensagens fora horário: ${getJSONFile(MENSAGENS_FORA_HORARIO).length}`
                        })

                    case 'clientes':
                        const listaClientes = Object.entries(estados)
                            .slice(0, 10)
                            .map(([cliente, info]) =>
                                `• ${cliente.split('@')[0]}\n  Etapa: ${info.etapa}\n  Itens: ${info.carrinho.length}`
                            ).join('\n\n')

                        return sock.sendMessage(from, {
                            text: `👥 *ÚLTIMOS 10 CLIENTES*\n\n${listaClientes || 'Nenhum cliente ativo'}`
                        })

                    case 'catalogo':
                        return sock.sendMessage(from, {
                            text: `📦 *CATÁLOGO (LOG)*\n\n${textoCatalogo(false)}`
                        })
                }
            }

            /* =========================
               COMANDOS GLOBAIS (funcionam em qualquer etapa)
            ========================= */

            // Verificar comandos globais primeiro
            if (texto.toUpperCase() === 'MENU') {
                estado.etapa = 'menu'
                saveJSONFile(ESTADOS_FILE, estados)
                return sock.sendMessage(from, {
                    text: `📋 *MENU PRINCIPAL - CRIEARTES*\n\n` +
                          `Como podemos ajudar você hoje? 🤔\n\n` +
                          `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                          `   ↳ Solicite um orçamento personalizado\n\n` +
                          `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                          `   ↳ Consulte o status do seu pedido\n\n` +
                          `3️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                          `   ↳ Atendimento humano personalizado\n\n` +
                          `🔢 *Digite o número da opção desejada:*`
                })
            }

            if (texto.toUpperCase() === 'ATENDENTE' || texto.toUpperCase() === 'AJUDA') {
                estado.etapa = 'atendente_humano'
                saveJSONFile(ESTADOS_FILE, estados)
                return sock.sendMessage(from, {
                    text: `👤 *ATENDIMENTO HUMANO*\n\n` +
                        `Você será atendido por *${ATENDENTES.geral}* em instantes.\n\n` +
                        `Por favor, descreva sua necessidade:`
                })
            }

            if (texto.toUpperCase() === 'CARRINHO') {
                if (estado.carrinho.length === 0) {
                    return sock.sendMessage(from, {
                        text: `🛒 *SEU CARRINHO ESTÁ VAZIO*\n\n` +
                            `Para adicionar produtos:\n` +
                            `1. Digite 1 para fazer orçamento\n` +
                            `2. Escolha os produtos desejados\n` +
                            `3. Defina as quantidades\n\n` +
                            `🔄 Digite *VOLTAR* para continuar`
                    })
                }

                estado.etapa = 'carrinho'
                saveJSONFile(ESTADOS_FILE, estados)
                return sock.sendMessage(from, {
                    text: `${resumoCarrinho(estado.carrinho)}\n\n` +
                        `📋 *OPÇÕES DO CARRINHO:*\n\n` +
                        `1️⃣ ➕ ADICIONAR MAIS PRODUTOS\n` +
                        `2️⃣ ✏️ EDITAR/REMOVER ITENS\n` +
                        `3️⃣ 💰 FINALIZAR ORÇAMENTO\n` +
                        `4️⃣ 🗑️ ESVAZIAR CARRINHO\n` +
                        `5️⃣ 🏠 VOLTAR AO MENU\n\n` +
                        `🔢 Digite o número da opção:`
                })
            }

            /* =========================
               FORA DO HORÁRIO - MELHORADO
            ========================= */

            const horarioAtual = dentroHorario()

            if (!horarioAtual && estado.etapa === 'inicio') {

                const mensagens = getJSONFile(MENSAGENS_FORA_HORARIO, [])
                mensagens.push({
                    cliente: from,
                    mensagem: texto,
                    data: new Date().toISOString(),
                    respondido: false
                })
                saveJSONFile(MENSAGENS_FORA_HORARIO, mensagens)
            
                // 🔑 MUDA O ESTADO AQUI
                estado.etapa = 'fora_horario_mensagem'
                saveJSONFile(ESTADOS_FILE, estados)
            
                await sock.sendMessage(from, {
                    text: `⏰ *ATENDIMENTO FORA DO HORÁRIO*\n\n` +
                        `Olá! No momento estamos fora do nosso horário de funcionamento.\n\n` +
                        `📅 *Horários de atendimento:*\n` +
                        `${formatarHorarioAtendimento()}\n\n` +
                        `✅ Deixe uma mensagem. Nossa equipe responderá assim que possível.\n\n` +
                        `Agradecemos sua compreensão! 💙`
                })
                return
            }

            if (!horarioAtual && estado.etapa === 'fora_horario_mensagem') {
                // Apenas salva, NÃO responde
                const mensagens = getJSONFile(MENSAGENS_FORA_HORARIO, [])
                mensagens.push({
                    cliente: from,
                    mensagem: texto,
                    data: new Date().toISOString(),
                    respondido: false
                })
                saveJSONFile(MENSAGENS_FORA_HORARIO, mensagens)
            
                console.log(`📩 Mensagem fora do horário salva de ${from}`)
                return
            }

            /* =========================
               MENU FORA DO HORÁRIO - MELHORADO
            ========================= */

            if (estado.etapa === 'menu_fora_horario') {
                switch (texto) {
                    case '1':
                        estado.etapa = 'catalogo_fora_horario'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `${textoCatalogo()}\n\n` +
                                `⚠️ *Importante:* Para solicitar orçamento, entre em contato diretamente pelo WhatsApp durante nosso horário comercial.`
                        })

                    case '2':
                        return sock.sendMessage(from, {
                            text: `📸 *NOSSO INSTAGRAM*\n\n` +
                                `Acompanhe nosso trabalho, novidades e promoções:\n\n` +
                                `👉 https://www.instagram.com/cacrieartes/\n\n` +
                                `*Destaques:*\n` +
                                `• Trabalhos personalizados\n` +
                                `• Novos produtos\n` +
                                `• Promoções especiais\n` +
                                `• Dicas e inspirações\n\n` +
                                `🏠 Digite *MENU* para voltar às opções`
                        })

                    case '3':
                        return sock.sendMessage(from, {
                            text: `📞 *CONTATO DIRETO*\n\n` +
                                `Para atendimento imediato, entre em contato diretamente:\n\n` +
                                `👤 *${ATENDENTES.geral}*\n` +
                                `📱 ${ATENDENTES.whatsapp}\n\n` +
                                `*Horário de resposta:*\n` +
                                `${formatarHorarioAtendimento()}\n\n` +
                                `🏠 Digite *MENU* para voltar às opções`
                        })

                    case 'MENU':
                    case 'menu':
                        estado.etapa = 'menu_fora_horario'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `🎯 *OPÇÕES DISPONÍVEIS:*\n\n` +
                                `1️⃣ 📋 VER CATÁLOGO DE PRODUTOS\n` +
                                `2️⃣ 📸 VISITAR NOSSO INSTAGRAM\n` +
                                `3️⃣ 📞 FALAR COM ATENDENTE AGORA\n` +
                                `Digite o número da opção desejada:`
                        })

                    default:
                        return sock.sendMessage(from, {
                            text: '❌ *Opção inválida*\n\nDigite 1, 2, 3, 4 ou MENU para voltar às opções.'
                        })
                }
            }

            /* =========================
               CATÁLOGO FORA DO HORÁRIO
            ========================= */

            if (estado.etapa === 'catalogo_fora_horario') {
                if (texto.toUpperCase() === 'VOLTAR' || texto.toUpperCase() === 'MENU') {
                    estado.etapa = 'menu_fora_horario'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from, {
                        text: `🎯 *OPÇÕES DISPONÍVEIS:*\n\n` +
                            `1️⃣ 📋 VER CATÁLOGO DE PRODUTOS\n` +
                            `2️⃣ 📸 VISITAR NOSSO INSTAGRAM\n` +
                            `3️⃣ 📞 FALAR COM ATENDENTE AGORA\n` +
                            `Digite o número da opção desejada:`
                    })
                }

                return sock.sendMessage(from, {
                    text: `⚠️ *ATENÇÃO - FORA DO HORÁRIO*\n\n` +
                        `Você pode visualizar nossos produtos, mas para solicitar orçamento, entre em contato diretamente:\n\n` +
                        `📱 ${ATENDENTES.whatsapp}\n\n` +
                        `*Horário de atendimento:*\n` +
                        `${formatarHorarioAtendimento()}\n\n` +
                        `🔄 Digite *VOLTAR* para retornar ao menu`
                })
            }

            /* =========================
               FLUXO DENTRO DO HORÁRIO - MELHORADO
            ========================= */

            if (estado.etapa === 'inicio') {
                const saudacao = getSaudacao()

                await sock.sendMessage(from, {
                    text: `${saudacao} *BEM-VINDO(A) À CRIEARTES PERSONALIZADOS!* 🎨\n\n` +
                        `Somos especialistas em transformar suas ideias em produtos únicos e personalizados com muita qualidade e criatividade! 💙\n\n` +
                        `📍 *Nossos canais oficiais:*\n` +
                        `📸 Instagram: @cacrieartes\n` +
                        `📦 Catálogo completo: https://wa.me/c/5527999975339\n\n` +
                        `🕘 *Horário de atendimento:*\n` +
                        `${formatarHorarioAtendimento(true)}\n\n` +
                        `*Como funciona:*\n` +
                        `1. Escolha seus produtos\n` +
                        `2. Faça seu orçamento\n` +
                        `3. Aprove sua arte\n` +
                        `4. Receba com qualidade!`
                })

                estado.etapa = 'menu'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `📋 *MENU PRINCIPAL - CRIEARTES*\n\n` +
                              `Como podemos ajudar você hoje? 🤔\n\n` +
                              `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                              `   ↳ Solicite um orçamento personalizado\n\n` +
                              `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                              `   ↳ Consulte o status do seu pedido\n\n` +
                              `3️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                              `   ↳ Atendimento humano personalizado\n\n` +
                              `🔢 *Digite o número da opção desejada:*`
                })
            }

            /* =========================
               MENU PRINCIPAL - MELHORADO
            ========================= */

            if (estado.etapa === 'menu') {
                switch (texto) {
                    case '1':
                        estado.etapa = 'produto'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `${textoCatalogo()}\n\n` +
                                `👤 *Atendente responsável:* ${ATENDENTES.orcamento}\n` +
                                `📞 *Dúvidas?* Digite ATENDENTE a qualquer momento`
                        })

                    case '2':
                        estado.etapa = 'acompanhar_pedido'
                        saveJSONFile(ESTADOS_FILE, estados)

                        // Verificar se cliente tem pedidos anteriores
                        const pedidosCliente = getJSONFile(PEDIDOS_FILE, [])
                            .filter(p => p.cliente === from)
                            .slice(0, 3)

                        let textoPedidos = ''
                        if (pedidosCliente.length > 0) {
                            textoPedidos = `\n📋 *Seus últimos pedidos:*\n`
                            pedidosCliente.forEach(pedido => {
                                textoPedidos += `• ${pedido.id} - ${new Date(pedido.data).toLocaleDateString('pt-BR')}\n`
                            })
                            textoPedidos += `\nDigite o número do pedido ou *NOVO* para novo acompanhamento:`
                        }

                        return sock.sendMessage(from, {
                            text: `📦 *ACOMPANHAMENTO DE PEDIDO*\n\n` +
                                `Para consultar o status do seu pedido, informe:\n\n` +
                                `🔢 *Número do pedido* (ex: PED240101001)\n` +
                                `📧 *E-mail utilizado na compra*\n` +
                                `📱 *Seu telefone*\n\n` +
                                `👤 *Atendente:* ${ATENDENTES.acompanhamento}\n` +
                                `${textoPedidos}\n\n` +
                                `🔄 Digite *VOLTAR* para menu anterior`
                        })

                    case '3':
                        estado.etapa = 'atendente_humano'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `👤 *ATENDIMENTO HUMANO - ${ATENDENTES.geral}*\n\n` +
                                `Em instantes você será atendido(a) por *${ATENDENTES.geral}*.\n\n` +
                                `📝 *Por favor, descreva sua necessidade:*\n` +
                                `• Dúvidas sobre produtos\n` +
                                `• Problemas com pedido\n` +
                                `• Solicitações especiais\n` +
                                `• Outras informações\n\n` +
                                `🔄 Digite *VOLTAR* para cancelar`
                        })

                    default:
                        return sock.sendMessage(from, {
                            text: '❌ *Opção inválida*\n\n Menu ou ATENDENTE para falar com um atendente.'
                        })
                }
            }

            /* =========================
               COMANDO VOLTAR GLOBAL (funciona em qualquer etapa)
            ========================= */

            if (texto.toUpperCase() === 'VOLTAR') {
                // Lógica para voltar à etapa anterior baseada na etapa atual
                switch (estado.etapa) {
                    case 'produto':
                    case 'detalhes_produto':
                    case 'carrinho':
                    case 'editar_carrinho':
                    case 'confirmar_orcamento':
                        estado.etapa = 'menu'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `📋 *MENU PRINCIPAL*\n\n` +
                                `Como podemos ajudar você hoje? 🤔\n\n` +
                                `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                                `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                                `3️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                                `🔢 Digite o número da opção:`
                        })

                    case 'acompanhar_pedido':
                    case 'atendente_humano':
                        estado.etapa = 'menu'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `📋 *MENU PRINCIPAL*\n\n` +
                                `Como podemos ajudar você hoje? 🤔\n\n` +
                                `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                                `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                                `3️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                                `🔢 Digite o número da opção:`
                        })

                    case 'menu_fora_horario':
                    case 'catalogo_fora_horario':
                        estado.etapa = 'menu_fora_horario'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `🎯 *OPÇÕES DISPONÍVEIS:*\n\n` +
                                `1️⃣ 📋 VER CATÁLOGO DE PRODUTOS\n` +
                                `2️⃣ 📸 VISITAR NOSSO INSTAGRAM\n` +
                                `3️⃣ 📞 FALAR COM ATENDENTE AGORA\n` +
                                `Digite o número da opção desejada:`
                        })

                    default:
                        // Para etapas que não têm um "voltar" específico, vai para o menu
                        estado.etapa = 'menu'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `📋 *MENU PRINCIPAL*\n\n` +
                                `Como podemos ajudar você hoje? 🤔\n\n` +
                                `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                                `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                                `3️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                                `🔢 Digite o número da opção:`
                        })
                }
            }

            /* =========================
               ACOMPANHAR PEDIDO - MELHORADO
            ========================= */

            if (estado.etapa === 'acompanhar_pedido') {
                if (texto.toUpperCase() === 'NOVO') {
                    return sock.sendMessage(from, {
                        text: `📝 *NOVO ACOMPANHAMENTO*\n\n` +
                            `Por favor, informe:\n\n` +
                            `🔢 *Número do pedido* OU\n` +
                            `📧 *E-mail utilizado* OU\n` +
                            `📱 *Seu telefone*\n\n` +
                            `*Exemplo:* PED240101001\n\n` +
                            `🔄 Digite *VOLTAR* para cancelar`
                    })
                }

                // Buscar pedido
                const pedido = buscarPedido(texto)

                if (pedido) {
                    let statusEmoji = '🟡'
                    let statusTexto = 'Em análise'

                    switch (pedido.status) {
                        case 'aprovado':
                            statusEmoji = '🟢';
                            statusTexto = 'Aprovado';
                            break
                        case 'produção':
                            statusEmoji = '🔧';
                            statusTexto = 'Em produção';
                            break
                        case 'pronto':
                            statusEmoji = '✅';
                            statusTexto = 'Pronto para envio';
                            break
                        case 'enviado':
                            statusEmoji = '🚚';
                            statusTexto = 'Enviado';
                            break
                        case 'entregue':
                            statusEmoji = '📦';
                            statusTexto = 'Entregue';
                            break
                    }

                    return sock.sendMessage(from, {
                        text: `📦 *PEDIDO ${pedido.id}*\n\n` +
                            `📅 Data: ${new Date(pedido.data).toLocaleDateString('pt-BR')}\n` +
                            `📊 Status: ${statusEmoji} ${statusTexto}\n` +
                            `💰 Valor: R$ ${pedido.total.toFixed(2)}\n` +
                            `👤 Atendente: ${pedido.atendente}\n\n` +
                            `📋 *Itens:*\n${pedido.itens.map(item => 
                                  `• ${item.qtd}x ${item.nome}`
                              ).join('\n')}\n\n` +
                            `ℹ️ Para mais detalhes, fale com *${ATENDENTES.acompanhamento}*`
                    })
                } else {
                    // Se não encontrou, encaminha para atendente
                    console.log(`🔍 Pedido não encontrado: ${texto} para ${from}`)

                    return sock.sendMessage(from, {
                        text: `🔍 *PEDIDO NÃO ENCONTRADO*\n\n` +
                            `Não localizamos o pedido "${texto}" em nosso sistema.\n\n` +
                            `📞 *${ATENDENTES.acompanhamento}* já foi notificado(a) e entrará em contato em instantes para ajudá-lo(a).\n\n` +
                            `Agradecemos sua paciência! 💙`
                    })
                }
            }

            /* =========================
               ATENDENTE HUMANO
            ========================= */

            if (estado.etapa === 'atendente_humano') {
                // Encaminha para o atendente humano
                console.log(`👤 Cliente ${from} precisa de atendimento: ${texto}`)

                return sock.sendMessage(from, {
                    text: `✅ *SOLICITAÇÃO ENCAMINHADA!*\n\n` +
                        `Sua mensagem foi enviada para o atendente *${ATENDENTES.geral}*:\n\n` +
                        `"${texto}"\n\n` +
                        `📞 Ele entrará em contato em instantes para atendê-lo(a).\n\n` +
                        `Agradecemos sua paciência! 💙`
                })
            }

            /* =========================
               PRODUTO (ORÇAMENTO) - MELHORADO
            ========================= */

            if (estado.etapa === 'produto') {
                if (texto.toUpperCase() === 'CATEGORIAS') {
                    return sock.sendMessage(from, {
                        text: textoCatalogo(true)
                    })
                }

                const produtoSelecionado = getProdutoPorNumero(texto)

                if (!produtoSelecionado) {
                    return sock.sendMessage(from, {
                        text: '❌ Produto inválido. Digite um número da lista, CATEGORIAS, VOLTAR ou MENU.'
                    })
                }

                estado.produtoSelecionado = produtoSelecionado
                estado.etapa = 'detalhes_produto'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `${getDetalhesProduto(produtoSelecionado)}\n\n` +
                        `Quantas unidades você deseja?\n\n` +
                        `Digite a quantidade ou:\n` +
                        `🔄 *VOLTAR* para escolher outro produto\n` +
                        `🏠 *MENU* para menu principal`
                })
            }

            /* =========================
               DETALHES DO PRODUTO (NOVA ETAPA)
            ========================= */

            if (estado.etapa === 'detalhes_produto') {
                const qtd = parseInt(texto)
                if (isNaN(qtd) || qtd <= 0 || qtd > 100) {
                    return sock.sendMessage(from, {
                        text: '❌ Quantidade inválida. Digite um número entre 1 e 100.'
                    })
                }

                estado.carrinho.push({
                    nome: estado.produtoSelecionado,
                    preco: catalogo[estado.produtoSelecionado],
                    qtd
                })

                estado.etapa = 'carrinho'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `✅ *Produto adicionado ao carrinho!*\n\n` +
                        `${resumoCarrinho(estado.carrinho)}\n\n` +
                        `📋 *O QUE DESEJA FAZER AGORA?*\n\n` +
                        `1️⃣ ➕ ADICIONAR MAIS PRODUTOS\n` +
                        `2️⃣ ✏️ EDITAR/REMOVER ITENS\n` +
                        `3️⃣ 💰 FINALIZAR ORÇAMENTO\n` +
                        `4️⃣ 🗑️ ESVAZIAR CARRINHO\n` +
                        `5️⃣ 🏠 VOLTAR AO MENU\n\n` +
                        `🔢 Digite o número da opção:`
                })
            }

            /* =========================
               CARRINHO - MELHORADO
            ========================= */

            if (estado.etapa === 'carrinho') {
                switch (texto) {
                    case '1':
                        estado.etapa = 'produto'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: textoCatalogo(true)
                        })

                    case '2':
                        if (estado.carrinho.length === 0) {
                            estado.etapa = 'carrinho'
                            saveJSONFile(ESTADOS_FILE, estados)
                            return sock.sendMessage(from, {
                                text: '🛒 Seu carrinho está vazio. Nada para remover.'
                            })
                        }

                        estado.etapa = 'editar_carrinho'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `${resumoCarrinho(estado.carrinho)}\n\n` +
                                `Digite o *NÚMERO do item* que deseja remover:\n` +
                                `(Exemplo: digite "1" para remover o primeiro item)\n\n` +
                                `🔄 Digite *VOLTAR* para cancelar`
                        })

                    case '3':
                        if (estado.carrinho.length === 0) {
                            return sock.sendMessage(from, {
                                text: '🛒 Seu carrinho está vazio. Adicione produtos antes de finalizar.'
                            })
                        }

                        estado.etapa = 'confirmar_orcamento'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `${resumoCarrinho(estado.carrinho)}\n\n` +
                                `✅ *CONFIRMAR ORÇAMENTO*\n\n` +
                                `Digite *SIM* para confirmar e enviar para o atendente *${ATENDENTES.orcamento}*\n` +
                                `Digite *NÃO* para continuar editando\n` +
                                `🔄 Digite *VOLTAR* para retornar às opções do carrinho`
                        })

                    case '4':
                        estado.carrinho = []
                        estado.etapa = 'menu'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `🗑️ *Carrinho esvaziado com sucesso!*\n\n` +
                                `📋 *MENU PRINCIPAL*\n\n` +
                                `Como podemos ajudar você hoje? 🤔\n\n` +
                                `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                                `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                                `3️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                                `🔢 Digite o número da opção:`
                        })

                    case '5':
                        estado.etapa = 'menu'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `📋 *MENU PRINCIPAL*\n\n` +
                                `Como podemos ajudar você hoje? 🤔\n\n` +
                                `1️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                                `2️⃣ 📦 *ACOMPANHAR PEDIDO*\n` +
                                `3️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                                `🔢 Digite o número da opção:`
                        })

                    default:
                        return sock.sendMessage(from, {
                            text: '❌ Opção inválida. Digite 1, 2, 3, 4 ou 5.'
                        })
                }
            }

            /* =========================
               EDITAR CARRINHO
            ========================= */

            if (estado.etapa === 'editar_carrinho') {
                const i = parseInt(texto) - 1
                if (!estado.carrinho[i]) {
                    return sock.sendMessage(from, {
                        text: '❌ Item inválido. Digite um número da lista.'
                    })
                }

                const itemRemovido = estado.carrinho[i].nome
                estado.carrinho.splice(i, 1)
                estado.etapa = 'carrinho'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `🗑️ *ITEM REMOVIDO:* ${itemRemovido}\n\n` +
                        `${resumoCarrinho(estado.carrinho)}\n\n` +
                        `📋 *OPÇÕES DO CARRINHO:*\n\n` +
                        `1️⃣ ➕ ADICIONAR MAIS PRODUTOS\n` +
                        `2️⃣ ✏️ EDITAR/REMOVER ITENS\n` +
                        `3️⃣ 💰 FINALIZAR ORÇAMENTO\n` +
                        `4️⃣ 🗑️ ESVAZIAR CARRINHO\n` +
                        `5️⃣ 🏠 VOLTAR AO MENU\n\n` +
                        `🔢 Digite o número da opção:`
                })
            }

            /* =========================
               CONFIRMAR ORÇAMENTO
            ========================= */

            if (estado.etapa === 'confirmar_orcamento') {
                if (texto.toUpperCase() === 'SIM') {
                    // Salvar pedido no sistema
                    const numeroPedido = salvarPedido(from, estado.carrinho)

                    console.log(`💰 Orçamento confirmado por ${from}:`, estado.carrinho)

                    estado.etapa = 'menu'
                    estado.carrinho = []
                    saveJSONFile(ESTADOS_FILE, estados)

                    return sock.sendMessage(from, {
                        text: `✅ *ORÇAMENTO CONFIRMADO E ENVIADO!*\n\n` +
                            `📋 *Número do seu orçamento:* ${numeroPedido}\n\n` +
                            `Seu orçamento foi enviado para o atendente *${ATENDENTES.orcamento}*.\n\n` +
                            `📞 Ele entrará em contato em breve para:\n` +
                            `• Confirmar detalhes do pedido\n` +
                            `• Enviar arte para aprovação\n` +
                            `• Informar prazo de entrega\n` +
                            `• Finalizar o pagamento\n\n` +
                            `Agradecemos sua preferência! 💙\n\n` +
                            `🏠 Digite *MENU* para voltar às opções principais.`
                    })
                }

                if (texto.toUpperCase() === 'NÃO') {
                    estado.etapa = 'carrinho'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from, {
                        text: `📝 *VAMOS AJUSTAR SEU ORÇAMENTO*\n\n` +
                            `${resumoCarrinho(estado.carrinho)}\n\n` +
                            `📋 *OPÇÕES DO CARRINHO:*\n\n` +
                            `1️⃣ ➕ ADICIONAR MAIS PRODUTOS\n` +
                            `2️⃣ ✏️ EDITAR/REMOVER ITENS\n` +
                            `3️⃣ 💰 FINALIZAR ORÇAMENTO\n` +
                            `4️⃣ 🗑️ ESVAZIAR CARRINHO\n` +
                            `5️⃣ 🏠 VOLTAR AO MENU\n\n` +
                            `🔢 Digite o número da opção:`
                    })
                }

                return sock.sendMessage(from, {
                    text: '❌ Opção inválida. Digite SIM, NÃO ou VOLTAR.'
                })
            }

            /* =========================
               MENSAGEM NÃO RECONHECIDA
            ========================= */

            // Se chegou até aqui sem processar, oferece ajuda
            return sock.sendMessage(from, {
                text: `🤔 *Não entendi sua mensagem*\n\n` +
                    `Por favor, escolha uma das opções abaixo:\n\n` +
                    `📋 Digite *MENU* para ver o menu principal\n` +
                    `👤 Digite *ATENDENTE* para falar com um atendente\n` +
                    `🛒 Digite *CARRINHO* para ver seu carrinho\n` +
                    `🔄 Digite *VOLTAR* para voltar à etapa anterior\n\n` +
                    `Ou descreva sua necessidade e te ajudaremos!`
            })

        } catch (error) {
            console.error('❌ ERRO NO PROCESSAMENTO:', error)

            // Tentar enviar mensagem de erro
            try {
                const from = messages[0]?.key?.remoteJid
                if (from) {
                    await sock.sendMessage(from, {
                        text: `❌ *Ops! Ocorreu um erro*\n\n` +
                            `Nosso sistema encontrou uma dificuldade. Por favor:\n\n` +
                            `1. Tente novamente em alguns instantes\n` +
                            `2. Entre em contato direto: ${ATENDENTES.whatsapp}\n\n` +
                            `Desculpe pelo inconveniente! 🛠️`
                    })
                }
            } catch (sendError) {
                console.error('Erro ao enviar mensagem de erro:', sendError)
            }
        }
    })

    // Limpeza automática de sessões antigas
    setInterval(() => {
        try {
            const estados = getJSONFile(ESTADOS_FILE)
            const agora = new Date()
            let modificado = false

            for (const [numero, estado] of Object.entries(estados)) {
                const ultimaInteracao = new Date(estado.ultimaInteracao)
                const horasInativo = (agora - ultimaInteracao) / (1000 * 60 * 60)

                // Remove sessões inativas há mais de 48 horas
                if (horasInativo > 48) {
                    delete estados[numero]
                    modificado = true
                    console.log(`🧹 Sessão removida: ${numero.split('@')[0]} (${horasInativo.toFixed(1)}h inativo)`)
                }
            }

            if (modificado) {
                saveJSONFile(ESTADOS_FILE, estados)
            }
        } catch (error) {
            console.error('Erro na limpeza automática:', error)
        }
    }, 3600000) // Executa a cada hora
}

// Tratamento de encerramento gracioso
process.on('SIGINT', () => {
    console.log('\n\n👋 Encerrando bot CrieArtes...')
    console.log('💾 Salvando dados...')
    process.exit(0)
})

// Iniciar o bot
startBot()
