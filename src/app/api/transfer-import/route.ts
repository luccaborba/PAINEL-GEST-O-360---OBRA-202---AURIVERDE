import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const nullable = (value: unknown) => value === '' || value === undefined ? null : value;

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY não configurada no Vercel.' }, { status: 500 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.type !== 'application/pdf') return NextResponse.json({ error: 'Envie um arquivo PDF válido.' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'O PDF deve ter no máximo 20 MB.' }, { status: 400 });
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const prompt = `Leia o PDF de cadastro/transferência de colaborador brasileiro e extraia SOMENTE informações explícitas no documento. Não invente dados. Retorne APENAS JSON válido, sem markdown, com estas chaves: registration,name,cpf,contract_type,hired_on,role,job_level,aso_expires_on,license_number,license_category,license_expires_on,salary,bonus,state,city,phone,email,distance_km,entitled_to_leave,travel_state,travel_city,transport_allowance,benefits. Datas em YYYY-MM-DD. CPF e telefone somente dígitos. Valores numéricos sem R$. Para state/city use o endereço cadastral/residencial do colaborador. Se a informação não estiver clara, use null. NÃO extraia nem defina setor, encarregado, equipe, alojamento ou jornada; esses campos serão informados manualmente.`;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_TRANSFER_MODEL || 'gpt-5-mini', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_file', filename: file.name, file_data: `data:application/pdf;base64,${base64}` }] }] })
    });
    const result = await response.json();
    if (!response.ok) return NextResponse.json({ error: result?.error?.message || 'Falha no serviço de IA.' }, { status: 502 });
    const text = result.output?.flatMap((item: any) => item.content || []).find((part: any) => part.type === 'output_text')?.text || result.output_text;
    if (!text) return NextResponse.json({ error: 'A IA não retornou dados do PDF.' }, { status: 502 });
    const clean = String(text).replace(/^```json\s*/i, '').replace(/```$/,'').trim();
    const data = JSON.parse(clean);
    for (const key of Object.keys(data)) data[key] = nullable(data[key]);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao analisar PDF.' }, { status: 500 });
  }
}
