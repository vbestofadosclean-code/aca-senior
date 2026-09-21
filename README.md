# Cami-Sênior — versão online de produção

Portal full-stack para inscrições Cami-Sênior. As inscrições, mensagens e pagamentos ficam numa base PostgreSQL central; o navegador não é usado como base de dados.

## Funcionalidades
- Inscrição online com limite de 150 vagas.
- Taxa de 4.000 Kz.
- Pagamento exclusivamente presencial.
- Numeração automática `ACA-2026-0001`, etc.
- Consulta pública com exposição limitada de dados.
- Geração de ficha/comprovativo PDF no navegador.
- Área administrativa protegida por sessão no servidor.
- Dois e-mails autorizados + duas palavras-passe, mantidas apenas no ambiente do servidor.
- Base de dados administrativa, mensagens e estado de pagamento.
- Registo de acessos administrativos autorizados e tentativas recusadas.
- Limitação de tentativas de login por IP.
- Headers básicos de segurança, cookie HTTP-only e HTTPS/HSTS em produção.

## Variáveis obrigatórias
- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_EMAIL_ALT`
- `ADMIN_PASSWORD_1`
- `ADMIN_PASSWORD_2`
- `NODE_ENV=production`

Opcional: `DB_SSL_REJECT_UNAUTHORIZED=false` somente se o provedor PostgreSQL não fornecer uma cadeia de certificados verificável.

## Arranque
```bash
npm install
npm start
```

O servidor inicializa as tabelas automaticamente e serve o site em `PORT` (por padrão, 3000).

## Segurança
As palavras-passe não ficam no HTML/JavaScript público. O servidor cria hashes bcrypt em memória durante o arranque, assina a sessão com `JWT_SECRET` e usa cookie `HttpOnly`. Não coloque segredos em `public/`.

Antes de abrir ao público, configure HTTPS no serviço de hospedagem e mantenha a PostgreSQL acessível apenas ao servidor quando o provedor permitir.
