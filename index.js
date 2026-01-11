import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    MessageType,
    MessageOptions
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
    dias: [1, 2, 3, 4, 5, 6], // Segunda a Sábado
    inicio: 9,
    fim: 18,
    sabadoFim: 13 // Horário especial para sábado
}

const ATENDENTES = {
    orcamento: process.env.ATENDENTE_ORCAMENTO,
    acompanhamento: process.env.ATENDENTE_ACOMPANHAMENTO,
    geral: process.env.ATENDENTE_GERAL,
    whatsapp: process.env.WHATSAPP_CONTATO
}

/* =========================
   BOTÕES E LISTAS DE SELEÇÃO
========================= */

const menuPrincipal = {
    text: `📋 *MENU PRINCIPAL - CRIEARTES*\n\nComo podemos ajudar você hoje? 🤔`,
    footer: 'Escolha uma opção abaixo:',
    title: 'Menu CrieArtes',
    buttonText: 'Abrir Menu',
    sections: [{
        title: '🎨 Serviços Disponíveis',
        rows: [
            { title: '📝 Fazer Orçamento', description: 'Solicite um orçamento personalizado', rowId: 'menu_orcamento' },
            { title: '📦 Acompanhar Pedido', description: 'Consulte o status do seu pedido', rowId: 'menu_acompanhamento' },
            { title: '👤 Falar com Atendente', description: 'Atendimento humano personalizado', rowId: 'menu_atendente' },
            { title: 'ℹ️ Informações da Loja', description: 'Conheça mais sobre nós', rowId: 'menu_informacoes' },
            { title: '🛒 Meu Carrinho', description: 'Ver produtos adicionados', rowId: 'menu_carrinho' }
        ]
    }]
}

const menuForaHorario = {
    text: `🎯 *OPÇÕES DISPONÍVEIS FORA DO HORÁRIO*`,
    footer: 'Escolha uma opção:',
    title: 'Fora do Horário',
    buttonText: 'Ver Opções',
    sections: [{
        title: '🕒 Opções Disponíveis',
        rows: [
            { title: '📋 Ver Catálogo', description: 'Nossos produtos disponíveis', rowId: 'fora_catalogo' },
            { title: '📸 Visitar Instagram', description: '@cacrieartes', rowId: 'fora_instagram' },
            { title: '📞 Falar com Atendente', description: 'Contato direto', rowId: 'fora_contato' },
            { title: '🏠 Informações da Empresa', description: 'Sobre a CrieArtes', rowId: 'fora_empresa' }
        ]
    }]
}

const menuCarrinho = (carrinhoLength = 0) => ({
    text: `🛒 *OPÇÕES DO CARRINHO*\n\n${carrinhoLength} item(s) adicionado(s)`,
    footer: 'Escolha uma ação:',
    title: 'Meu Carrinho',
    buttonText: 'Gerenciar Carrinho',
    sections: [{
        title: '📋 Ações Disponíveis',
        rows: [
            { title: '➕ Adicionar Mais Produtos', description: 'Continuar comprando', rowId: 'carrinho_adicionar' },
            { title: '✏️ Editar/Remover Itens', description: 'Ajustar seu carrinho', rowId: 'carrinho_editar' },
            { title: '💰 Finalizar Orçamento', description: 'Enviar para atendente', rowId: 'carrinho_finalizar' },
            { title: '🗑️ Esvaziar Carrinho', description: 'Remover todos os itens', rowId: 'carrinho_esvaziar' },
            { title: '🏠 Voltar ao Menu', description: 'Retornar ao menu principal', rowId: 'carrinho_voltar' }
        ]
    }]
})

const confirmarOrcamento = {
    text: `✅ *CONFIRMAR ORÇAMENTO*`,
    footer: 'Deseja finalizar e enviar para o atendente?',
    title: 'Confirmar Orçamento',
    buttonText: 'Confirmar',
    sections: [{
        title: '📋 Opções',
        rows: [
            { title: '✅ Sim, Confirmar', description: 'Enviar para atendente', rowId: 'confirmar_sim' },
            { title: '✏️ Não, Ajustar', description: 'Continuar editando', rowId: 'confirmar_nao' },
            { title: '🔄 Voltar', description: 'Retornar ao carrinho', rowId: 'confirmar_voltar' }
        ]
    }]
}

const acompanharPedido = {
    text: `📦 *ACOMPANHAMENTO DE PEDIDO*`,
    footer: 'Informe o número do pedido ou escolha uma opção:',
    title: 'Acompanhar Pedido',
    buttonText: 'Consultar',
    sections: [{
        title: '📋 Opções',
        rows: [
            { title: '🔍 Novo Acompanhamento', description: 'Informar dados do pedido', rowId: 'acompanhar_novo' },
            { title: '🏠 Voltar ao Menu', description: 'Retornar ao menu principal', rowId: 'acompanhar_voltar' }
        ]
    }]
}

const atendenteHumano = {
    text: `👤 *ATENDIMENTO HUMANO - ${ATENDENTES.geral}*`,
    footer: 'Descreva sua necessidade ou escolha uma opção:',
    title: 'Atendimento Humano',
    buttonText: 'Falar com Atendente',
    sections: [{
        title: '📞 Opções',
        rows: [
            { title: '📝 Descrever Necessidade', description: 'Fale sobre seu pedido/dúvida', rowId: 'atendente_descrever' },
            { title: '🏠 Voltar ao Menu', description: 'Cancelar atendimento', rowId: 'atendente_voltar' }
        ]
    }]
}

/* =========================
   FUNÇÕES UTILITÁRIAS MELHORADAS
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

    // Horário especial para sábado
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
        1: 'Segunda-feira',
        2: 'Terça-feira',
        3: 'Quarta-feira',
        4: 'Quinta-feira',
        5: 'Sexta-feira',
        6: 'Sábado'
    }

    const diasStr = HORARIO_ATENDIMENTO.dias.map(d => diasMap[d]).join('\n• ')

    if (detalhado) {
        return `• ${diasStr}\n\n` +
            `🕘 *Horários:*\n` +
            `Segunda a Sexta: ${HORARIO_ATENDIMENTO.inicio.toString().padStart(2, '0')}:00 às ${HORARIO_ATENDIMENTO.fim.toString().padStart(2, '0')}:00\n` +
            `Sábado: ${HORARIO_ATENDIMENTO.inicio.toString().padStart(2, '0')}:00 às ${HORARIO_ATENDIMENTO.sabadoFim.toString().padStart(2, '0')}:00`
    }

    return `Segunda a Sexta: ${HORARIO_ATENDIMENTO.inicio.toString().padStart(2, '0')}:00 às ${HORARIO_ATENDIMENTO.fim.toString().padStart(2, '0')}:00\n` +
        `Sábado: ${HORARIO_ATENDIMENTO.inicio.toString().padStart(2, '0')}:00 às ${HORARIO_ATENDIMENTO.sabadoFim.toString().padStart(2, '0')}:00`
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

async function enviarListaSelecao(sock, from, listaConfig) {
    try {
        await sock.sendMessage(from, listaConfig, { quoted: null })
    } catch (error) {
        console.error('Erro ao enviar lista de seleção:', error)
        // Fallback para mensagem de texto
        await sock.sendMessage(from, {
            text: `${listaConfig.text}\n\nPor favor, responda com:\n\n${listaConfig.sections[0].rows.map((row, i) => `${i + 1}. ${row.title}`).join('\n')}`
        })
    }
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
                // Opcional: apagar pasta auth
                try {
                    fs.rmSync('auth', { recursive: true, force: true })
                } catch (e) {}
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
            const texto = msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
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

            if (texto.toUpperCase() === 'MENU') {
                estado.etapa = 'menu'
                saveJSONFile(ESTADOS_FILE, estados)
                return enviarListaSelecao(sock, from, menuPrincipal)
            }

            if (texto.toUpperCase() === 'ATENDENTE' || texto.toUpperCase() === 'AJUDA') {
                estado.etapa = 'atendente_humano'
                saveJSONFile(ESTADOS_FILE, estados)
                return enviarListaSelecao(sock, from, atendenteHumano)
            }

            if (texto.toUpperCase() === 'CARRINHO') {
                if (estado.carrinho.length === 0) {
                    return sock.sendMessage(from, {
                        text: `🛒 *SEU CARRINHO ESTÁ VAZIO*\n\nPara adicionar produtos, escolha "Fazer Orçamento" no menu principal.\n\nEscolha uma opção:`
                    })
                }

                estado.etapa = 'carrinho'
                saveJSONFile(ESTADOS_FILE, estados)
                return enviarListaSelecao(sock, from, menuCarrinho(estado.carrinho.length))
            }

            /* =========================
               FORA DO HORÁRIO - MELHORADO
            ========================= */

            const horarioAtual = dentroHorario()

            if (!horarioAtual && estado.etapa === 'inicio') {
                // Salvar mensagem fora do horário
                const mensagens = getJSONFile(MENSAGENS_FORA_HORARIO, [])
                mensagens.push({
                    cliente: from,
                    mensagem: texto,
                    data: new Date().toISOString(),
                    respondido: false
                })
                saveJSONFile(MENSAGENS_FORA_HORARIO, mensagens)

                await sock.sendMessage(from, {
                    text: `⏰ *ATENDIMENTO FORA DO HORÁRIO*\n\n` +
                        `Olá! No momento estamos fora do nosso horário de funcionamento.\n\n` +
                        `📅 *Horários de atendimento:*\n` +
                        `${formatarHorarioAtendimento()}\n\n` +
                        `💬 *Sua mensagem foi registrada:*\n"${texto}"\n\n` +
                        `✅ Nossa equipe responderá assim que possível.\n\n` +
                        `📞 *Contato direto:*\n${ATENDENTES.whatsapp}\n\n` +
                        `Agradecemos sua compreensão! 💙`
                })

                // Oferecer opções automáticas
                estado.etapa = 'menu_fora_horario'
                saveJSONFile(ESTADOS_FILE, estados)

                return enviarListaSelecao(sock, from, menuForaHorario)
            }

            /* =========================
               MENU FORA DO HORÁRIO - MELHORADO
            ========================= */

            if (estado.etapa === 'menu_fora_horario') {
                switch (texto) {
                    case 'fora_catalogo':
                        estado.etapa = 'catalogo_fora_horario'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `${textoCatalogo()}\n\n` +
                                `⚠️ *Importante:* Para solicitar orçamento, entre em contato diretamente pelo WhatsApp durante nosso horário comercial.`
                        })

                    case 'fora_instagram':
                        return sock.sendMessage(from, {
                            text: `📸 *NOSSO INSTAGRAM*\n\n` +
                                `Acompanhe nosso trabalho, novidades e promoções:\n\n` +
                                `👉 https://www.instagram.com/cacrieartes/\n\n` +
                                `*Destaques:*\n` +
                                `• Trabalhos personalizados\n` +
                                `• Novos produtos\n` +
                                `• Promoções especiais\n` +
                                `• Dicas e inspirações\n\n` +
                                `🏠 Escolha "Voltar" para retornar`
                        })

                    case 'fora_contato':
                        return sock.sendMessage(from, {
                            text: `📞 *CONTATO DIRETO*\n\n` +
                                `Para atendimento imediato, entre em contato diretamente:\n\n` +
                                `👤 *${ATENDENTES.geral}*\n` +
                                `📱 ${ATENDENTES.whatsapp}\n\n` +
                                `*Horário de resposta:*\n` +
                                `${formatarHorarioAtendimento()}\n\n` +
                                `🏠 Escolha "Voltar" para retornar`
                        })

                    case 'fora_empresa':
                        return sock.sendMessage(from, {
                            text: `🏪 *CRIEARTES PERSONALIZADOS*\n\n` +
                                `*Sobre nós:*\n` +
                                `Transformamos seus sonhos em arte! Especializados em personalização de produtos com qualidade e criatividade.\n\n` +
                                `*Serviços:*\n` +
                                `• Personalização de camisetas\n` +
                                `• Canecas personalizadas\n` +
                                `• Presentes criativos\n` +
                                `• Brindes corporativos\n` +
                                `• Decoração personalizada\n\n` +
                                `*Valores:*\n` +
                                `💙 Qualidade\n` +
                                `🎨 Criatividade\n` +
                                `⚡ Agilidade\n` +
                                `🤝 Atendimento personalizado\n\n` +
                                `🏠 Escolha "Voltar" para retornar`
                        })

                    default:
                        return enviarListaSelecao(sock, from, menuForaHorario)
                }
            }

            /* =========================
               CATÁLOGO FORA DO HORÁRIO
            ========================= */

            if (estado.etapa === 'catalogo_fora_horario') {
                if (texto.toUpperCase() === 'VOLTAR' || texto.toUpperCase() === 'MENU') {
                    estado.etapa = 'menu_fora_horario'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return enviarListaSelecao(sock, from, menuForaHorario)
                }

                return sock.sendMessage(from, {
                    text: `⚠️ *ATENÇÃO - FORA DO HORÁRIO*\n\n` +
                        `Você pode visualizar nossos produtos, mas para solicitar orçamento, entre em contato diretamente:\n\n` +
                        `📱 ${ATENDENTES.whatsapp}\n\n` +
                        `*Horário de atendimento:*\n` +
                        `${formatarHorarioAtendimento()}\n\n` +
                        `🔄 Escolha "Voltar" para retornar ao menu`
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

                return enviarListaSelecao(sock, from, menuPrincipal)
            }

            /* =========================
               MENU PRINCIPAL - MELHORADO
            ========================= */

            if (estado.etapa === 'menu') {
                switch (texto) {
                    case 'menu_orcamento':
                        estado.etapa = 'produto'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `${textoCatalogo()}\n\n` +
                                `👤 *Atendente responsável:* ${ATENDENTES.orcamento}\n` +
                                `📞 *Dúvidas?* Escolha "Falar com Atendente" no menu`
                        })

                    case 'menu_acompanhamento':
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
                            textoPedidos += `\nDigite o número do pedido ou escolha uma opção abaixo:`
                        }

                        return enviarListaSelecao(sock, from, {
                            ...acompanharPedido,
                            text: acompanharPedido.text + (textoPedidos ? `\n\n${textoPedidos}` : '')
                        })

                    case 'menu_atendente':
                        estado.etapa = 'atendente_humano'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, atendenteHumano)

                    case 'menu_informacoes':
                        return sock.sendMessage(from, {
                            text: `🏪 *CRIEARTES PERSONALIZADOS*\n\n` +
                                `*Missão:* Transformar ideias em produtos personalizados com excelência e criatividade.\n\n` +
                                `*Valores:*\n` +
                                `✅ Qualidade premium\n` +
                                `✅ Atendimento personalizado\n` +
                                `✅ Prazos cumpridos\n` +
                                `✅ Satisfação garantida\n\n` +
                                `*Equipe:*\n` +
                                `👨‍🎨 ${ATENDENTES.orcamento} - Criação e orçamentos\n` +
                                `👩‍💼 ${ATENDENTES.acompanhamento} - Atendimento e pedidos\n\n` +
                                `*Contato:*\n` +
                                `📱 WhatsApp: ${ATENDENTES.whatsapp}\n` +
                                `📧 E-mail: contato@crieartes.com\n\n` +
                                `🕘 *Horário:*\n${formatarHorarioAtendimento()}\n\n` +
                                `🏠 Escolha "Voltar" para retornar`
                        })

                    case 'menu_carrinho':
                        if (estado.carrinho.length === 0) {
                            return sock.sendMessage(from, {
                                text: `🛒 *SEU CARRINHO ESTÁ VAZIO*\n\nPara adicionar produtos, escolha "Fazer Orçamento" no menu principal.`
                            })
                        }

                        estado.etapa = 'carrinho'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, menuCarrinho(estado.carrinho.length))

                    default:
                        return enviarListaSelecao(sock, from, menuPrincipal)
                }
            }

            /* =========================
               ACOMPANHAR PEDIDO - MELHORADO
            ========================= */

            if (estado.etapa === 'acompanhar_pedido') {
                if (texto === 'acompanhar_novo') {
                    return sock.sendMessage(from, {
                        text: `📝 *NOVO ACOMPANHAMENTO*\n\n` +
                            `Por favor, informe:\n\n` +
                            `🔢 *Número do pedido* (ex: PED240101001)\n\n` +
                            `Ou forneça:\n` +
                            `📧 E-mail utilizado na compra\n` +
                            `📱 Seu telefone\n\n` +
                            `*Atendente:* ${ATENDENTES.acompanhamento}\n` +
                            `🔄 Escolha "Voltar" para cancelar`
                    })
                }

                if (texto === 'acompanhar_voltar') {
                    estado.etapa = 'menu'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return enviarListaSelecao(sock, from, menuPrincipal)
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
                if (texto === 'atendente_voltar') {
                    estado.etapa = 'menu'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return enviarListaSelecao(sock, from, menuPrincipal)
                }

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

                return enviarListaSelecao(sock, from, {
                    ...menuCarrinho(estado.carrinho.length),
                    text: `✅ *Produto adicionado ao carrinho!*\n\n${resumoCarrinho(estado.carrinho)}\n\nEscolha uma ação:`
                })
            }

            /* =========================
               CARRINHO - MELHORADO
            ========================= */

            if (estado.etapa === 'carrinho') {
                switch (texto) {
                    case 'carrinho_adicionar':
                        estado.etapa = 'produto'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: textoCatalogo(true)
                        })

                    case 'carrinho_editar':
                        if (estado.carrinho.length === 0) {
                            estado.etapa = 'carrinho'
                            saveJSONFile(ESTADOS_FILE, estados)
                            return enviarListaSelecao(sock, from, menuCarrinho(0))
                        }

                        estado.etapa = 'editar_carrinho'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `${resumoCarrinho(estado.carrinho)}\n\n` +
                                `Digite o *NÚMERO do item* que deseja remover:\n` +
                                `(Exemplo: digite "1" para remover o primeiro item)\n\n` +
                                `🔄 Digite *VOLTAR* para cancelar`
                        })

                    case 'carrinho_finalizar':
                        if (estado.carrinho.length === 0) {
                            return sock.sendMessage(from, {
                                text: '🛒 Seu carrinho está vazio. Adicione produtos antes de finalizar.'
                            })
                        }

                        estado.etapa = 'confirmar_orcamento'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, {
                            ...confirmarOrcamento,
                            text: `${resumoCarrinho(estado.carrinho)}\n\n${confirmarOrcamento.text}`
                        })

                    case 'carrinho_esvaziar':
                        estado.carrinho = []
                        estado.etapa = 'menu'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, menuPrincipal)

                    case 'carrinho_voltar':
                        estado.etapa = 'menu'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, menuPrincipal)

                    default:
                        return enviarListaSelecao(sock, from, menuCarrinho(estado.carrinho.length))
                }
            }

            /* =========================
               EDITAR CARRINHO
            ========================= */

            if (estado.etapa === 'editar_carrinho') {
                if (texto.toUpperCase() === 'VOLTAR') {
                    estado.etapa = 'carrinho'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return enviarListaSelecao(sock, from, menuCarrinho(estado.carrinho.length))
                }

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

                return enviarListaSelecao(sock, from, {
                    ...menuCarrinho(estado.carrinho.length),
                    text: `🗑️ *ITEM REMOVIDO:* ${itemRemovido}\n\n${resumoCarrinho(estado.carrinho)}\n\nEscolha uma ação:`
                })
            }

            /* =========================
               CONFIRMAR ORÇAMENTO
            ========================= */

            if (estado.etapa === 'confirmar_orcamento') {
                switch (texto) {
                    case 'confirmar_sim':
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
                                `🏠 Escolha "Menu" para voltar às opções principais.`
                        })

                    case 'confirmar_nao':
                        estado.etapa = 'carrinho'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, menuCarrinho(estado.carrinho.length))

                    case 'confirmar_voltar':
                        estado.etapa = 'carrinho'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, menuCarrinho(estado.carrinho.length))

                    default:
                        return enviarListaSelecao(sock, from, confirmarOrcamento)
                }
            }

            /* =========================
               COMANDO VOLTAR GLOBAL
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
                        return enviarListaSelecao(sock, from, menuPrincipal)

                    case 'acompanhar_pedido':
                    case 'atendente_humano':
                        estado.etapa = 'menu'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, menuPrincipal)

                    case 'menu_fora_horario':
                    case 'catalogo_fora_horario':
                        estado.etapa = 'menu_fora_horario'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, menuForaHorario)

                    default:
                        estado.etapa = 'menu'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return enviarListaSelecao(sock, from, menuPrincipal)
                }
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
