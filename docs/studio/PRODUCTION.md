# Produção de mídia

A produção usa os materiais e a identidade salvos no projeto. A aprovação do roteiro libera a montagem. Depois de produzir, confira vídeo, voz, legenda e capa antes de anexar e aprovar o pacote de distribuição.

## Voz e áudio

- **Áudio gravado:** cada cena pode receber um arquivo da biblioteca, com origem e direito de uso registrados. Esse arquivo tem prioridade sobre a voz configurada.
- **OpenAI:** gera a narração das cenas sem áudio gravado, usando a chave do servidor. A ação pode ter cobrança. O worker não repete automaticamente uma geração de voz que falhou.
- **Voz local:** usa `espeak-ng`, incluído no Dockerfile do fork, com português brasileiro, inglês ou espanhol. Não requer uma API de voz. É uma síntese simples; escute a prévia para decidir se a qualidade serve à peça final.

A orientação de pronúncia é um campo separado. A legenda usa o texto de narração. Cada cena gerada aceita até 4.096 caracteres de fala. O vídeo composto tem limite de quinze minutos; uma produção pode selecionar apenas parte das cenas e limitar sua duração, inclusive a trinta segundos para Story.

O endpoint de capacidades verifica FFmpeg, ffprobe e a presença local de espeak-ng. O worker e a API devem usar a mesma imagem e configuração. Uma chave OpenAI configurada não comprova saldo ou acesso ao modelo.

## Identidade e imagens

A identidade pode guardar nome da marca, duas cores e uma das famílias tipográficas DejaVu Sans, Serif e Mono. Esses parâmetros são usados nas cartelas, nas capas e nos materiais de marca. O campo de estilo livre continua disponível para orientação editorial.

| Produção | Arquivos |
|---|---|
| Direções de marca | Três cartelas para comparação. |
| Conjunto de marca | Logo transparente 1200×320, avatar 800×800, banner 2560×1440 e marca d'água transparente 150×150, a partir de uma direção geométrica escolhida. |
| Capas por quadro | Três imagens a partir de quadros em 20%, 50% e 80% da duração do vídeo escolhido, em formato vertical ou horizontal. Até três palavras são sobrepostas para revisão. |
| Capas tipográficas | Três composições horizontais com texto e variações de cor. |
| Carrossel | Até dez imagens quadradas, seguindo a ordem das cenas. |

O banner mantém a marca e o texto dentro de um retângulo central conservador de 1235×338. A documentação oficial do YouTube informa a dimensão recomendada de 2560×1440 e a área de segurança de 1235×338 na dimensão mínima de upload. O arquivo precisa ser conferido na prévia do canal, que aplica cortes por dispositivo. [Fonte: orientações de marca do YouTube](https://support.google.com/youtube/answer/10456525?hl=pt-BR).

O conjunto de marca usa formas geométricas e tipografia. Ele oferece alternativas de composição e arquivos utilizáveis; a escolha da identidade e a verificação de conflito com marcas existentes continuam com o responsável pelo canal. O envio desses arquivos para o perfil e o banner da rede é uma ação posterior no canal.

As capas por quadro preservam o registro de licença e a referência da mídia de origem. Os quadros são amostras distribuídas no vídeo, não uma seleção automática da expressão ou imagem com maior capacidade de gerar cliques. A aplicação da capa depende do suporte do provedor, especialmente para vídeos curtos; confira a prévia na rede.

## Música e efeitos

Uma música da biblioteca pode acompanhar a narração em volume reduzido. O projeto também oferece vinte efeitos procedurais próprios: cliques, toques, sinais, sinos, pulsos e transições. A escolha é opcional por cena e o padrão é nenhum efeito. O efeito entra no início da cena, com volume baixo, preservando a duração do áudio principal. Não há seleção automática baseada no significado da narração.

## Processamento e limites

Os arquivos finais são MP4 com vídeo H.264 e áudio AAC, nas dimensões 1080×1920, 1920×1080 ou 1080×1080. O worker limita a montagem a dois vídeos simultâneos por processo. Imagens, vídeos e áudios fornecidos precisam pertencer à organização e estar prontos na biblioteca; o limite de leitura por arquivo é 256 MB.

O processamento mede a duração real de cada áudio. As legendas são distribuídas proporcionalmente dentro de cada cena e exportadas em SRT, além de incorporadas ao vídeo. Esse método não oferece alinhamento palavra a palavra. A inspeção de referência mede dimensões, taxa de quadros, duração, estimativa de cortes e média de cor do primeiro quadro; seus resultados mantêm método e limitações.

Para a distribuição automática, uma inspeção separada mede o vídeo final e calcula SHA-256 dos seus bytes. Isso permite conferir duração, orientação e alteração do material entre planejamento e envio.

## Referências e verificação

- [eSpeak NG: português e geração de arquivo WAV](https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages/roa/pt.md).
- [YouTube: perfil, banner e marca d'água](https://support.google.com/youtube/answer/10456525?hl=pt-BR).
- [Testes reais de montagem, imagens e inspeção](../../libraries/nestjs-libraries/src/studio/studio.production.spec.ts).
- [Síntese dos efeitos e limites de áudio](../../libraries/nestjs-libraries/src/studio/studio.sound-effects.spec.ts).
- [Registro da validação realizada](VERIFICATION.md).
