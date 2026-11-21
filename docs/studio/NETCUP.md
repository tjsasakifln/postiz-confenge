# Estúdio CONFENGE na Netcup

O endereço da operação é [postiz.confenge.com.br/studio](https://postiz.confenge.com.br/studio). O ambiente atende a uma única organização. O proxy exige uma sessão do Postiz para qualquer arquivo em `/uploads/`.

## Criar e revisar na mesma tela

Escolha o tema e o formato na entrada do Estúdio. O carrossel tem quatro peças de 1080 × 1350 px e o post quadrado tem uma peça de 1080 × 1080 px. A tela aplica o logotipo, a tipografia Archivo e a paleta do site. Rede, público e objetivo têm valores iniciais editáveis.

**Sugerir com base no histórico** analisa até 12 conteúdos recentes do Estúdio e propõe temas, formatos e redes entre Instagram e LinkedIn. O histórico distingue registro de publicação de conteúdo preparado. **Aprovar e gerar** cria uma peça revisável. Na prévia, edite a legenda e o texto de cada imagem. **Baixar pacote** salva a revisão e exporta PNGs numerados e legenda no mesmo ZIP. Use **Estúdio avançado** para vídeo, mídias e os fluxos anteriores.

Para atualizar a aplicação a partir da imagem-base já instalada, `deploy/netcup/Dockerfile.editor-build` compila interface e API fora da Netcup e exporta os artefatos com `docker buildx build --output type=local,dest=<diretório>`. Use os argumentos públicos `NEXT_PUBLIC_BACKEND_URL` e `NEXT_PUBLIC_VERSION` abaixo. Transfira a pasta exportada e construa a imagem com `Dockerfile.editor-runtime`, apontando o contexto para os artefatos e passando `SOURCE_REVISION`. Preserve a imagem e o `.env` anteriores antes de atualizar a tag. As imagens e cores têm como referência o site da CONFENGE. A licença OFL acompanha Archivo.

Instale os arquivos exportados em `brand/` no diretório `/var/www/postiz-confenge-brand/` com leitura para o Nginx. O virtual host serve esses arquivos também na tela de login. Valide a configuração e faça uma cópia do virtual host antes de recarregar.

## Conteúdo para publicação manual

1. Crie um conteúdo e salve o tema, público, objetivo e a identidade. Você pode registrar a fonte diretamente no Estúdio.
2. Escreva ou sugira o roteiro e revise as cenas. Aprove a identidade e o roteiro para liberar a produção.
3. Em **Produção**, crie o carrossel a partir do roteiro ou escolha o formato de vídeo e a voz. Confira a prévia e anexe o vídeo concluído ao projeto.
4. Em **Pacotes**, escolha o canal, edite a legenda e selecione os arquivos na ordem desejada. Use **Copiar texto do post** e os links **Baixar** em **Publicar manualmente**.

Texto por IA usa `OPENAI_API_KEY` e `STUDIO_TEXT_MODEL`. Voz OpenAI usa a mesma chave e `STUDIO_TTS_MODEL`. Os projetos podem usar roteiro digitado, áudio gravado ou voz local eSpeak NG. Capas e carrosséis são compostos localmente.

## Build e atualização

Construa em Linux x86-64 fora da Netcup. A camada de dependências usa o lockfile e a versão de Node do repositório. Passe apenas URLs públicas, versão e commit como argumentos de build.

```bash
rev=$(git rev-parse HEAD)
docker build -f Dockerfile.dev \
  --build-arg SOURCE_REVISION="$rev" \
  --build-arg NEXT_PUBLIC_VERSION="${rev:0:12}" \
  --build-arg NEXT_PUBLIC_BACKEND_URL=https://postiz.confenge.com.br/api \
  --build-arg STORAGE_PROVIDER=local \
  -t "postiz-confenge:$rev" .
docker save "postiz-confenge:$rev" | gzip -1 | ssh ec-prod 'docker load'
```

Confira o ID local e o ID carregado com `docker image inspect --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}' postiz-confenge:SHA`.

O diretório de operação é `/opt/postiz-confenge`. Copie os arquivos de `deploy/netcup` para ele e restrinja a pasta a root. O Compose desta pasta é autônomo. A combinação dos dois arquivos de exemplo instala serviços administrativos e publica portas adicionais, então serve somente para desenvolvimento.

Na primeira instalação, execute `bash initialize-secrets.sh` no diretório de operação. Ele gera as senhas e o JWT dentro de `private/`. Mantenha esses arquivos no servidor, com modo `0600`. Grave `POSTIZ_IMAGE=postiz-confenge:SHA` em `.env`; a imagem deve estar carregada localmente. Antes de subir o Estúdio, rode `bash prepare-temporal.sh` para registrar os atributos de busca por ID compatíveis com a visibilidade SQL.

Antes de atualizar, rode o backup e preserve o valor anterior de `POSTIZ_IMAGE` e as configurações efetivas. Use `docker compose config --quiet` para validar sem imprimir credenciais. Aplique com `docker compose up -d --wait`. A inicialização aplica o schema Prisma sem aceitar perda de dados e o PM2 supervisiona proxy interno, API, interface e worker.

Faça a criação inicial do titular pelo loopback antes de abrir o virtual host. Use `python3 create-owner.py --email titular@example.org --organization CONFENGE`. O script valida o login e guarda a senha inicial em `private/.owner-bootstrap`. Depois de transferir a senha ao cofre do titular e confirmar a entrada, apague o arquivo temporário. `DISABLE_REGISTRATION=true` fecha o cadastro depois da primeira organização. O virtual host também bloqueia a rota pública de cadastro. Preserve contas existentes em atualizações.

Use o virtual host `postiz.nginx.conf` do repositório com o certificado próprio e confirme a configuração com `nginx -t` antes de recarregar. O log do Postiz exclui os parâmetros de URL e o proxy bloqueia a navegação nativa dos formulários de autenticação. O login da interface usa a API por JavaScript. A origem do host fica no Nginx existente e o único mapeamento do Compose é `127.0.0.1:18407`. O registro DNS do subdomínio aponta para a origem pela Cloudflare.

PostgreSQL, Redis e Temporal usam redes e volumes exclusivos. O Temporal usa PostgreSQL para persistência e visibilidade. `STUDIO_MANUAL_ONLY=true` limita o único worker a uma atividade por vez e mantém as filas sociais e de e-mail inativas. A CPU e a memória de cada contêiner têm limites no Compose.

## Chave de geração

Transfira a chave pelo SSH no stdin de `/opt/postiz-confenge/set-openai-key.py`, usando um prompt oculto ou um gerenciador de segredos local. Depois recrie somente a aplicação com `docker compose up -d --no-deps studio`. Confira a capacidade com uma geração curta autenticada e registre tanto sucesso quanto erro do provedor. A chave permanece no servidor e pode ser rotacionada pelo mesmo procedimento.

## Backup e retorno

O timer do systemd roda às 04h35, no horário de Brasília. Ele mantém sete cópias verificadas na Storage Box em `/mnt/storage-box/backups/postiz-confenge`. Cada cópia contém o aplicativo PostgreSQL, os dois bancos do Temporal, um RDB do Redis e os volumes de mídia e configuração. O backup valida os arquivos e publica `SHA256SUMS`. Bancos e volumes são copiados em sequência. Em uma janela com edição intensa, faça um backup adicional depois de encerrar os trabalhos e antes da atualização.

- Estado do timer e última execução: `systemctl list-timers postiz-confenge-backup.timer` e `journalctl -u postiz-confenge-backup.service -n 40`.
- Para ensaiar um retorno, confira `sha256sum --check SHA256SUMS` no diretório da cópia e use volumes separados. Em PostgreSQL, restaure cada dump com `pg_restore --exit-on-error` no banco vazio correspondente. Extraia os arquivos nos volumes vazios; restaure o RDB no Redis com o serviço parado. Traga a pilha de homologação com o identificador de imagem registrado para a cópia. Faça a troca somente após autenticar, ler um projeto e abrir seu arquivo.
- Para reverter só a imagem, use a tag anterior em `.env` após confirmar compatibilidade do schema. Para suspender esta instalação, desative o timer, remova o vhost e o registro DNS próprios e pare a pilha com `docker compose stop`. Os volumes contêm os dados de recuperação.
- Guarde a configuração privada em cofre. Os backups da Storage Box incluem dados editoriais e bancos e excluem arquivos `private/*.env`.
