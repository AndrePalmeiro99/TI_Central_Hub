export default async function handler(request, response) {
  // Configurar cabeçalhos de CORS e Cache para permitir consumo público pela TV do Gestor
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  const key = process.env.VITE_ONETY_API_KEY || process.env.ONETY_API_KEY || '';
  
  try {
    // 1. Obter total de registros
    const initRes = await fetch('https://back.cfonety.com.br/central-tecnologia/dashboard-externo/tarefas?limit=1', {
      headers: { 'x-api-key': key }
    });
    
    if (!initRes.ok) {
      return response.status(initRes.status).json({ error: 'Onety API error: ' + initRes.status });
    }
    
    const initData = await initRes.json();
    const total = initData.total || 0;
    
    if (total === 0) {
      return response.status(200).json({
        mes_nome: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        total_mes: 0,
        pendentes: 0,
        atrasadas: 0,
        concluidas: 0,
        lista_atrasadas: []
      });
    }
    
    // 2. Paginar todos os resultados
    const pageSize = 100;
    const pagesCount = Math.ceil(total / pageSize);
    
    const fetchPromises = Array.from({ length: pagesCount }, (_, i) => {
      const page = i + 1;
      return fetch(`https://back.cfonety.com.br/central-tecnologia/dashboard-externo/tarefas?limit=${pageSize}&page=${page}`, {
        headers: { 'x-api-key': key }
      }).then(res => res.json());
    });
    
    const results = await Promise.all(fetchPromises);
    const allTasks = results.flatMap(r => r.tarefas || []);

    // 3. Processar métricas com base no mês de referência (Mês Atual)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Filtrar tarefas do mês atual (criadas no mês atual)
    const tasksThisMonth = allTasks.filter(t => {
      if (!t.data_criacao) return false;
      const d = new Date(t.data_criacao);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    // Calcular contadores
    let pendentes = 0;
    let atrasadas = 0;
    let concluidas = 0;
    const listaAtrasadas = [];

    allTasks.forEach(t => {
      const isConcluida = !!t.data_conclusao || ['concluido', 'concluída', 'encerrado'].includes((t.situacao || '').toLowerCase());
      const isCancelada = ['cancelado', 'distrato', 'reprovado'].includes((t.situacao || '').toLowerCase());
      
      if (isCancelada) return;

      const createdDate = t.data_criacao ? new Date(t.data_criacao) : null;
      const isCreatedThisMonth = createdDate && createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear;
      
      const conclusaoDate = t.data_conclusao ? new Date(t.data_conclusao) : null;
      const isConcluidaThisMonth = conclusaoDate && conclusaoDate.getMonth() === currentMonth && conclusaoDate.getFullYear() === currentYear;

      const oneDayMs = 24 * 60 * 60 * 1000;

      // Pendentes Ativos (de qualquer mês de abertura)
      if (!isConcluida) {
        let isAtrasada = false;
        let diffDays = 0;

        if (createdDate) {
          const timeDiff = now.getTime() - createdDate.getTime();
          if (timeDiff > oneDayMs) {
            isAtrasada = true;
            diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
          }
        } else {
          const prazo = t.data_prazo ? new Date(t.data_prazo) : null;
          if (prazo && now > prazo) {
            isAtrasada = true;
            const diffTime = Math.abs(now - prazo);
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          }
        }

        if (isAtrasada) {
          atrasadas++;
          
          let resp = t.responsavel || 'Não atribuído';
          if (typeof t.responsavel === 'object' && t.responsavel !== null) {
            resp = t.responsavel.nome || t.responsavel.login || 'Não atribuído';
          }

          listaAtrasadas.push({
            id: t.id,
            empresa_nome: t.empresa?.nome || 'Cliente Sem Nome',
            data_abertura: createdDate ? createdDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'N/A',
            responsavel: resp,
            dias_atraso: diffDays
          });
        } else {
          pendentes++;
        }
      } else {
        // Concluídas no mês atual
        if (isConcluidaThisMonth) {
          concluidas++;
        }
      }
    });

    // Ordenar a lista de atrasadas pelo maior número de dias de atraso
    listaAtrasadas.sort((a, b) => b.dias_atraso - a.dias_atraso);

    // Nome formatado do mês de referência
    const mesNome = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const mesFormatado = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);

    return response.status(200).json({
      mes_nome: mesFormatado,
      total_mes: tasksThisMonth.length,
      pendentes,
      atrasadas,
      concluidas,
      lista_atrasadas: listaAtrasadas
    });
  } catch (error) {
    console.error('Error in TV metrics API:', error);
    return response.status(500).json({ error: error.message });
  }
}
