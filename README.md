# API do Recanto da Dinda

Backend em Node.js/Express para cadastro de tutores e pets, análise administrativa, notificações e comunicação.

## Requisitos

- Node.js 20 ou superior
- MongoDB (a conexão precisa aceitar transações para salvar tutor e pet juntos)
- Conta Cloudinary para armazenar fotos e carteiras de vacinação

## Configuração local

1. Copie `.env.example` para `.env` e preencha as credenciais do ambiente.
2. Instale as dependências com `npm install`.
3. Inicie em desenvolvimento com `npm run dev` ou em produção com `npm start`.
4. Acesse `GET /` para confirmar que a API está respondendo.

Para criar o primeiro usuário administrador, configure `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env` e execute `npm run admin:create`. A senha inicial precisa ter pelo menos 12 caracteres. Remova essas três variáveis depois da criação.

## Variáveis de ambiente

As variáveis obrigatórias para a API operar são `MONGODB_URI`, `JWT_SECRET` e as três credenciais `CLOUDINARY_*`. Use valores fortes e exclusivos em produção. Não envie o arquivo `.env` ao repositório nem compartilhe credenciais em documentação.

`CLIENT_URL` define a origem principal do frontend. `ALLOWED_ORIGINS` aceita origens adicionais separadas por vírgula. `PORT` é opcional e assume `3333`.

Brevo, Web Push e WhatsApp são integrações opcionais; suas variáveis estão listadas no `.env.example`. Sem as credenciais correspondentes, essas integrações não estarão disponíveis.

## Rotas principais

- `GET /` — verificação simples da API.
- `POST /api/pet-registrations` — cadastro público multipart com os campos `payload`, `vaccinationCards` (até 5 arquivos) e `avatar` (opcional).
- `POST /api/admin/auth/login` — login administrativo.
- `GET /api/admin/auth/me` — consulta do usuário autenticado; exige `Authorization: Bearer <token>`.
- `/api/admin/*` — gestão administrativa protegida por autenticação e, em algumas rotas, por perfil.

Uploads aceitam JPG, PNG, WebP e PDF para carteiras de vacinação, com limite de 10 MB por arquivo. A foto do pet aceita JPG, PNG ou WebP, até 10 MB no cadastro público e 5 MB na atualização administrativa.

## Observações de entrega

- O deploy deve usar MongoDB compatível com transações (por exemplo, um replica set).
- Configure no provedor de hospedagem as mesmas variáveis necessárias, sem subir segredos no código.
- O projeto ainda não possui suíte de testes automatizados configurada.


## Recanto da Dinda API 2.0 — novos módulos

### Formulário público do Hotel
`POST /api/hotel/bookings` (`multipart/form-data`)

Envie o campo `payload` como JSON string e até 5 arquivos no campo `vaccinationCards` (JPG, PNG, WebP ou PDF; até 10 MB por arquivo). O payload contém `guardian`, `pet`, `stay`, `health` e `declarations`. O CPF identifica o tutor: se já existir, os dados cadastrais são atualizados; se não existir, o tutor é criado. A solicitação fica com status `pending`. O cadastro do Hotel armazena um snapshot dos dados do pet; o vínculo com um Pet já existente é opcional via `pet.petId`.

### Área do Tutor
- `POST /api/guardian/auth/request-access-code`: solicita código de primeiro acesso por CPF e e-mail; o código é enviado por e-mail via Brevo e expira em 10 minutos.
- `POST /api/guardian/auth/confirm-access`: confirma o código recebido e define a senha (mínimo de 8 caracteres).
- `POST /api/guardian/auth/login`: login por CPF, e-mail e senha.
- `GET /api/guardian/me`: resumo da conta, pets, hospedagens e frequência.
- `GET /api/guardian/me/attendance`: histórico de frequência do tutor.

As rotas privadas exigem `Authorization: Bearer <token>`. O token de tutor é separado do token administrativo.

### Administração — Hotel e frequência
Todas as rotas abaixo exigem autenticação administrativa e perfil `admin` ou `manager`:
- `GET /api/admin/hotel/bookings?status=pending&page=1&limit=10`
- `PATCH /api/admin/hotel/bookings/:id/status` com `{ "status": "approved|rejected|cancelled|completed", "adminNotes": "" }`
- `GET /api/admin/attendance`
- `POST /api/admin/pets/:petId/check-in` com `{ "notes": "" }`
- `PATCH /api/admin/attendance/:id/check-out` com `{ "notes": "" }`

### Fluxo recomendado de primeiro acesso do tutor
O tutor envia primeiro o formulário da Creche ou do Hotel. Depois, solicita um código de primeiro acesso usando o CPF e e-mail cadastrados. O código é enviado via Brevo, expira em 10 minutos e permite definir uma senha. O sistema não envia senhas por e-mail.

### Observações
- A confirmação de hospedagem é manual: enviar o formulário cria uma solicitação pendente, não uma reserva confirmada.
- O formulário do Hotel armazena os dados de saúde e declarações associados àquela solicitação, sem sobrescrever os dados de saúde usados no cadastro da Creche.
- O registro de frequência foi preparado para pets existentes no cadastro principal da Creche. Pets informados somente em uma solicitação de Hotel aparecem no portal como dados da hospedagem, mas não podem receber check-in de frequência da Creche até serem cadastrados como Pet.


### Exemplo de `payload` para o formulário do Hotel

O frontend deve enviar `payload` como string JSON em `multipart/form-data` e anexar a carteira no campo `vaccinationCards` (pode repetir o campo até cinco vezes):

```json
{
  "guardian": {
    "name": "Nome do tutor",
    "cpf": "52998224725",
    "rg": "123456789",
    "address": "Rua Exemplo, 100 - Bairro - Cidade/SP",
    "phone": "11999999999",
    "email": "tutor@email.com"
  },
  "pet": {
    "petId": null,
    "name": "Nome do pet",
    "breed": "Golden Retriever",
    "sex": "female",
    "neutered": true
  },
  "stay": {
    "checkIn": "2026-12-20",
    "checkOut": "2026-12-27"
  },
  "health": {
    "vaccinesUpToDate": true,
    "lastDewormingDate": "2026-10-20",
    "fleaTreatment": "Produto e data do antipulgas",
    "hasAllergies": false,
    "allergyDetails": "",
    "takesMedication": false,
    "medicationDetails": "",
    "veterinarian": {
      "clinic": "Clínica veterinária",
      "name": "Nome do veterinário",
      "phone": "11988887777"
    }
  },
  "declarations": {
    "emergencyAuthorization": true,
    "truthfulInformation": true,
    "adequateHealth": true,
    "disclosedConditions": true,
    "socializationRisks": true,
    "emergencyMeasures": true,
    "veterinaryExpenses": true
  }
}
```

`pet.petId` pode ser `null` para um pet informado pela primeira vez no Hotel. O cadastro do tutor será localizado pelo CPF; os dados do pet ficam registrados como snapshot da solicitação, sem criar um cadastro de Creche automaticamente.
