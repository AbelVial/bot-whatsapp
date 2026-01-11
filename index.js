import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    MessageType,
    proto
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
const PEDIDOS_FILE = './pedidos.json'
const MENSAGENS_FORA_HORARIO = './mensagens_fora_horario.json'

const HORARIO_ATENDIMENTO = {
    dias: [1, 2, 3, 4, 5, 6],
    inicio: 9,
    fim: 18,
    sabadoFim: 13
}

const ATENDENTES = {
    orcamento: process.env.ATENDENTE_ORCAMENTO,
    acompanhamento: process.env.ATENDENTE_ACOMPANHAMENTO,
    geral: process.env.ATENDENTE_GERAL,
    whatsapp: process.env.WHATSAPP_CONTATO
}

/* =========================
   FUNÇÕES AUXILIARES
========================= */
function dentroHorario() {
    const agora = new Date()
    const dia = agora.getDay()
    const horaAtual = agora.getHours() + agora.getMinutes() / 60

    if (!HORARIO_ATENDIMENTO.dias.includes(dia)) return false

    if (dia === 6) {
        return horaAtual >= HORARIO_ATENDIMENTO.inicio &&
               horaAtual < HORARIO_ATENDIMENTO.sabadoFim
    }

    return horaAtual >= HORARIO_ATENDIMENTO.inicio &&
           horaAtual < HORARIO_ATENDIMENTO.fim
}

function getJSONFile(filename, defaultData = {}) {
    try {
        if (!fs.existsSync(filename)) fs.writeFileSync(filename, JSON.stringify(defaultData, null, 2))
        const data = fs.readFileSync(filename, 'utf-8')
        return data ? JSON.parse(data) : defaultData
    } catch (error) {
        console.error(`Erro ao ler ${filename}:`, error)
        return defaultData
    }
}

function saveJSONFile(filename, data) {
    try { fs.writeFileSync(filename, JSON.stringify(data, null, 2)) }
    catch (error) { console.error(`Erro ao salvar ${filename}:`, error) }
}

function resumoCarrinho(carrinho) {
    if (!carrinho || carrinho.length === 0) return '🛒 *Seu carrinho está vazio*'
    let total = 0
    let texto = '🧾 *RESUMO DO PEDIDO*\n════════════════\n'
    carrinho.forEach((item, i) => {
        const subtotal = item.preco * item.qtd
        total += subtotal
        texto += `${i + 1}. *${item.nome}*\n   ${item.qtd} × R$ ${item.preco.toFixed(2)} = R$ ${subtotal.toFixed(2)}\n`
    })
    texto += `════════════════\n💰 *TOTAL: R$ ${total.toFixed(2)}*`
    return texto
}

function formatarHorarioAtendimento(detalhado = false) {
    const diasMap = {1:'Segunda',2:'Terça',3:'Quarta',4:'Quinta',5:'Sexta',6:'Sábado'}
    const diasStr = HORARIO_ATENDIMENTO.dias.map(d => diasMap[d]).join(', ')
    if (detalhado) return `• ${diasStr}\nSeg-Sex: ${HORARIO_ATENDIMENTO.inicio}h às ${HORARIO_ATENDIMENTO.fim}h\nSábado: ${HORARIO_ATENDIMENTO.inicio}h às ${HORARIO_ATENDIMENTO.sabadoFim}h`
    return `Seg-Sex: ${HORARIO_ATENDIMENTO.inicio}h às ${HORARIO_ATENDIMENTO.fim}h\nSábado: ${HORARIO_ATENDIMENTO.inicio}h às ${HORARIO_ATENDIMENTO.sabadoFim}h`
}

function gerarNumeroPedido() {
    const d = new Date()
    const rand = Math.floor(Math.random()*1000).toString().padStart(3,'0')
    return `PED${d.getFullYear().toString().slice(-2)}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getDate().toString().padStart(2,'0')}${rand}`
}

function salvarPedido(from, carrinho, nomeCliente='') {
    try {
        const pedidos = getJSONFile(PEDIDOS_FILE, [])
        const numeroPedido = gerarNumeroPedido()
        const pedido = {
            id: numeroPedido,
            cliente: from,
            nomeCliente,
            data: new Date().toISOString(),
            itens: carrinho,
            total: carrinho.reduce((sum,i)=>sum+(i.preco*i.qtd),0),
            status: 'orcamento_solicitado',
            atendente: ATENDENTES.orcamento
        }
        pedidos.push(pedido)
        saveJSONFile(PEDIDOS_FILE, pedidos)
        return numeroPedido
    } catch (e) {
        console.error('Erro ao salvar pedido', e)
        return null
    }
}

function buscarPedido(numeroPedido) {
    const pedidos = getJSONFile(PEDIDOS_FILE, [])
    return pedidos.find(p => p.id === numeroPedido.toUpperCase())
}

function getSaudacao() {
    const h = new Date().getHours()
    if (h<12) return '☀️ Bom dia!'
    if (h<18) return '🌤️ Boa tarde!'
    return '🌙 Boa noite!'
}

/* =========================
   FUNÇÃO BOTÕES
========================= */
function enviarMenu(sock, from, estado) {
    const buttons = [
        { buttonId: 'orcamento', buttonText:{displayText:'📝 Fazer Orçamento'}, type:1 },
        { buttonId: 'acompanhar', buttonText:{displayText:'📦 Acompanhar Pedido'}, type:1 },
        { buttonId: 'atendente', buttonText:{displayText:'👤 Falar com Atendente'}, type:1 },
        { buttonId: 'info', buttonText:{displayText:'ℹ️ Informações da Loja'}, type:1 },
        { buttonId: 'carrinho', buttonText:{displayText:`🛒 Meu Carrinho (${estado.carrinho.length})`}, type:1 },
    ]
    return sock.sendMessage(from, {
        text: '📋 *MENU PRINCIPAL - CRIEARTES*\nEscolha uma opção:',
        buttons,
        headerType: 1
    })
}

function enviarOpcoesCarrinho(sock, from, estado) {
    const buttons = [
        { buttonId:'add_produto', buttonText:{displayText:'➕ Adicionar Produtos'}, type:1 },
        { buttonId:'editar_itens', buttonText:{displayText:'✏️ Editar/Remover Itens'}, type:1 },
        { buttonId:'finalizar', buttonText:{displayText:'💰 Finalizar Orçamento'}, type:1 },
        { buttonId:'esvaziar', buttonText:{displayText:'🗑️ Esvaziar Carrinho'}, type:1 },
        { buttonId:'voltar_menu', buttonText:{displayText:'🏠 Voltar ao Menu'}, type:1 },
    ]
    return sock.sendMessage(from, {
        text: resumoCarrinho(estado.carrinho) + '\n\nEscolha uma ação:',
        buttons,
        headerType: 1
    })
}

/* =========================
   INÍCIO DO BOT
========================= */
async function startBot() {
    console.log('🤖 Iniciando bot CrieArtes...')
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({
        logger:P({level:'silent'}),
        auth: state,
        printQRInTerminal:true,
        browser: ["CrieArtes Bot","Chrome","3.0"]
    })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', ({connection, qr, lastDisconnect})=>{
        if (qr) qrcode.generate(qr,{small:true})
        if(connection==='close'){
            const isLoggedOut = lastDisconnect?.error?.output?.statusCode===DisconnectReason.loggedOut
            if(!isLoggedOut) setTimeout(()=>startBot(),5000)
            else console.log('❌ Sessão finalizada. Refaça o login.')
        }
        if(connection==='open') console.log('✅ Bot conectado!')
    })

    sock.ev.on('messages.upsert', async ({messages})=>{
        try {
            const msg = messages[0]
            if(!msg.message || msg.key.fromMe) return
            const from = msg.key.remoteJid
            let texto = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.buttonsResponseMessage?.selectedButtonId || ''

            const estados = getJSONFile(ESTADOS_FILE)
            if(!estados[from]) estados[from]={etapa:'inicio',carrinho:[],ultimaInteracao:new Date().toISOString()}

            const estado = estados[from]
            estado.ultimaInteracao = new Date().toISOString()

            // ====== MENU PRINCIPAL ======
            if(estado.etapa==='inicio'){
                await sock.sendMessage(from,{text:`${getSaudacao()} Bem-vindo(a) à CrieArtes! 🎨`})
                estado.etapa='menu'
                saveJSONFile(ESTADOS_FILE, estados)
                return enviarMenu(sock, from, estado)
            }

            // ====== TRATAMENTO DE BOTÕES ======
            switch(texto){
                case 'orcamento':
                    estado.etapa='produto'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from,{text:textoCatalogoPorCategoria()})
                case 'acompanhar':
                    estado.etapa='acompanhar_pedido'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from,{text:'📦 Digite o número do pedido para acompanhar:'})
                case 'atendente':
                    estado.etapa='atendente_humano'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from,{text:`👤 Você será atendido por ${ATENDENTES.geral}`})
                case 'info':
                    return sock.sendMessage(from,{text:`🏪 Informações da Loja\nHorário:\n${formatarHorarioAtendimento()}\nContato: ${ATENDENTES.whatsapp}`})
                case 'carrinho':
                    estado.etapa='carrinho'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return enviarOpcoesCarrinho(sock, from, estado)
                case 'add_produto':
                    estado.etapa='produto'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from,{text:textoCatalogoPorCategoria()})
                case 'editar_itens':
                    if(estado.carrinho.length===0) return sock.sendMessage(from,{text:'Carrinho vazio'})
                    estado.etapa='editar_carrinho'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from,{text:resumoCarrinho(estado.carrinho)+'\nDigite o número do item para remover:'})
                case 'finalizar':
                    if(estado.carrinho.length===0) return sock.sendMessage(from,{text:'Carrinho vazio'})
                    estado.etapa='confirmar_orcamento'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from,{text:resumoCarrinho(estado.carrinho)+'\nConfirme o orçamento: SIM ou NÃO'})
                case 'esvaziar':
                    estado.carrinho=[]
                    estado.etapa='menu'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return enviarMenu(sock, from, estado)
                case 'voltar_menu':
                    estado.etapa='menu'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return enviarMenu(sock, from, estado)
            }

            // ====== OUTRAS ETAPAS ======
            if(estado.etapa==='detalhes_produto'){
                const qtd = parseInt(texto)
                if(isNaN(qtd) || qtd<=0) return sock.sendMessage(from,{text:'❌ Quantidade inválida'})
                estado.carrinho.push({nome:estado.produtoSelecionado, preco: catalogo[estado.produtoSelecionado], qtd})
                estado.etapa='carrinho'
                saveJSONFile(ESTADOS_FILE, estados)
                return enviarOpcoesCarrinho(sock, from, estado)
            }

            if(estado.etapa==='confirmar_orcamento'){
                if(texto.toUpperCase()==='SIM'){
                    const numeroPedido = salvarPedido(from, estado.carrinho)
                    estado.carrinho=[]
                    estado.etapa='menu'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return sock.sendMessage(from,{text:`✅ Orçamento confirmado! Número: ${numeroPedido}`})
                }
                if(texto.toUpperCase()==='NÃO'){
                    estado.etapa='carrinho'
                    saveJSONFile(ESTADOS_FILE, estados)
                    return enviarOpcoesCarrinho(sock, from, estado)
                }
            }

            // Voltar geral
            if(texto.toUpperCase()==='VOLTAR'){
                estado.etapa='menu'
                saveJSONFile(ESTADOS_FILE, estados)
                return enviarMenu(sock, from, estado)
            }

        } catch(e){ console.error(e) }
    })
}

startBot()
