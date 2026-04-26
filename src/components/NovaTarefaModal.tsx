import React, { useState, useEffect } from 'react';
import { X, Tag as TagIcon, School, PlusCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Tag {
  id: string;
  nome: string;
  cor: string;
}

interface NovaTarefaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tarefaEditando?: any | null; // <--- É esta linha que o TypeScript está sentindo falta!
}

export default function NovaTarefaModal({ isOpen, onClose, onSuccess }: NovaTarefaModalProps) {
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showNovaTag, setShowNovaTag] = useState(false);
  const [novaTagData, setNovaTagData] = useState({ nome: '', cor: '#3B82F6' });

  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    prioridade: 'media',
    data_vencimento: new Date().toISOString().split('T')[0],
    escola: '',
    tag_id: ''
  });

  useEffect(() => {
    if (isOpen) carregarTags();
  }, [isOpen]);

  const carregarTags = async () => {
    const { data, error } = await supabase.from('tags_pessoais').select('*').order('nome');
    if (error) {
      console.error('Erro ao carregar tags:', error);
      return;
    }
    if (data) setTags(data);
  };

  const criarTag = async () => {
    if (!novaTagData.nome) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('tags_pessoais')
      .insert([{ ...novaTagData, usuario_id: user.id }])
      .select()
      .single();

    // CORREÇÃO: Agora o 'error' é tratado e exibe a falha no console
    if (error) {
      console.error('Erro ao criar tag no Supabase:', error);
      alert('Não foi possível criar a etiqueta.');
      return;
    }

    if (data) {
      setTags([...tags, data]);
      setFormData({ ...formData, tag_id: data.id });
      setShowNovaTag(false);
      setNovaTagData({ nome: '', cor: '#3B82F6' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');

      const { error } = await supabase.from('tarefas_pessoais').insert([
        { 
          ...formData, 
          usuario_id: user.id, 
          status: 'pendente', 
          tag_id: formData.tag_id || null 
        }
      ]);

      if (error) throw error;
      
      onSuccess();
      onClose();
      
      // Reseta o formulário após sucesso
      setFormData({
        titulo: '',
        descricao: '',
        prioridade: 'media',
        data_vencimento: new Date().toISOString().split('T')[0],
        escola: '',
        tag_id: ''
      });
      
    } catch (error) {
      // CORREÇÃO: Agora o 'error' do catch é lido e exibido
      console.error('Falha ao salvar a demanda:', error);
      alert('Erro ao salvar demanda. Verifique a conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">Nova Demanda de Trabalho</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Título da Demanda</label>
            <input required className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.titulo} onChange={e => setFormData({ ...formData, titulo: e.target.value })} 
              placeholder="Ex: Vistoria na escola..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1 flex items-center gap-1">
                <School size={14} /> Unidade Escolar
              </label>
              <input className="w-full p-3 border rounded-xl outline-none" placeholder="Ex: E.E. Brasil"
                value={formData.escola} onChange={e => setFormData({ ...formData, escola: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Data Limite</label>
              <input type="date" required className="w-full p-3 border rounded-xl outline-none"
                value={formData.data_vencimento} onChange={e => setFormData({ ...formData, data_vencimento: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1 flex items-center gap-1">
              <TagIcon size={14} /> Etiqueta (Tag)
            </label>
            <div className="flex gap-2">
              <select className="flex-1 p-3 border rounded-xl outline-none bg-white"
                value={formData.tag_id} onChange={e => setFormData({ ...formData, tag_id: e.target.value })}>
                <option value="">Sem etiqueta</option>
                {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.nome}</option>)}
              </select>
              <button type="button" onClick={() => setShowNovaTag(!showNovaTag)} 
                className="p-3 bg-gray-100 rounded-xl hover:bg-gray-200 transition" title="Criar nova etiqueta">
                <PlusCircle size={20} className="text-gray-600" />
              </button>
            </div>
          </div>

          {showNovaTag && (
            <div className="p-4 bg-blue-50 rounded-xl flex items-end gap-3 border border-blue-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-blue-700 uppercase mb-1">Nome da Tag</label>
                <input className="w-full p-2 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                  value={novaTagData.nome} onChange={e => setNovaTagData({...novaTagData, nome: e.target.value})} placeholder="Ex: URGENTE"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-blue-700 uppercase mb-1">Cor</label>
                <input type="color" className="h-10 w-12 border border-blue-200 rounded-lg cursor-pointer" 
                  value={novaTagData.cor} onChange={e => setNovaTagData({...novaTagData, cor: e.target.value})}/>
              </div>
              <button type="button" onClick={criarTag} 
                className="bg-blue-600 text-white px-4 h-10 rounded-lg font-bold text-xs hover:bg-blue-700 transition">
                Salvar Tag
              </button>
            </div>
          )}

          <div className="pt-2">
            <button type="submit" disabled={loading} 
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-200 disabled:opacity-50 hover:bg-blue-700 transition">
              {loading ? 'Processando...' : 'Confirmar Demanda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}