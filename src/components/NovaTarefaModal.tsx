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
  tarefaEditando?: any | null; // Recebe a tarefa selecionada para edição
}

export default function NovaTarefaModal({ isOpen, onClose, onSuccess, tarefaEditando }: NovaTarefaModalProps) {
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showNovaTag, setShowNovaTag] = useState(false);
  const [novaTagData, setNovaTagData] = useState({ nome: '', cor: '#3B82F6' });

  // Estado inicial limpo
  const formInicial = {
    titulo: '',
    descricao: '',
    prioridade: 'media',
    data_vencimento: new Date().toISOString().split('T')[0],
    escola: '',
    tag_id: ''
  };

  const [formData, setFormData] = useState(formInicial);

  // ESTA É A CHAVE: Sincroniza os dados sempre que o modal abre ou a tarefa muda
  useEffect(() => {
    if (isOpen) {
      if (tarefaEditando) {
        // Se estiver editando, preenche com os dados da tarefa
        setFormData({
          titulo: tarefaEditando.titulo || '',
          descricao: tarefaEditando.descricao || '',
          prioridade: tarefaEditando.prioridade || 'media',
          data_vencimento: tarefaEditando.data_vencimento || new Date().toISOString().split('T')[0],
          escola: tarefaEditando.escola || '',
          tag_id: tarefaEditando.tag_id || ''
        });
      } else {
        // Se for uma nova tarefa, garante que o formulário comece limpo
        setFormData(formInicial);
      }
      carregarTags();
    }
  }, [isOpen, tarefaEditando]);

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

    if (error) {
      console.error('Erro ao criar tag:', error);
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
      if (!user) throw new Error('Sessão expirada.');

      const payload = { 
        ...formData, 
        usuario_id: user.id, 
        tag_id: formData.tag_id || null 
      };

      if (tarefaEditando) {
        // Lógica de Atualização (Update)
        const { error } = await supabase
          .from('tarefas_pessoais')
          .update(payload)
          .eq('id', tarefaEditando.id);
        if (error) throw error;
      } else {
        // Lógica de Criação (Insert)
        const { error } = await supabase
          .from('tarefas_pessoais')
          .insert([{ ...payload, status: 'pendente' }]);
        if (error) throw error;
      }
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Falha ao salvar:', error);
      alert('Erro ao processar demanda.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">
            {tarefaEditando ? 'Editar Demanda' : 'Nova Demanda'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1 tracking-wider">Título</label>
            <input 
              required 
              className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition"
              value={formData.titulo} 
              onChange={e => setFormData({ ...formData, titulo: e.target.value })} 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1 tracking-wider">Descrição / Detalhes</label>
            <textarea 
              className="w-full p-3 border border-gray-200 rounded-xl outline-none h-24 resize-none focus:ring-2 focus:ring-blue-500 transition"
              value={formData.descricao} 
              onChange={e => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descreva os detalhes da demanda..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1 flex items-center gap-1 tracking-wider">
                <School size={14} /> Escola
              </label>
              <input 
                className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition"
                value={formData.escola} 
                onChange={e => setFormData({ ...formData, escola: e.target.value })} 
                placeholder="Unidade escolar..."
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1 tracking-wider">Data Limite</label>
              <input 
                type="date" 
                required 
                className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition"
                value={formData.data_vencimento} 
                onChange={e => setFormData({ ...formData, data_vencimento: e.target.value })} 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1 tracking-wider">Prioridade</label>
              <select 
                className="w-full p-3 border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition"
                value={formData.prioridade} 
                onChange={e => setFormData({ ...formData, prioridade: e.target.value })}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1 flex items-center gap-1 tracking-wider">
                <TagIcon size={14} /> Etiqueta
              </label>
              <div className="flex gap-2">
                <select 
                  className="flex-1 p-3 border border-gray-200 rounded-xl outline-none bg-white focus:ring-2 focus:ring-blue-500 transition text-sm"
                  value={formData.tag_id} 
                  onChange={e => setFormData({ ...formData, tag_id: e.target.value })}
                >
                  <option value="">Sem tag</option>
                  {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.nome}</option>)}
                </select>
                <button 
                  type="button" 
                  onClick={() => setShowNovaTag(!showNovaTag)} 
                  className="p-3 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
                >
                  <PlusCircle size={20} className="text-gray-600" />
                </button>
              </div>
            </div>
          </div>

          {showNovaTag && (
            <div className="p-4 bg-blue-50 rounded-xl flex items-end gap-3 border border-blue-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-blue-700 uppercase mb-1">Nome da Tag</label>
                <input 
                  className="w-full p-2 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                  value={novaTagData.nome} 
                  onChange={e => setNovaTagData({...novaTagData, nome: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-blue-700 uppercase mb-1">Cor</label>
                <input 
                  type="color" 
                  className="h-10 w-12 border border-blue-200 rounded-lg cursor-pointer" 
                  value={novaTagData.cor} 
                  onChange={e => setNovaTagData({...novaTagData, cor: e.target.value})}
                />
              </div>
              <button 
                type="button" 
                onClick={criarTag} 
                className="bg-blue-600 text-white px-4 h-10 rounded-lg font-bold text-xs hover:bg-blue-700 transition"
              >
                Salvar
              </button>
            </div>
          )}

          <div className="pt-4">
            <button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-100 disabled:opacity-50 hover:bg-blue-700 transition"
            >
              {loading ? 'Processando...' : (tarefaEditando ? 'Salvar Alterações' : 'Criar Demanda')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}