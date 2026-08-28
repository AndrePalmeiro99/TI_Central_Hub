export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');

  const { id } = request.query;
  if (!id) {
    return response.status(400).json({ error: 'Missing task id parameter' });
  }

  const key = process.env.VITE_ONETY_API_KEY || process.env.ONETY_API_KEY || '';
  const url = `https://back.cfonety.com.br/gestao/pr-externo/tarefas/${id}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': key,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      return response.status(res.status).json({ error: 'Onety details API error: ' + res.status });
    }

    const data = await res.json();
    return response.status(200).json(data);
  } catch (error) {
    console.error('Error fetching task details:', error);
    return response.status(500).json({ error: error.message });
  }
}
