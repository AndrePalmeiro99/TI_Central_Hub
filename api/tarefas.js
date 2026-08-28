export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');

  const key = process.env.VITE_ONETY_API_KEY || process.env.ONETY_API_KEY || '';
  
  try {
    // 1. Fazer chamada inicial para obter o total de registros
    const initRes = await fetch('https://back.cfonety.com.br/central-tecnologia/dashboard-externo/tarefas?limit=1', {
      headers: { 'x-api-key': key }
    });
    
    if (!initRes.ok) {
      return response.status(initRes.status).json({ error: 'Onety API initial call error: ' + initRes.status });
    }
    
    const initData = await initRes.json();
    const total = initData.total || 0;
    
    if (total === 0) {
      return response.status(200).json({ tarefas: [], total: 0 });
    }
    
    // 2. Calcular o número de páginas com base no limite máximo de 100 por página
    const pageSize = 100;
    const pagesCount = Math.ceil(total / pageSize);
    
    // 3. Buscar todas as páginas em paralelo
    const fetchPromises = Array.from({ length: pagesCount }, (_, i) => {
      const page = i + 1;
      return fetch(`https://back.cfonety.com.br/central-tecnologia/dashboard-externo/tarefas?limit=${pageSize}&page=${page}`, {
        headers: { 'x-api-key': key }
      }).then(async res => {
        if (!res.ok) throw new Error(`Failed page ${page}`);
        return res.json();
      });
    });
    
    const results = await Promise.all(fetchPromises);
    const allTasks = results.flatMap(r => r.tarefas || []);
    
    return response.status(200).json({
      tarefas: allTasks,
      total: allTasks.length
    });
  } catch (error) {
    console.error('Error fetching paginated tasks:', error);
    return response.status(500).json({ error: error.message });
  }
}
