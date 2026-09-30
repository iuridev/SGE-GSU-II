/**
 * Recebe os anexos (PDF/imagem) da Fiscalização de Elevadores e grava na pasta
 * do Google Drive da conta sefiscgsu@gmail.com.
 *
 * Por que Apps Script: a pasta é de uma conta Gmail pessoal, e contas de serviço
 * não têm cota de armazenamento — só conseguem gravar em Drive Compartilhado.
 * Publicado como a própria sefiscgsu, o script grava usando a cota dela.
 *
 * Quem chama é só a Edge Function google-sheets-fiscalizacao-elevadores, que já
 * validou o usuário. Nada de ID de pasta ou token fica no código:
 *
 * Configuração (logado como sefiscgsu@gmail.com, em script.google.com):
 *   1. Novo projeto → cole este arquivo.
 *   2. Configurações do projeto → Propriedades do script:
 *        FOLDER_ID    = ID da pasta (o trecho depois de /folders/ no link)
 *        UPLOAD_TOKEN = um segredo longo e aleatório (o mesmo do secret
 *                       FISCALIZACAO_ELEVADORES_ANEXOS_TOKEN no Supabase)
 *   3. No editor, selecione a função autorizar e clique em Executar: o Google
 *      pede a permissão de acesso ao Drive (sem isso o app responde
 *      "Acesso negado: DriveApp").
 *   4. Implantar → Nova implantação → App da Web
 *        Executar como: Eu (sefiscgsu@gmail.com)
 *        Quem pode acessar: Qualquer pessoa
 *      Autorize o acesso ao Drive e copie a URL /exec para o secret
 *      FISCALIZACAO_ELEVADORES_ANEXOS_SCRIPT_URL no Supabase.
 */

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const body = JSON.parse(e.postData.contents);

    const token = props.getProperty('UPLOAD_TOKEN');
    if (!token || body.token !== token) return json_({ error: 'Não autorizado.' });

    const folderId = props.getProperty('FOLDER_ID');
    if (!folderId) return json_({ error: 'FOLDER_ID não configurado no Apps Script.' });
    if (!body.base64 || !body.mimeType || !body.fileName) return json_({ error: 'Arquivo inválido.' });

    let etapa = 'abrir a pasta';
    try {
      const raiz = DriveApp.getFolderById(folderId);
      etapa = 'criar a subpasta da escola';
      const pasta = subpasta_(raiz, body.pasta);
      etapa = 'gravar o arquivo';
      const blob = Utilities.newBlob(Utilities.base64Decode(body.base64), body.mimeType, body.fileName);
      const file = pasta.createFile(blob);

      // Link de visualização para a URE abrir o anexo sem logar na conta sefiscgsu.
      // Algumas contas Gmail bloqueiam o compartilhamento por link: nesse caso o
      // arquivo fica gravado assim mesmo, visível só para quem tem acesso à pasta.
      let aviso = null;
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (errShare) {
        aviso = 'Arquivo gravado, mas o link público foi bloqueado: ' + errShare.message;
      }
      return json_({ id: file.getId(), aviso: aviso });
    } catch (errDrive) {
      throw new Error('Falha ao ' + etapa + ': ' + errDrive.message);
    }
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

// Uma subpasta por escola; o lock evita criar duas iguais em envios simultâneos.
function subpasta_(raiz, nome) {
  if (!nome) return raiz;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const it = raiz.getFoldersByName(nome);
    return it.hasNext() ? it.next() : raiz.createFolder(nome);
  } finally {
    lock.releaseLock();
  }
}

// Rodar uma vez pelo editor para conceder a permissão do Drive (cria e apaga
// um arquivo de teste na pasta, o que também confirma o FOLDER_ID).
function autorizar() {
  const pasta = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  pasta.createFile('teste-permissao.txt', 'ok').setTrashed(true);
  Logger.log('OK — acesso à pasta "' + pasta.getName() + '" autorizado.');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
