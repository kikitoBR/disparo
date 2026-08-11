'use client';

import { useState, useEffect, useCallback } from 'react';
import { Folder, Edit2, Trash2, Check, X, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';

interface GroupDetail {
  name: string;
  count: number;
}

interface ManageGroupsModalProps {
  onClose: () => void;
  onGroupsUpdated: () => void;
}

export function ManageGroupsModal({ onClose, onGroupsUpdated }: ManageGroupsModalProps) {
  const [groups, setGroups] = useState<GroupDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<GroupDetail | null>(null);
  const [deleteAction, setDeleteAction] = useState<'reassign' | 'delete_contacts'>('reassign');
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);

  const fetchGroupsDetails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/groups?details=true');
      const data = await res.json();
      if (Array.isArray(data)) {
        setGroups(data);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGroupsDetails();
  }, [fetchGroupsDetails]);

  const handleStartRename = (group: GroupDetail) => {
    setEditingGroup(group.name);
    setNewGroupName(group.name);
  };

  const handleSaveRename = async (oldName: string) => {
    if (!newGroupName.trim() || newGroupName.trim() === oldName) {
      setEditingGroup(null);
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: oldName, new_name: newGroupName.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({ success: true, text: data.message });
        setEditingGroup(null);
        fetchGroupsDetails();
        onGroupsUpdated();
      } else {
        setFeedback({ success: false, text: data.error || 'Erro ao renomear grupo.' });
      }
    } catch {
      setFeedback({ success: false, text: 'Erro de conexão com o servidor.' });
    }
    setSaving(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingGroup) return;

    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deletingGroup.name,
          action: deleteAction,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({ success: true, text: data.message });
        setDeletingGroup(null);
        fetchGroupsDetails();
        onGroupsUpdated();
      } else {
        setFeedback({ success: false, text: data.error || 'Erro ao remover grupo.' });
      }
    } catch {
      setFeedback({ success: false, text: 'Erro de conexão com o servidor.' });
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass-card w-full max-w-lg rounded-2xl p-6 space-y-5 border border-border shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3 shrink-0">
          <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
            <Folder className="w-5 h-5 text-accent" />
            Gerenciar Grupos de Contatos
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-smooth cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-sm flex items-center gap-2 shrink-0 ${
              feedback.success
                ? 'bg-accent/15 text-accent border border-accent/20'
                : 'bg-danger/15 text-danger border border-danger/20'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Delete Confirmation Modal Overlay */}
        {deletingGroup ? (
          <div className="p-4 rounded-xl border border-danger/40 bg-danger/10 space-y-4 animate-fade-in shrink-0">
            <div className="flex items-center gap-2 font-semibold text-danger text-sm">
              <ShieldAlert className="w-5 h-5" />
              <span>Remover Grupo &quot;{deletingGroup.name}&quot; ({deletingGroup.count} contatos)</span>
            </div>

            <p className="text-xs text-muted">
              O que você deseja fazer com os {deletingGroup.count} contato(s) deste grupo?
            </p>

            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card cursor-pointer hover:bg-card-hover">
                <input
                  type="radio"
                  name="deleteAction"
                  checked={deleteAction === 'reassign'}
                  onChange={() => setDeleteAction('reassign')}
                  className="accent-accent"
                />
                <div>
                  <div className="font-semibold text-foreground">Mover para o grupo &quot;Geral&quot; (Recomendado)</div>
                  <div className="text-muted text-[11px]">Os contatos não serão apagados, apenas desassociados deste grupo.</div>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-danger/30 bg-danger/5 cursor-pointer hover:bg-danger/10">
                <input
                  type="radio"
                  name="deleteAction"
                  checked={deleteAction === 'delete_contacts'}
                  onChange={() => setDeleteAction('delete_contacts')}
                  className="accent-danger"
                />
                <div>
                  <div className="font-semibold text-danger">Excluir todos os {deletingGroup.count} contatos permanentemente</div>
                  <div className="text-muted text-[11px]">Os contatos serão removidos totalmente do banco de dados.</div>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingGroup(null)}
                disabled={saving}
                className="btn btn-secondary btn-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={saving}
                className="btn btn-primary btn-sm bg-danger hover:bg-danger/80 text-white"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Confirmar Remoção
              </button>
            </div>
          </div>
        ) : (
          /* List of Groups */
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="p-8 text-center text-muted text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Carregando grupos...
              </div>
            ) : groups.length === 0 ? (
              <div className="p-8 text-center text-muted text-sm">
                Nenhum grupo encontrado.
              </div>
            ) : (
              groups.map((group) => {
                const isEditing = editingGroup === group.name;

                return (
                  <div
                    key={group.name}
                    className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-surface/50 hover:bg-surface transition-smooth"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                      <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                        <Folder className="w-4 h-4" />
                      </div>

                      {isEditing ? (
                        <input
                          type="text"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(group.name)}
                          className="py-1 px-2.5 text-sm w-full max-w-[220px]"
                          autoFocus
                        />
                      ) : (
                        <div className="truncate">
                          <span className="font-semibold text-sm text-foreground">{group.name}</span>
                          <span className="text-xs text-muted ml-2 font-mono">({group.count} contatos)</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSaveRename(group.name)}
                            disabled={saving}
                            title="Salvar Novo Nome"
                            className="p-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-smooth cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingGroup(null)}
                            title="Cancelar"
                            className="p-1.5 rounded-lg bg-muted/15 text-muted hover:bg-muted/25 transition-smooth cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartRename(group)}
                            title="Renomear Grupo"
                            className="p-1.5 rounded-lg hover:bg-accent/15 text-muted hover:text-accent transition-smooth cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingGroup(group)}
                            title="Excluir ou Desassociar Grupo"
                            className="p-1.5 rounded-lg hover:bg-danger/15 text-muted hover:text-danger transition-smooth cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-border/60 shrink-0">
          <button onClick={onClose} className="btn btn-secondary text-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
