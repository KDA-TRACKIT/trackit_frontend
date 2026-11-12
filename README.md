# Trackit frontend

Trackit 백엔드 API(`/api/v1`)에 연결하기 위한 Next.js App Router 프론트엔드입니다.

## 시작하기

```bash
npm install
cp .env.example .env.local
npm run dev
```

기본 API 주소는 `http://localhost:3000`이며, 필요하면 `NEXT_PUBLIC_API_URL`로 변경합니다. Google 로그인 화면은 `/login`에 있습니다.

Google OAuth를 로컬에서 사용하려면 백엔드 `.env.local`에 프론트 주소를 설정합니다. 프론트가 3001번으로 실행되는 경우를 기준으로 합니다.

```env
FRONTEND_URL=http://localhost:3001
```

Supabase Dashboard의 Google Provider 설정과 Redirect URLs에도 `http://localhost:3001/auth/callback`을 추가해야 합니다. 프론트 `.env.local`에는 백엔드와 동일한 Supabase 프로젝트 값을 입력합니다.
