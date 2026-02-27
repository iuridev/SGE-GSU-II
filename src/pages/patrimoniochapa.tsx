import React, { useState, useEffect } from 'react';
import { Package, Save, Building, FileText, DollarSign, ListOrdered } from 'lucide-react';
import { supabase } from '../lib/supabase'; 

export default function AdicionarItemAoPatrimonio() {
  const [formData, setFormData] = useState({
    descricao: '',
    escola: '',
    nf: '',
    valor: '',
    quantidade: 1 // Valor padrão é 1
  });

  const [escolas, setEscolas] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchEscolas() {
      try {
        const { data } = await supabase.from('schools').select('name').order('name');
        if (data) setEscolas(data.map((escola: { name: string }) => escola.name));
      } catch (error: any) {
        console.error("Erro ao carregar escolas:", error);
      }
    }
    fetchEscolas();
  }, []);

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('salvar-patrimonio-planilha', {
        body: { ...formData, valor: parseFloat(formData.valor), quantidade: parseInt(formData.quantidade.toString()) }
      });

      if (error) throw error;

      // Se a função do Supabase retornar que teve um erro, mostramos a mensagem real
      if (data && data.erroReal) {
        alert("O SUPABASE RETORNOU UM ERRO:\n" + data.erroReal);
        setIsSubmitting(false);
        return;
      }

      alert(`${formData.quantidade} item(ns) gravado(s) com sucesso na Planilha!`);
      setFormData({ descricao: '', escola: '', nf: '', valor: '', quantidade: 1 });

    } catch (error: any) {
      console.error("Erro no sistema:", error);
      alert("ERRO DE CONEXÃO:\n" + (error.message || JSON.stringify(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-2xl mx-auto mt-8">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
          <Package size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Chapa Patrimonial</h2>
          <p className="text-sm text-slate-500">Cadastro em lote para a planilha excel.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
            <Package size={16} className="text-slate-400" /> Descrição do Item
          </label>
          <input 
            type="text" required
            value={formData.descricao}
            onChange={(e) => setFormData({...formData, descricao: e.target.value})}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Ex: Computador Desktop Dell"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
              <Building size={16} className="text-slate-400" /> Escola / Unidade
            </label>
            <select 
              required
              value={formData.escola}
              onChange={(e) => setFormData({...formData, escola: e.target.value})}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Selecione...</option>
              {escolas.map((nome, i) => <option key={i} value={nome}>{nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
              <FileText size={16} className="text-slate-400" /> Nota Fiscal (NF)
            </label>
            <input 
              type="text" required
              value={formData.nf}
              onChange={(e) => setFormData({...formData, nf: e.target.value})}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
              <DollarSign size={16} className="text-slate-400" /> Valor Unitário
            </label>
            <input 
              type="number" step="0.01" required
              value={formData.valor}
              onChange={(e) => setFormData({...formData, valor: e.target.value})}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2 text-blue-600">
              <ListOrdered size={16} /> Quantidade de Itens
            </label>
            <input 
              type="number" min="1" max="100" required
              value={formData.quantidade}
              onChange={(e) => setFormData({...formData, quantidade: parseInt(e.target.value)})}
              className="w-full p-2.5 bg-blue-50 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold"
            />
          </div>
        </div>

        <div className="pt-4 mt-6 border-t border-slate-100 flex justify-end">
          <button 
            type="submit" disabled={isSubmitting}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            <Save size={20} />
            {isSubmitting ? 'Gravando Lote...' : 'Salvar no Patrimônio'}
          </button>
        </div>
      </form>
    </div>
  );
}