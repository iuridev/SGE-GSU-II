import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Tratamento de CORS para o navegador não bloquear a requisição
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. LER O CORPO DA REQUISIÇÃO COM SEGURANÇA
    const bodyText = await req.text()
    if (!bodyText) {
      throw new Error('O corpo da requisição chegou vazio na Edge Function.')
    }
    
    const { targetUserId, newPassword } = JSON.parse(bodyText)

    if (!targetUserId || !newPassword) {
      throw new Error('Faltam parâmetros: targetUserId ou newPassword não foram enviados.')
    }

    // 2. VALIDAR QUEM ESTÁ PEDINDO A ALTERAÇÃO
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) throw new Error('Usuário não autorizado a fazer requisições.')

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'regional_admin') {
      throw new Error('Acesso negado: Apenas administradores regionais podem alterar senhas.')
    }

    // 3. ALTERAR A SENHA USANDO A CHAVE MESTRA (SERVICE_ROLE)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    )

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ message: "Senha atualizada com sucesso!" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    // Agora, se der erro, ele devolve a mensagem exata para o seu console do frontend
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})