'use client';
import { systemConfirm } from '@/lib/systemConfirm';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Item = { id: string; code: string; description: string; unit: string; active: boolean };
type Place = { id: string; name: string; active: boolean };
type Home = { id: string; contract_code: string; description: string; status: string };
type Contract = { code: string; description: string | null; supplier: string | null; contract_type: string | null; status: string | null; terminated_on: string | null };
type Allocation = { id: string; item_id: string; housing_id: string | null; location_id: string | null; contract_code: string | null; quantity: number; notes: string | null };
type Target = { key: string; label: string; kind: 'housing' | 'location' | 'contract'; id: string; group: 'ALOJAMENTOS' | 'OUTROS LOCAIS' };
type Props = { sb: SupabaseClient; projectId: string; projectLabel: string; canCreate: boolean; canEdit: boolean; canDelete: boolean; mode?: 'inventory' | 'catalog' | 'places'; onOpenCatalog?: () => void };

export default function Assets({ sb, projectId, projectLabel, canCreate, canEdit, canDelete, mode = 'inventory', onOpenCatalog }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [homes, setHomes] = useState<Home[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [placeFilter, setPlaceFilter] = useState('');
  const [dialog, setDialog] = useState(false);
  const [itemId, setItemId] = useState('');
  const [destination, setDestination] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('UN');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    async function readAll<T>(table: string, columns: string): Promise<T[]> {
      const rows: T[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await sb.from(table).select(columns).eq('project_id', projectId).range(start, start + 999);
        if (error) throw error;
        rows.push(...data as T[]);
        if (!data || data.length < 1000) return rows;
      }
    }
    try {
      const [catalog, locations, lodging, leases, inventory] = await Promise.all([
        readAll<Item>('cx_asset_catalog', 'id,code,description,unit,active'),
        readAll<Place>('cx_asset_locations', 'id,name,active'),
        readAll<Home>('cx_housing', 'id,contract_code,description,status'),
        readAll<Contract>('cx_contracts', 'code,description,supplier,contract_type,status,terminated_on'),
        readAll<Allocation>('cx_asset_allocations', 'id,item_id,housing_id,location_id,contract_code,quantity,notes')
      ]);
      setItems(catalog); setPlaces(locations); setHomes(lodging); setContracts(leases); setAllocations(inventory);
    } catch (error) { setMessage(`Não foi possível carregar patrimônio: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setLoading(false); }
  }, [sb, projectId]);

  useEffect(() => { setMessage(''); setDialog(false); setPlaceFilter(''); void refresh(); }, [refresh]);
  useEffect(() => {
    if (!dialog) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setDialog(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = old; window.removeEventListener('keydown', onKey); };
  }, [dialog, busy]);

  const targets = useMemo(() => {
    const leases = contracts.filter(c => /LOCA/i.test(c.contract_type || '') && /IM.VEIS/i.test(c.contract_type || '') && !/^(ENCERRADO|RESCINDIDO|INATIVO)$/i.test((c.status || '').trim()) && !c.terminated_on);
    const leaseCodes = new Set(leases.map(c => c.code.toUpperCase()));
    const housing = homes.filter(h => h.status === 'ATIVO' && (leaseCodes.has(h.contract_code.toUpperCase()) || h.contract_code.toUpperCase().startsWith('OBRA-')));
    const housingCodes = new Set(housing.map(h => h.contract_code.toUpperCase()));
    return [
      ...housing.map(h => ({ key: `housing:${h.id}`, kind: 'housing' as const, id: h.id, label: `${h.contract_code} · ${h.description}`, group: 'ALOJAMENTOS' as const })),
      ...leases.filter(c => !housingCodes.has(c.code.toUpperCase()) && !homes.some(h => h.contract_code.toUpperCase() === c.code.toUpperCase() && h.status !== 'ATIVO')).map(c => ({ key: `contract:${c.code}`, kind: 'contract' as const, id: c.code, label: `${c.code} · ${c.description || c.supplier || 'IMÓVEL'}`, group: 'ALOJAMENTOS' as const })),
      ...places.filter(p => p.active).map(p => ({ key: `location:${p.id}`, kind: 'location' as const, id: p.id, label: p.name, group: 'OUTROS LOCAIS' as const }))
    ] satisfies Target[];
  }, [contracts, homes, places]);
  const visible = useMemo(() => allocations.flatMap(row => {
    const item = items.find(i => i.id === row.item_id);
    const target = targets.find(t => t.kind === 'housing' ? row.housing_id === t.id : t.kind === 'location' ? row.location_id === t.id : row.contract_code === t.id);
    return item && target && (!placeFilter || target.key === placeFilter) && `${item.code} ${item.description} ${target.label}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) ? [{ row, item, target }] : [];
  }), [allocations, items, targets, placeFilter, search]);

  async function submitItem(event: React.FormEvent) {
    event.preventDefault(); if (!canCreate || busy) return;
    const cleanDescription = description.trim().toUpperCase();
    const cleanUnit = unit.trim().toUpperCase();
    const numericCodes = items.map(item => /^\d{4}$/.test(item.code) ? Number(item.code) : 0);
    const nextNumber = Math.max(0, ...numericCodes) + 1;
    if (nextNumber > 9999) { setMessage('O limite de códigos automáticos (9999) foi atingido.'); setBusy(false); return; }
    const nextCode = String(nextNumber).padStart(4, '0');
    if (!await systemConfirm(`Código: ${nextCode}\nDescrição: ${cleanDescription}\nUnidade: ${cleanUnit}\n\nConfirma o cadastro deste item?`, 'CONFIRMAR CADASTRO')) return;
    setBusy(true); setMessage('');
    const { error } = await sb.from('cx_asset_catalog').insert({ project_id: projectId, code: nextCode, description: cleanDescription, unit: cleanUnit });
    if (error) setMessage(error.message); else { setDescription(''); await refresh(); setMessage(`Item ${nextCode} incluído no cadastro patrimonial.`); }
    setBusy(false);
  }
  function beginEditItem(item: Item) {
    if (!canEdit || busy) return;
    setEditingItemId(item.id);
    setDescription(item.description);
    setUnit(item.unit);
    setMessage('');
  }
  function cancelEditItem() {
    setEditingItemId(null);
    setDescription('');
    setUnit('UN');
  }
  async function saveItemEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || busy || !editingItemId) return;
    const cleanDescription = description.trim().toUpperCase();
    const cleanUnit = unit.trim().toUpperCase();
    if (cleanDescription.length < 2 || !cleanUnit) { setMessage('Preencha descrição e unidade.'); return; }
    if (!await systemConfirm(`Descrição: ${cleanDescription}\nUnidade: ${cleanUnit}\n\nConfirma a alteração deste item?`, 'CONFIRMAR ALTERAÇÃO')) return;
    setBusy(true); setMessage('');
    const { error } = await sb.from('cx_asset_catalog').update({ description: cleanDescription, unit: cleanUnit }).eq('id', editingItemId).eq('project_id', projectId);
    if (error) setMessage(error.message); else { cancelEditItem(); await refresh(); setMessage('Item atualizado com sucesso.'); }
    setBusy(false);
  }
  async function submitPlace(event: React.FormEvent) {
    event.preventDefault(); if (!canCreate || busy) return;
    const cleanName = placeName.trim().toUpperCase();
    if (!await systemConfirm(`Local: ${cleanName}\n\nConfirma o cadastro deste local?`, 'CONFIRMAR CADASTRO')) return;
    setBusy(true); setMessage('');
    const { error } = await sb.from('cx_asset_locations').insert({ project_id: projectId, name: cleanName });
    if (error) setMessage(error.message); else { setPlaceName(''); await refresh(); setMessage('Local cadastrado.'); }
    setBusy(false);
  }
  async function submitInventory(event: React.FormEvent) {
    event.preventDefault(); if (!canCreate || busy) return;
    const target = targets.find(t => t.key === destination);
    const amount = Number(quantity.replace(',', '.'));
    if (!target || !items.some(i => i.id === itemId && i.active) || !Number.isFinite(amount) || amount <= 0) { setMessage('Selecione um item, um destino ativo e uma quantidade válida.'); return; }
    const selectedItem = items.find(i => i.id === itemId);
    if (!await systemConfirm(`Item: ${selectedItem?.code} · ${selectedItem?.description}\nLocal: ${target.label}\nQuantidade: ${amount} ${selectedItem?.unit || ''}\n\nConfirma a inclusão no inventário?`, 'CONFIRMAR INCLUSÃO')) return;
    setBusy(true); setMessage('');
    const { error } = await sb.from('cx_asset_allocations').insert({ project_id: projectId, item_id: itemId, quantity: amount, notes: notes.trim() || null, housing_id: target.kind === 'housing' ? target.id : null, location_id: target.kind === 'location' ? target.id : null, contract_code: target.kind === 'contract' ? target.id : null });
    if (error) setMessage(error.message); else { setDialog(false); setItemId(''); setDestination(''); setQuantity('1'); setNotes(''); await refresh(); setMessage('Item incluído no inventário.'); }
    setBusy(false);
  }
  async function toggle(table: 'cx_asset_catalog' | 'cx_asset_locations', row: Item | Place) {
    if (!canEdit || busy || !await systemConfirm(`${row.active ? 'Inativar' : 'Reativar'} ${'description' in row ? row.description : row.name}?`)) return;
    setBusy(true);
    const { error } = await sb.from(table).update({ active: !row.active }).eq('id', row.id).eq('project_id', projectId);
    if (error) setMessage(error.message); else { await refresh(); setMessage('Status atualizado.'); }
    setBusy(false);
  }
  async function editQuantity(row: Allocation) {
    if (!canEdit || busy) return;
    const input = window.prompt('Nova quantidade:', String(row.quantity).replace('.', ','));
    if (input === null) return;
    const amount = Number(input.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { setMessage('Informe uma quantidade maior que zero.'); return; }
    setBusy(true);
    const { error } = await sb.from('cx_asset_allocations').update({ quantity: amount, updated_at: new Date().toISOString() }).eq('id', row.id).eq('project_id', projectId);
    if (error) setMessage(error.message); else { await refresh(); setMessage('Quantidade atualizada.'); }
    setBusy(false);
  }
  async function remove(row: Allocation) {
    if (!canDelete || busy || !await systemConfirm('Retirar este item do inventário?')) return;
    setBusy(true);
    const { error } = await sb.from('cx_asset_allocations').delete().eq('id', row.id).eq('project_id', projectId);
    if (error) setMessage(error.message); else { await refresh(); setMessage('Item retirado do inventário.'); }
    setBusy(false);
  }

  const catalog = mode === 'catalog';
  const locations = mode === 'places';
  return <section className="cx-assets">
    <div className="heading"><div><span className="eyebrow">PATRIMÔNIO · {projectLabel}</span><h1>{catalog ? 'Cadastro patrimonial' : locations ? 'Cadastro de locais' : 'Inventário patrimonial'}</h1><p>{catalog ? 'Cadastre os itens antes de lançá-los nos imóveis e locais.' : locations ? 'Organize escritório, almoxarifado, laboratório e outros locais da obra.' : 'Itens distribuídos entre alojamentos e demais locais ativos da obra.'}</p></div>{mode === 'inventory' && canCreate && <button className="cx-primary" onClick={() => { setMessage(''); setDialog(true); }}>+ Incluir inventário</button>}</div>
    {message && <div className="notice" role="status">{message}<button aria-label="Fechar aviso" onClick={() => setMessage('')}>×</button></div>}
    {loading ? <div className="panel">Carregando patrimônio…</div> : catalog ? <div className="panel cx-asset-card"><h2>Itens cadastrados</h2>{(canCreate || editingItemId) && <form className="cx-asset-form" onSubmit={editingItemId ? saveItemEdit : submitItem}><label>Código<input readOnly value={editingItemId ? (items.find(i => i.id === editingItemId)?.code || '') : String(Math.max(0, ...items.map(item => /^\d{4}$/.test(item.code) ? Number(item.code) : 0)) + 1).padStart(4, '0')} title={editingItemId ? 'Código não pode ser alterado' : 'Código gerado automaticamente'} /></label><label>Descrição<input required minLength={2} maxLength={200} value={description} onChange={e => setDescription(e.target.value.toUpperCase())} /></label><label>Unidade<input required maxLength={12} value={unit} onChange={e => setUnit(e.target.value.toUpperCase())} /></label><button className="cx-primary" disabled={busy}>{editingItemId ? 'Salvar alterações' : 'Cadastrar item'}</button>{editingItemId && <button type="button" disabled={busy} onClick={cancelEditItem}>Cancelar</button>}</form>}<div className="matrix-scroll"><table><thead><tr><th>Código</th><th>Descrição</th><th>Unidade</th><th>Status</th><th>Ação</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.code}</td><td>{item.description}</td><td>{item.unit}</td><td>{item.active ? 'ATIVO' : 'INATIVO'}</td><td><div className="cx-asset-row-actions">{canEdit && <button type="button" onClick={() => beginEditItem(item)}>✏️ Editar</button>}{canEdit && <button type="button" onClick={() => void toggle('cx_asset_catalog', item)}>{item.active ? 'Inativar' : 'Reativar'}</button>}</div></td></tr>)}</tbody></table></div></div> : locations ? <div className="panel cx-asset-card"><h2>Locais da obra</h2>{canCreate && <form className="cx-asset-form" onSubmit={submitPlace}><label>Nome do local<input required minLength={2} maxLength={160} value={placeName} onChange={e => setPlaceName(e.target.value.toUpperCase())} placeholder="EX.: ALMOXARIFADO" /></label><button className="cx-primary" disabled={busy}>Criar local</button></form>}<div className="matrix-scroll"><table><thead><tr><th>Local</th><th>Status</th><th>Ação</th></tr></thead><tbody>{places.map(place => <tr key={place.id}><td>{place.name}</td><td>{place.active ? 'ATIVO' : 'INATIVO'}</td><td>{canEdit && <button onClick={() => void toggle('cx_asset_locations', place)}>{place.active ? 'Inativar' : 'Reativar'}</button>}</td></tr>)}</tbody></table></div></div> : <div className="panel cx-asset-card"><div className="cx-asset-list-head"><div><h2>Inventário por local</h2><p>{visible.length} lançamento(s) · {targets.length} local(is) ativo(s)</p></div><div className="cx-asset-list-controls"><label>Local<select value={placeFilter} onChange={e => setPlaceFilter(e.target.value)}><option value="">Todos os locais ativos</option><optgroup label="Alojamentos">{targets.filter(t => t.group === 'ALOJAMENTOS').map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup><optgroup label="Outros locais">{targets.filter(t => t.group === 'OUTROS LOCAIS').map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup></select></label><label>Buscar item<input value={search} onChange={e => setSearch(e.target.value)} placeholder="CÓDIGO OU DESCRIÇÃO" /></label></div></div><div className="matrix-scroll"><table><thead><tr><th>Código</th><th>Item</th><th>Local</th><th>Quantidade</th><th>Observações</th><th>Ações</th></tr></thead><tbody>{visible.map(({ row, item, target }) => <tr key={row.id}><td>{item.code}</td><td>{item.description}</td><td>{target.label}</td><td>{Number(row.quantity).toLocaleString('pt-BR')} {item.unit}</td><td>{row.notes || '—'}</td><td className="cx-asset-row-actions">{canEdit && <button title="Alterar quantidade" aria-label={`Alterar quantidade de ${item.description}`} onClick={() => void editQuantity(row)}>✏️</button>}{canDelete && <button title="Retirar item" aria-label={`Retirar ${item.description}`} onClick={() => void remove(row)}>🗑</button>}</td></tr>)}</tbody></table></div>{!visible.length && <div className="empty">Nenhum item encontrado nos locais ativos.</div>}</div>}
    {dialog && <div className="cx-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setDialog(false); }}><div className="panel cx-modal cx-asset-modal" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title"><div className="cx-dialog-head"><div><span className="eyebrow">PATRIMÔNIO · {projectLabel}</span><h2 id="asset-dialog-title">Incluir inventário</h2></div><button type="button" className="cx-dialog-close" aria-label="Fechar" disabled={busy} onClick={() => setDialog(false)}>×</button></div>{message && <div className="notice" role="alert">{message}</div>}<form onSubmit={submitInventory} className="cx-asset-dialog-form"><label>1. Item do cadastro patrimonial<select required value={itemId} onChange={e => setItemId(e.target.value)}><option value="">Escolha um item</option>{items.filter(i => i.active).map(i => <option key={i.id} value={i.id}>{i.code} · {i.description}</option>)}</select></label><label>2. Alojamento ou outro local<select required value={destination} onChange={e => setDestination(e.target.value)}><option value="">Escolha onde incluir</option><optgroup label="ALOJAMENTOS / CONTRATOS DE LOCAÇÃO">{targets.filter(t => t.group === 'ALOJAMENTOS').map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup><optgroup label="OUTROS LOCAIS">{targets.filter(t => t.group === 'OUTROS LOCAIS').map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup></select></label><div className="cx-asset-dialog-row"><label>Quantidade<input required inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Observações<input value={notes} onChange={e => setNotes(e.target.value.toUpperCase())} /></label></div><div className="cx-form-actions"><button type="button" disabled={busy} onClick={() => setDialog(false)}>Cancelar</button><button className="cx-primary" disabled={busy || !items.some(i => i.active) || !targets.length}>{busy ? 'Salvando…' : 'Salvar no inventário'}</button></div>{!items.some(i => i.active) && <p>Não há itens disponíveis. {onOpenCatalog && <button type="button" className="cx-asset-inline-link" onClick={() => { setDialog(false); onOpenCatalog(); }}>Cadastrar item agora</button>}</p>}</form></div></div>}
  </section>;
}
