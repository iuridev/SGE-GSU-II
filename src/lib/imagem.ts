// Reduz a imagem no navegador: foto de celular passa de 5 MB, o limite do bucket.
export async function comprimirImagem(origem: Blob, maxLado: number, qualidade = 0.8) {
  const url = URL.createObjectURL(origem);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      el.src = url;
    });

    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const largura = Math.round(img.naturalWidth * escala);
    const altura = Math.round(img.naturalHeight * escala);

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível processar a imagem.');
    ctx.fillStyle = '#fff'; // PNG transparente ficaria preto no JPEG
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(img, 0, 0, largura, altura);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem.'))),
        'image/jpeg',
        qualidade,
      );
    });
    return { blob, largura, altura };
  } finally {
    URL.revokeObjectURL(url);
  }
}
