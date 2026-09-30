import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const fields = ['registration','name','cpf','contract_type','hired_on','role','job_level','aso_expires_on','license_number','license_category','license_expires_on','salary','bonus','state','city','phone','email','distance_km','entitled_to_leave','travel_state','travel_city','transport_allowance','benefits'] as const;
const nullable = (value: unknown) => value === '' || value === undefined ? null : value;

function jsonError(message: string, status = 500) { return NextResponse.json({ error: message }, { status }); }

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) return jsonError('OPENAI_API_KEY não configurada no Vercel.', 500);
    let body: { fileUrl?: string; fileName?: string };
    try { body = await request.json(); } catch { return jsonError('Solicitação de análise inválida.', 400); }
    if (!body.fileUrl || !/^https:\/\//i.test(body.fileUrl)) return jsonError('PDF temporário não informado.', 400);

    const prompt = `Leia o PDF de cadastro/transferência de colaborador brasileiro e extraia somente informações explícitas no documento. Não invente. Datas em YYYY-MM-DD. CPF e telefone somente dígitos. Valores numéricos sem R$. Para state/city use o endereço cadastral/residencial do colaborador. Se não estiver claro, use null. NÃO extraia nem defina setor, encarregado, equipe, alojamento ou jornada; serão informados manualmente.`;
    const properties = Object.fromEntries(fields.map(key => [key, { type: ['string','number','null'] } ]));
    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_TRANSFER_MODEL || 'gpt-5-mini',
        input: [{ role: 'user', content: [
          { type: 'input_text', text: prompt },
          { type: 'input_file', filename: body.fileName || 'transferencia.pdf', file_url: body.fileUrl }
        ]}],
        text: { format: { type: 'json_schema', name: 'collaborator_transfer', strict: true, schema: { type: 'object', additionalProperties: false, properties, required: [...fields] } } }
      })
    });

    const raw = await apiResponse.text();
    let result: any = null;
    try { result = raw ? JSON.parse(raw) : null; } catch {
      return jsonError(`O serviço de IA retornou uma resposta inválida (HTTP ${apiResponse.status}).`, 502);
    }
    if (!apiResponse.ok) return jsonError(result?.error?.message || `Falha no serviço de IA (HTTP ${apiResponse.status}).`, 502);

    const text = result?.output_text || result?.output?.flatMap((item: any) => item?.content || []).find((part: any) => part?.type === 'output_text')?.text;
    if (!text) return jsonError(result?.error?.message || 'A IA não retornou dados do PDF.', 502);
    let data: Record<string, unknown>;
    try { data = JSON.parse(String(text)); } catch { return jsonError('A IA respondeu, mas os dados não vieram no formato esperado.', 502); }
    for (const key of fields) data[key] = nullable(data[key]);
    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Erro ao analisar PDF.', 500);
  }
}
