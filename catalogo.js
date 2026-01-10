// catalogo.js - Catálogo CrieArtes Personalizados
export const catalogo = {
    // Categoria: Vestuário
    "Camisa Branca": 40.00,
    "Camisa Colorida Clara": 40.00,
    "Camisa Escura (Impressão DTF)": 50.00,
    "Body Infantil Personalizado": 35.00,
    "Boné Forrado": 35.00, // Preço estimado - ajuste se necessário
    "Boné Telado Personalizado": 40.00,
    "Chinelo Personalizado": 35.00,

    // Categoria: Canecas e Xícaras
    "Caneca de Porcelana 325ml": 35.00,
    "Caneca Chopp de Vidro Jateado": 60.00,
    "Xícara 180ml": 35.00,
    "Xícara sem Pires 150ml": 30.00,
    "Torre de Xícaras Personalizadas": 120.00,

    // Categoria: Decoração
    "Almofada Personalizada 40x40": 45.00,
    "Almofada Personalizada 25x25": 40.00,
    "Azulejo Personalizado 15x15": 35.00,
    "Quebra-cabeça 45 peças": 25.00,
    "Quebra-cabeça 12 peças": 20.00,

    // Categoria: Utilidades
    "Ecobag Personalizada": 35.00,
    "Mouse Pad Personalizado": 23.00,
    "Squeeze de Alumínio 600ml": 50.00,

    // Categoria: Kits
    "Kit 10 Canetas Personalizadas (Azul)": 30.00, // Preço estimado - ajuste se necessário
    "Kit 10 Chaveiros Personalizados": 45.00, // Preço estimado - ajuste se necessário
}

// Informações adicionais para os produtos
export const detalhesProdutos = {
    "Camisa Branca": {
        tamanhos: ["P", "M", "G"],
        variantes: ["Baby look (P, M, G)"],
        observacoes: "Disponível em tamanhos P, M, G e Baby look"
    },
    "Camisa Colorida Clara": {
        tamanhos: ["P", "M", "G"],
        variantes: ["Baby look (P, M, G)"],
        observacoes: "Disponível em tamanhos P, M, G e Baby look"
    },
    "Camisa Escura (Impressão DTF)": {
        observacoes: "Impressão DTF para melhor qualidade em tecidos escuros"
    },
    "Mouse Pad Personalizado": {
        opcoes: ["Quadrado", "Redondo"],
        observacoes: "Escolha entre formato quadrado ou redondo"
    },
    "Almofada Personalizada 40x40": {
        tamanho: "40x40 cm",
        observacoes: "Tamanho padrão de almofada decorativa"
    },
    "Almofada Personalizada 25x25": {
        tamanho: "25x25 cm",
        observacoes: "Tamanho compacto ideal para detalhes"
    },
    "Azulejo Personalizado 15x15": {
        tamanho: "15x15 cm",
        observacoes: "Perfeito para decoração de cozinhas ou lembranças"
    },
    "Quebra-cabeça 45 peças": {
        pecas: 45,
        observacoes: "Ideal para crianças e presente personalizado"
    },
    "Quebra-cabeça 12 peças": {
        pecas: 12,
        observacoes: "Perfeito para crianças pequenas"
    },
    "Kit 10 Canetas Personalizadas (Azul)": {
        corTinta: "Azul",
        quantidade: 10,
        observacoes: "Kit com 10 canetas personalizadas, tinta azul"
    },
    "Kit 10 Chaveiros Personalizados": {
        quantidade: 10,
        observacoes: "Kit com 10 chaveiros personalizados"
    },
    "Torre de Xícaras Personalizadas": {
        composicao: "Torre + Xícaras",
        observacoes: "Conjunto completo para presente especial"
    },
    "Squeeze de Alumínio 600ml": {
        capacidade: "600ml",
        material: "Alumínio",
        observacoes: "Garrafa térmica de alumínio personalizada"
    }
}

// Categorias para organização do menu
export const categorias = {
    "vestuario": {
        nome: "👕 Vestuário",
        produtos: [
            "Camisa Branca",
            "Camisa Colorida Clara",
            "Camisa Escura (Impressão DTF)",
            "Body Infantil Personalizado",
            "Boné Forrado",
            "Boné Telado Personalizado",
            "Chinelo Personalizado"
        ]
    },
    "canecas_xicaras": {
        nome: "☕ Canecas e Xícaras",
        produtos: [
            "Caneca de Porcelana 325ml",
            "Caneca Chopp de Vidro Jateado",
            "Xícara 180ml",
            "Xícara sem Pires 150ml",
            "Torre de Xícaras Personalizadas"
        ]
    },
    "decoracao": {
        nome: "🏠 Decoração",
        produtos: [
            "Almofada Personalizada 40x40",
            "Almofada Personalizada 25x25",
            "Azulejo Personalizado 15x15",
            "Quebra-cabeça 45 peças",
            "Quebra-cabeça 12 peças"
        ]
    },
    "utilidades": {
        nome: "🛍️ Utilidades",
        produtos: [
            "Ecobag Personalizada",
            "Mouse Pad Personalizado",
            "Squeeze de Alumínio 600ml"
        ]
    },
    "kits": {
        nome: "🎁 Kits",
        produtos: [
            "Kit 10 Canetas Personalizadas (Azul)",
            "Kit 10 Chaveiros Personalizados"
        ]
    }
}

// Função para obter texto formatado do catálogo por categoria
export function textoCatalogoPorCategoria() {
    let texto = '📦 *CATÁLOGO CRIEARTES - ORGANIZADO POR CATEGORIA*\n\n'

    for (const [categoriaId, categoria] of Object.entries(categorias)) {
        texto += `*${categoria.nome}*\n`

        let i = 1
        for (const produtoNome of categoria.produtos) {
            if (catalogo[produtoNome]) {
                texto += `${i}️⃣ ${produtoNome} — R$ ${catalogo[produtoNome].toFixed(2)}\n`
                i++
            }
        }
        texto += '\n'
    }

    texto += `🔍 *Digite o NÚMERO do produto desejado*\n`
    texto += `📋 Digite *CATEGORIAS* para ver por categoria\n`
    texto += `🔄 Digite *VOLTAR* para menu anterior\n`
    texto += `🏠 Digite *MENU* para menu principal`

    return texto
}

// Função para obter detalhes de um produto específico
export function getDetalhesProduto(nomeProduto) {
    if (detalhesProdutos[nomeProduto]) {
        let detalhes = `📝 *${nomeProduto}*\n`
        detalhes += `💰 Preço: R$ ${catalogo[nomeProduto].toFixed(2)}\n\n`

        const info = detalhesProdutos[nomeProduto]
        for (const [chave, valor] of Object.entries(info)) {
            if (Array.isArray(valor)) {
                detalhes += `• ${chave.charAt(0).toUpperCase() + chave.slice(1)}: ${valor.join(', ')}\n`
            } else {
                detalhes += `• ${chave.charAt(0).toUpperCase() + chave.slice(1)}: ${valor}\n`
            }
        }

        return detalhes
    }

    return `📝 *${nomeProduto}*\n💰 Preço: R$ ${catalogo[nomeProduto].toFixed(2)}\n\nℹ️ Para mais informações sobre este produto, consulte nosso atendente.`
}

// Função para buscar produto por número
export function getProdutoPorNumero(numero) {
    const produtos = Object.keys(catalogo)
    const index = parseInt(numero) - 1

    if (index >= 0 && index < produtos.length) {
        return produtos[index]
    }

    return null
}