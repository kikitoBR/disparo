'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Send,
  MessageCircle,
  Plus,
  Trash2,
  Rocket,
  RefreshCw,
  Upload,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MessageSquare,
  Zap,
  Hash,
  Edit2,
  Check,
  X,
  LogOut,
} from 'lucide-react';
import type { Contact, Campaign, CampaignLog } from '@/lib/types';
import { DirectSendModal } from '@/components/DirectSendModal';

type Tab = 'contacts' | 'dispatch' | 'responses';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('contacts');
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass-card mx-4 mt-4 mb-2 px-6 py-4 flex items-center justify-between rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Disparo WhatsApp</h1>
            <p className="text-xs text-muted">Evolution API • Painel de Controle</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          title="Sair do painel"
          className="btn btn-secondary btn-sm flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair
        </button>
      </header>

      {/* Tab Navigation */}
      <nav className="mx-4 mb-3 flex gap-1 glass-card rounded-xl p-1.5">
        {[
          { id: 'contacts' as Tab, label: 'Contatos', icon: Users },
          { id: 'dispatch' as Tab, label: 'Disparar', icon: Send },
          { id: 'responses' as Tab, label: 'Respostas', icon: MessageCircle },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-smooth cursor-pointer ${
              activeTab === tab.id
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:text-foreground hover:bg-surface'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 mx-4 mb-4">
        {activeTab === 'contacts' && <ContactsTab />}
        {activeTab === 'dispatch' && <DispatchTab />}
        {activeTab === 'responses' && <ResponsesTab />}
      </main>
    </div>
  );
}

/* ===================== CONTATOS ===================== */
function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('Todos');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importGroup, setImportGroup] = useState('Geral');
  const [importResult, setImportResult] = useState('');
  const [loading, setLoading] = useState(false);

  // Estado para Edição Inline e Seleção em Massa de Contatos
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [directSendTarget, setDirectSendTarget] = useState<{ show: boolean; contact?: Contact | null }>({ show: false });

  // Seleção e Operações em Massa
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkGroupName, setBulkGroupName] = useState('');
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedGroup !== 'Todos') params.set('group', selectedGroup);
    if (search) params.set('search', search);

    try {
      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setContacts(data);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [selectedGroup, search]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups');
      const data = await res.json();
      if (Array.isArray(data)) setGroups(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchContacts();
    fetchGroups();
  }, [fetchContacts, fetchGroups]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === contacts.length && contacts.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map((c) => c.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkUpdateGroup = async () => {
    if (selectedIds.length === 0 || !bulkGroupName.trim()) return;
    setBulkActionLoading(true);

    try {
      const res = await fetch('/api/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, group_name: bulkGroupName.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedIds([]);
        setBulkGroupName('');
        fetchContacts();
        fetchGroups();
      }
    } catch {
      /* ignore */
    }
    setBulkActionLoading(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.length} contato(s) selecionado(s)?`)) return;
    setBulkActionLoading(true);

    try {
      const res = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedIds([]);
        fetchContacts();
        fetchGroups();
      }
    } catch {
      /* ignore */
    }
    setBulkActionLoading(false);
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setLoading(true);
    setImportResult('');

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText, group: importGroup }),
      });
      const data = await res.json();
      setImportResult(data.message || 'Importação concluída.');
      setImportText('');
      fetchContacts();
      fetchGroups();
    } catch {
      setImportResult('Erro na importação.');
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setImportResult('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('group', importGroup || 'Importado');

    try {
      const res = await fetch('/api/contacts/import-file', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setImportResult(data.message);
        fetchContacts();
        fetchGroups();
      } else {
        setImportResult(`❌ ${data.error || 'Erro ao importar arquivo.'}`);
      }
    } catch {
      setImportResult('❌ Erro ao enviar arquivo para o servidor.');
    }
    setUploadingFile(false);
    // Limpar o input de arquivo
    e.target.value = '';
  };

  const handleStartEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setEditName(contact.name || '');
    setEditGroup(contact.group_name || 'Geral');
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await fetch('/api/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editName, group_name: editGroup }),
      });
      setEditingId(null);
      fetchContacts();
      fetchGroups();
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/contacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchContacts();
  };

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            placeholder="Buscar por nome ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchContacts()}
            className="pl-10"
          />
        </div>
        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="w-auto min-w-[140px]"
        >
          <option value="Todos">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button onClick={() => setDirectSendTarget({ show: true, contact: null })} className="btn btn-secondary flex items-center gap-1.5" title="Enviar mensagem rápida para qualquer número ou contato">
          <MessageCircle className="w-4 h-4 text-accent" />
          Envio Avulso
        </button>
        <button onClick={() => setShowImport(!showImport)} className="btn btn-primary">
          <Plus className="w-4 h-4" />
          Importar Contatos
        </button>
      </div>

      {/* Import Panel */}
      {showImport && (
        <div className="glass-card rounded-2xl p-5 space-y-4 glow-border">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Upload className="w-4 h-4 text-accent" />
              Importar Contatos (CSV, vCard ou Texto)
            </h3>
            <span className="text-xs text-muted">
              Aceita <strong>CSV (Google Contacts)</strong>, <strong>.vcf (vCard)</strong> ou <strong>Texto</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Opção 1: Upload de Arquivo */}
            <div className="p-4 rounded-xl border border-border/80 bg-surface/50 space-y-3">
              <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-accent" />
                Opção 1: Subir Arquivo (Google Contacts CSV ou vCard .vcf)
              </div>
              <p className="text-xs text-muted">
                Exporte do <a href="https://contacts.google.com" target="_blank" rel="noreferrer" className="text-accent underline">Google Contatos</a> como CSV ou do seu telefone como .vcf.
              </p>
              <input
                type="file"
                accept=".csv,.vcf,.vcard,.txt"
                onChange={handleFileUpload}
                disabled={uploadingFile}
                className="text-xs file:btn file:btn-secondary file:btn-sm file:mr-3 cursor-pointer"
              />
              {uploadingFile && (
                <div className="text-xs text-accent flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Processando arquivo...
                </div>
              )}
            </div>

            {/* Opção 2: Colar Lista Manual */}
            <div className="p-4 rounded-xl border border-border/80 bg-surface/50 space-y-3">
              <div className="text-xs font-semibold text-foreground">
                Opção 2: Colar Lista de Texto
              </div>
              <textarea
                placeholder={
                  "Cole a lista aqui (um por linha):\nJoão Silva, 21999998888\nMaria Santos, 21988887777\n22977776666"
                }
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={3}
              />
              <button onClick={handleImport} disabled={loading} className="btn btn-primary btn-sm w-full">
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Importar Texto
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              placeholder="Grupo padrão para estes contatos (ex: Google, VIP, Clientes)"
              value={importGroup}
              onChange={(e) => setImportGroup(e.target.value)}
              className="flex-1 text-sm"
            />
          </div>

          {importResult && (
            <div className="text-sm p-3 rounded-lg bg-accent/10 text-accent">{importResult}</div>
          )}
        </div>
      )}

      {/* Barra de Ações em Massa */}
      {selectedIds.length > 0 && (
        <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-accent/30 bg-accent/5 animate-fade-in">
          <div className="flex items-center gap-2 text-sm font-semibold text-accent">
            <CheckCircle className="w-4 h-4" />
            <span>{selectedIds.length} contato(s) selecionado(s)</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl justify-end">
            <input
              type="text"
              list="groups-list"
              placeholder="Digite ou escolha o novo grupo..."
              value={bulkGroupName}
              onChange={(e) => setBulkGroupName(e.target.value)}
              className="text-sm py-1.5 px-3 min-w-[180px] flex-1"
            />
            <datalist id="groups-list">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>

            <button
              onClick={handleBulkUpdateGroup}
              disabled={bulkActionLoading || !bulkGroupName.trim()}
              className="btn btn-primary btn-sm"
              title="Mover todos os selecionados para este grupo"
            >
              {bulkActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Edit2 className="w-3.5 h-3.5" />}
              Mover para Grupo
            </button>

            <button
              onClick={handleBulkDelete}
              disabled={bulkActionLoading}
              className="btn btn-secondary btn-sm text-danger hover:bg-danger/20"
              title="Excluir todos os selecionados"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir ({selectedIds.length})
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="btn btn-secondary btn-sm"
              title="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total" value={contacts.length} />
        <StatCard icon={Hash} label="Grupos" value={groups.length} />
      </div>

      {/* Contact List */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="p-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && selectedIds.length === contacts.length}
                    onChange={handleToggleSelectAll}
                    className="cursor-pointer accent-accent"
                    title="Selecionar Todos"
                  />
                </th>
                <th className="p-4 font-medium">Nome</th>
                <th className="p-4 font-medium">Telefone</th>
                <th className="p-4 font-medium">Grupo</th>
                <th className="p-4 font-medium w-28 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    {loading ? 'Carregando...' : 'Nenhum contato encontrado. Importe seus contatos acima.'}
                  </td>
                </tr>
              ) : (
                contacts.map((c) => {
                  const isEditing = editingId === c.id;
                  const isSelected = selectedIds.includes(c.id);

                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border/50 transition-smooth ${
                        isSelected ? 'bg-accent/10' : 'hover:bg-card-hover'
                      }`}
                    >
                      <td className="p-4 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(c.id)}
                          className="cursor-pointer accent-accent"
                        />
                      </td>
                      <td className="p-4 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="py-1 px-2 text-sm w-full max-w-[200px]"
                            placeholder="Nome do contato"
                            autoFocus
                          />
                        ) : (
                          c.name || <span className="text-muted italic">Sem nome</span>
                        )}
                      </td>

                      <td className="p-4 font-mono text-sm text-muted">{c.phone_e164}</td>

                      <td className="p-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editGroup}
                            onChange={(e) => setEditGroup(e.target.value)}
                            className="py-1 px-2 text-sm w-full max-w-[120px]"
                            placeholder="Grupo"
                          />
                        ) : (
                          <span className="badge badge-sent">{c.group_name}</span>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleSaveEdit(c.id)}
                              title="Salvar"
                              className="p-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-smooth cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              title="Cancelar"
                              className="p-1.5 rounded-lg bg-muted/15 text-muted hover:bg-muted/25 transition-smooth cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setDirectSendTarget({ show: true, contact: c })}
                              title="Enviar Mensagem Direta"
                              className="p-1.5 rounded-lg hover:bg-accent/15 text-muted hover:text-accent transition-smooth cursor-pointer"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStartEdit(c)}
                              title="Editar Nome/Grupo"
                              className="p-1.5 rounded-lg hover:bg-accent/15 text-muted hover:text-accent transition-smooth cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(c.id)}
                              title="Excluir"
                              className="p-1.5 rounded-lg hover:bg-danger/15 text-muted hover:text-danger transition-smooth cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Envio Avulso */}
      {directSendTarget.show && (
        <DirectSendModal
          contact={directSendTarget.contact}
          onClose={() => setDirectSendTarget({ show: false, contact: null })}
        />
      )}
    </div>
  );
}

/* ===================== DISPARO ===================== */
function DispatchTab() {
  const [groups, setGroups] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [groupFilter, setGroupFilter] = useState('Todos');
  const [delayMin, setDelayMin] = useState(15);
  const [delayMax, setDelayMax] = useState(40);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState('');

  useEffect(() => {
    fetch('/api/groups')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setGroups(d))
      .catch(() => {});
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      if (Array.isArray(data)) setCampaigns(data);
    } catch {
      /* ignore */
    }
  };

  const handleCreateAndDispatch = async () => {
    if (!title.trim() || !message.trim()) return;
    setDispatching(true);
    setDispatchResult('');

    try {
      // 1. Cria a campanha
      const campRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message_template: message,
          group_filter: groupFilter,
          delay_min: delayMin,
          delay_max: delayMax,
        }),
      });
      const campaign = await campRes.json();

      if (!campaign.id) {
        setDispatchResult('Erro ao criar campanha: ' + (campaign.error || ''));
        setDispatching(false);
        return;
      }

      setDispatchResult(`Campanha criada! Disparando para ${campaign.total_targets} contatos...`);

      // 2. Inicia o disparo (async — pode demorar)
      const dispatchRes = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      const result = await dispatchRes.json();

      if (result.success) {
        setDispatchResult(
          `✅ Disparo finalizado! ${result.sent} enviados, ${result.failed} erros de ${result.total} contatos.`
        );
      } else {
        setDispatchResult('❌ Erro no disparo: ' + (result.error || ''));
      }

      setTitle('');
      setMessage('');
      fetchCampaigns();
    } catch (err) {
      setDispatchResult('Erro: ' + (err instanceof Error ? err.message : 'Desconhecido'));
    }
    setDispatching(false);
  };

  return (
    <div className="space-y-4">
      {/* Create Campaign */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Rocket className="w-4 h-4 text-accent" />
          Novo Disparo
        </h3>

        <input
          placeholder="Título da campanha (ex: Promoção Agosto)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="relative">
          <textarea
            placeholder={"Mensagem para enviar.\nUse {{primeiro_nome}} para usar apenas o primeiro nome.\n\nEx: Olá {{primeiro_nome}}, tudo bem?"}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <div className="absolute bottom-2 right-2 text-xs text-muted">
            Variáveis: {"{{primeiro_nome}}"} {"{{nome}}"} {"{{grupo}}"} {"{{telefone}}"}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="Todos">Todos os contatos</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted shrink-0" />
            <input
              type="number"
              value={delayMin}
              onChange={(e) => setDelayMin(Number(e.target.value))}
              min={5}
              placeholder="Min (s)"
            />
            <span className="text-muted text-sm">a</span>
            <input
              type="number"
              value={delayMax}
              onChange={(e) => setDelayMax(Number(e.target.value))}
              min={10}
              placeholder="Max (s)"
            />
            <span className="text-muted text-xs shrink-0">seg</span>
          </div>
        </div>

        <button
          onClick={handleCreateAndDispatch}
          disabled={dispatching || !title.trim() || !message.trim()}
          className="btn btn-primary w-full"
        >
          {dispatching ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Disparando...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Criar e Disparar
            </>
          )}
        </button>

        {dispatchResult && (
          <div
            className={`text-sm p-3 rounded-lg ${
              dispatchResult.includes('✅')
                ? 'bg-accent/10 text-accent'
                : dispatchResult.includes('❌')
                ? 'bg-danger/10 text-danger'
                : 'bg-info/10 text-info'
            }`}
          >
            {dispatchResult}
          </div>
        )}
      </div>

      {/* Campaign History */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent" />
            Campanhas Anteriores
          </h3>
          <button onClick={fetchCampaigns} className="btn btn-secondary btn-sm">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>

        {campaigns.length === 0 ? (
          <p className="text-muted text-sm text-center py-6">Nenhuma campanha criada ainda.</p>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className={`p-4 rounded-xl border border-border/50 bg-surface/50 hover:bg-card-hover transition-smooth ${
                  c.status === 'running' ? 'pulse-active' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{c.title}</span>
                  <span className={`badge badge-${c.status}`}>{c.status}</span>
                </div>
                <div className="flex gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {c.total_targets} alvos
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-accent" />
                    {c.sent_count} enviados
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-danger" />
                    {c.failed_count} erros
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-3 h-3 text-info" />
                    {c.responded_count} respostas
                  </span>
                </div>
                {/* Progress bar */}
                {c.total_targets > 0 && (
                  <div className="mt-3 h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(((c.sent_count + c.failed_count) / c.total_targets) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== RESPOSTAS ===================== */
function ResponsesTab() {
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchResponses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (Array.isArray(data)) setLogs(data);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchResponses();
    // Auto-refresh every 15s
    const interval = setInterval(fetchResponses, 15000);
    return () => clearInterval(interval);
  }, [fetchResponses]);

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-accent" />
          Respostas dos Clientes
          <span className="text-xs text-muted">(atualiza automaticamente)</span>
        </h3>
        <button onClick={fetchResponses} className="btn btn-secondary btn-sm">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-muted" />
          <p className="text-muted text-sm">
            Nenhuma resposta recebida ainda.
            <br />
            <span className="text-xs">
              Configure o webhook da Evolution API apontando para{' '}
              <code className="text-accent text-xs">https://seu-dominio.vercel.app/api/webhook</code>
            </span>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="glass-card rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-info/15 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4 text-info" />
                  </div>
                  <div>
                    <span className="text-sm font-medium font-mono">{log.phone_e164}</span>
                    <span className={`badge badge-${log.status} ml-2`}>{log.status}</span>
                  </div>
                </div>
                <span className="text-xs text-muted">
                  {log.response_at ? new Date(log.response_at).toLocaleString('pt-BR') : '—'}
                </span>
              </div>

              {/* Mensagem enviada */}
              <div className="p-3 rounded-lg bg-accent/5 border border-accent/10 text-sm">
                <span className="text-xs text-muted block mb-1">📤 Enviada:</span>
                {log.rendered_message}
              </div>

              {/* Resposta do cliente */}
              {log.response_text && (
                <div className="p-3 rounded-lg bg-info/5 border border-info/10 text-sm">
                  <span className="text-xs text-muted block mb-1">📥 Resposta:</span>
                  {log.response_text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================== STAT CARD ===================== */
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="glass-card rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-accent" />
      </div>
      <div>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}
