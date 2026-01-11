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
   CONFIGURAÇÕES
========================= */
const ESTADOS_FILE = './estados.json'
const ATENDENTES = {
    orcamento: process.env.ATENDENTE_ORCAMENTO,
    geral: process.env.ATENDENTE_GERAL,
    whatsapp: process.env.WHATSAPP_CONTATO'
}

/* =========================
   FUNÇÕES UTILITÁRIAS
========================= */
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

function getSaudacao() {
    const hora = new Date().getHours()
    if (hora < 12) return '☀️ Bom dia! '
    if (hora < 18) return '🌤️ Boa tarde! '
    return '🌙 Boa noite! '
}

/* =========================
   BOT SIMPLIFICADO
========================= */
async function startBot() {
    console.log('🤖 INICIANDO BOT CRIEARTES - VERSÃO SIMPLIFICADA\n')

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
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

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
            console.log('🕘 Hora:', new Date().toLocaleString('pt-BR'))
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
                msg.message.buttonsResponseMessage?.selectedButtonId ||
                ''

            const estados = getJSONFile(ESTADOS_FILE)

            if (!estados[from]) {
                estados[from] = {
                    etapa: 'inicio',
                    ultimaInteracao: new Date().toISOString()
                }
            }

            const estado = estados[from]
            estado.ultimaInteracao = new Date().toISOString()

            // Log da interação
            console.log(`\n📨 [${new Date().toLocaleTimeString('pt-BR')}] ${from.split('@')[0]}: ${texto.substring(0, 50)}...`)

            /* =========================
               COMANDOS ESPECIAIS
            ========================= */
            if (texto.toUpperCase() === 'MENU') {
                estado.etapa = 'menu'
                saveJSONFile(ESTADOS_FILE, estados)
                return sock.sendMessage(from, {
                    text: `📋 *MENU CRIEARTES*\n\n` +
                        `Escolha uma opção:\n\n` +
                        `1️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                        `   ↳ Atendimento humano personalizado\n\n` +
                        `2️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                        `   ↳ Solicite um orçamento personalizado\n\n` +
                        `3️⃣ 📦 *CONSULTAR PRODUTO/PREÇO*\n` +
                        `   ↳ Veja nosso catálogo e preços\n\n` +
                        `🔢 *Digite o número da opção:*`
                })
            }

            /* =========================
               FLUXO PRINCIPAL
            ========================= */
            if (estado.etapa === 'inicio') {
                const saudacao = getSaudacao()

                await sock.sendMessage(from, {
                    text: `${saudacao} *BEM-VINDO(A) À CRIEARTES PERSONALIZADOS!* 🎨\n\n` +
                        `Somos especialistas em produtos personalizados com qualidade e criatividade! 💙\n\n` +
                        `📍 *Nossos canais:*\n` +
                        `📸 Instagram: @cacrieartes\n` +
                        `📱 WhatsApp: ${ATENDENTES.whatsapp}\n\n` +
                        `🎯 *Como podemos te ajudar?*\n\n` +
                        `1️⃣ 👤 Falar com atendente\n` +
                        `2️⃣ 📝 Fazer orçamento\n` +
                        `3️⃣ 📦 Consultar produto/preço\n\n` +
                        `🔢 *Digite o número da opção:*`
                })

                estado.etapa = 'menu'
                saveJSONFile(ESTADOS_FILE, estados)
                return
            }

            if (estado.etapa === 'menu') {
                switch (texto) {
                    case '1':
                        estado.etapa = 'atendente_humano'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `👤 *ATENDIMENTO HUMANO*\n\n` +
                                `Você será atendido por *${ATENDENTES.geral}* em instantes.\n\n` +
                                `📝 *Por favor, descreva sua necessidade:*\n` +
                                `• Dúvidas sobre produtos\n` +
                                `• Orçamentos\n` +
                                `• Pedidos especiais\n` +
                                `• Outras informações\n\n` +
                                `🔄 Digite *MENU* para voltar`
                        })

                    case '2':
                        estado.etapa = 'orcamento_inicio'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `📝 *ORÇAMENTO PERSONALIZADO*\n\n` +
                                `Para fazer um orçamento, por favor descreva:\n\n` +
                                `🎯 *O que você precisa?*\n` +
                                `(Ex: 10 camisetas personalizadas para empresa)\n\n` +
                                `📋 *Quantidade aproximada:*\n` +
                                `(Ex: 10 unidades, 50 unidades)\n\n` +
                                `📅 *Prazo desejado:*\n` +
                                `(Ex: 15 dias, 1 mês)\n\n` +
                                `📝 *Detalhes da arte/logo:*\n` +
                                `(Ex: já tenho arte, preciso criar)\n\n` +
                                `*Envie todas as informações de uma vez ou digite MENU para voltar.*`
                        })

                    case '3':
                        estado.etapa = 'consulta_produto'
                        saveJSONFile(ESTADOS_FILE, estados)
                        return sock.sendMessage(from, {
                            text: `📦 *CONSULTAR PRODUTOS*\n\n` +
                                `${textoCatalogoPorCategoria()}\n\n` +
                                `🔢 *Digite o número do produto para ver detalhes*\n` +
                                `🔄 Digite *MENU* para voltar`
                        })

                    default:
                        return sock.sendMessage(from, {
                            text: '❌ *Opção inválida*\n\n' +
                                'Por favor, digite:\n' +
                                '• 1 para Falar com Atendente\n' +
                                '• 2 para Fazer Orçamento\n' +
                                '• 3 para Consultar Produto/Preço\n\n' +
                                'Ou digite *MENU* para ver as opções novamente.'
                        })
                }
            }

            /* =========================
               ATENDENTE HUMANO
            ========================= */
            if (estado.etapa === 'atendente_humano') {
                if (texto.toUpperCase() === 'MENU') {
                    estado.etapa = 'menu'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from, {
                        text: `📋 *MENU CRIEARTES*\n\n` +
                            `Escolha uma opção:\n\n` +
                            `1️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                            `2️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                            `3️⃣ 📦 *CONSULTAR PRODUTO/PREÇO*\n\n` +
                            `🔢 *Digite o número da opção:*`
                    })
                }

                console.log(`👤 Cliente ${from} precisa de atendimento: ${texto}`)

                return sock.sendMessage(from, {
                    text: `✅ *MENSAGEM ENVIADA PARA ATENDENTE!*\n\n` +
                        `Sua solicitação foi encaminhada para *${ATENDENTES.geral}*.\n\n` +
                        `📞 Ele entrará em contato em instantes para te atender.\n\n` +
                        `⏰ *Enquanto isso, você pode:*\n` +
                        `• Digitar *MENU* para ver outras opções\n` +
                        `• Esperar o contato do atendente\n\n` +
                        `Agradecemos sua paciência! 💙`
                })
            }

            /* =========================
               ORÇAMENTO
            ========================= */
            if (estado.etapa === 'orcamento_inicio') {
                if (texto.toUpperCase() === 'MENU') {
                    estado.etapa = 'menu'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from, {
                        text: `📋 *MENU CRIEARTES*\n\n` +
                            `Escolha uma opção:\n\n` +
                            `1️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                            `2️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                            `3️⃣ 📦 *CONSULTAR PRODUTO/PREÇO*\n\n` +
                            `🔢 *Digite o número da opção:*`
                    })
                }

                console.log(`💰 Solicitação de orçamento de ${from}: ${texto}`)

                estado.etapa = 'menu'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `✅ *SOLICITAÇÃO DE ORÇAMENTO ENVIADA!*\n\n` +
                        `Suas informações foram enviadas para *${ATENDENTES.orcamento}*.\n\n` +
                        `📋 *Detalhes registrados:*\n"${texto}"\n\n` +
                        `📞 *${ATENDENTES.orcamento}* entrará em contato em breve para:\n` +
                        `• Confirmar os detalhes\n` +
                        `• Enviar orçamento formal\n` +
                        `• Explicar prazos e condições\n\n` +
                        `⏰ *Enquanto isso, você pode:*\n` +
                        `• Digitar *MENU* para outras opções\n` +
                        `• Esperar nosso contato\n\n` +
                        `Obrigado pela preferência! 💙`
                })
            }

            /* =========================
               CONSULTA DE PRODUTOS
            ========================= */
            if (estado.etapa === 'consulta_produto') {
                if (texto.toUpperCase() === 'MENU') {
                    estado.etapa = 'menu'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from, {
                        text: `📋 *MENU CRIEARTES*\n\n` +
                            `Escolha uma opção:\n\n` +
                            `1️⃣ 👤 *FALAR COM ATENDENTE*\n` +
                            `2️⃣ 📝 *FAZER ORÇAMENTO*\n` +
                            `3️⃣ 📦 *CONSULTAR PRODUTO/PREÇO*\n\n` +
                            `🔢 *Digite o número da opção:*`
                    })
                }

                const produtoSelecionado = getProdutoPorNumero(texto)

                if (!produtoSelecionado) {
                    return sock.sendMessage(from, {
                        text: '❌ *Produto inválido*\n\n' +
                            'Digite o número do produto da lista ou:\n' +
                            '• Digite *MENU* para voltar ao menu\n' +
                            '• Veja a lista novamente abaixo:\n\n' +
                            textoCatalogoPorCategoria()
                    })
                }

                const detalhes = getDetalhesProduto(produtoSelecionado)
                estado.etapa = 'menu'
                saveJSONFile(ESTADOS_FILE, estados)

                return sock.sendMessage(from, {
                    text: `${detalhes}\n\n` +
                        `💡 *Gostou deste produto?*\n\n` +
                        `1️⃣ Digite *1* para falar com atendente sobre este produto\n` +
                        `2️⃣ Digite *2* para fazer orçamento\n` +
                        `3️⃣ Digite *3* para ver mais produtos\n` +
                        `🔄 Digite *MENU* para voltar ao menu principal`
                })
            }

            /* =========================
               MENSAGEM NÃO RECONHECIDA
            ========================= */
            return sock.sendMessage(from, {
                text: `🤔 *Não entendi sua mensagem*\n\n` +
                    `Por favor, digite:\n\n` +
                    `📋 *MENU* para ver as opções\n` +
                    `👤 *1* para falar com atendente\n` +
                    `📝 *2* para fazer orçamento\n` +
                    `📦 *3* para consultar produtos\n\n` +
                    `Ou descreva sua necessidade que te ajudaremos!`
            })

        } catch (error) {
            console.error('❌ ERRO NO PROCESSAMENTO:', error)

            try {
                const from = messages[0]?.key?.remoteJid
                if (from) {
                    await sock.sendMessage(from, {
                        text: `❌ *Ops! Ocorreu um erro*\n\n` +
                            `Por favor, tente novamente ou entre em contato:\n` +
                            `📱 ${ATENDENTES.whatsapp}\n\n` +
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
    }, 3600000)
}

// Tratamento de encerramento
process.on('SIGINT', () => {
    console.log('\n\n👋 Encerrando bot CrieArtes...')
    process.exit(0)
})

// Iniciar o bot
startBot()
