# 세션 브금 데크 (BGM Session Deck)

TRPG 세션 등을 위한 룸 기반 유튜브 BGM 플레이어입니다.

- 여러 개의 룸(세션)을 만들고 이름을 자유롭게 수정
- GM이 유튜브 링크를 넣으면 재생목록에 추가 (제목 자동 조회)
- 트랙별 설명, 폴더 관리, 드래그 순서 변경
- 재생목록은 GM에게만 보이고, 참가자는 지금 재생 중인 곡만 실시간으로 동기화
- 한 곡 반복 / 전체 반복(연속재생) / 트랙 구간(A-B) 반복
- 재생목록 JSON 내보내기 / 불러오기

## 빠른 시작 (설정 없이 바로 테스트)

```bash
npm install
npm run dev
```

`.env` 파일이 없으면 자동으로 **localStorage 폴백 모드**로 동작합니다. 같은 브라우저에서 탭을 두 개 열어 하나는 GM, 하나는 참가자로 들어가면 로컬에서 바로 동작을 확인할 수 있어요. 단, 이 모드는 **다른 기기·다른 브라우저와는 동기화되지 않습니다.**

## 실제로 여러 사람과 쓰기 (Firebase 연동)

여러 플레이어가 각자의 기기에서 접속해 실시간으로 동기화되게 하려면 무료 Firebase Realtime Database를 연결하세요.

1. [Firebase 콘솔](https://console.firebase.google.com)에서 새 프로젝트를 만듭니다.
2. 왼쪽 메뉴 **Build > Realtime Database > 데이터베이스 만들기**를 클릭하고, 테스트 모드로 시작합니다.
3. 데이터베이스가 생성되면 **규칙(Rules)** 탭에서 아래처럼 설정하고 게시합니다. (아래 "보안 안내" 참고)
   ```json
   {
     "rules": {
       "kv": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```
4. **프로젝트 설정(⚙️) > 일반** 탭에서 "내 앱 추가 > 웹 앱"으로 앱을 등록하고, 표시되는 설정 값을 복사합니다.
5. 저장소 루트에 `.env` 파일을 만들고 값을 채웁니다.
   ```bash
   cp .env.example .env
   ```
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_DATABASE_URL=...
   VITE_FIREBASE_PROJECT_ID=...
   ```
6. 개발 서버를 재시작합니다.
   ```bash
   npm run dev
   ```

이제 룸/재생목록/재생 상태가 Firebase에 저장되어, 서로 다른 기기에서도 실시간(약 1~2초 간격 폴링)으로 동기화됩니다.

## 배포하기

### GitHub Pages (포함된 워크플로 사용)

1. 이 저장소를 GitHub에 올립니다.
2. Firebase를 쓰려면 **Settings > Secrets and variables > Actions**에서 `VITE_FIREBASE_API_KEY` 등 4개 값을 Repository secret으로 등록합니다. (안 해도 빌드는 되고, 로컬 폴백 모드로 배포됩니다.)
3. **Settings > Pages > Build and deployment > Source**를 "GitHub Actions"로 설정합니다.
4. `main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 자동으로 빌드/배포합니다.

### Vercel / Netlify

레포지토리를 그대로 import하면 됩니다. 빌드 명령은 `npm run build`, 출력 폴더는 `dist`입니다. Firebase를 쓰려면 프로젝트의 환경변수 설정 화면에 `.env.example`과 동일한 키를 등록하세요.

## 사용 방법

1. 홈 화면에서 "새 세션 만들기"로 룸을 생성하면 **GM 키**가 발급됩니다. 이 키는 다시 보여줄 방법이 없으니 꼭 복사해두세요.
2. GM 키로 입장하면 재생목록을 관리하는 GM 콘솔이 보입니다. 키 없이 입장하면 참가자 화면(재생목록 비공개)이 보입니다.
3. GM이 유튜브 링크를 붙여넣으면 재생목록에 추가됩니다. 트랙별로 설명, 폴더, 구간 반복(A-B)을 설정할 수 있어요.
4. GM이 재생/정지/탐색/트랙 전환을 하면 참가자 화면이 따라갑니다. 참가자는 브라우저 자동재생 정책 때문에 처음 한 번 "세션 참가하기" 버튼을 눌러야 소리가 나옵니다.

## 보안 안내

이 프로젝트는 소규모 개인/친구 세션용으로 만들어진 가벼운 도구입니다.

- 위 Firebase 규칙 예시는 **읽기/쓰기를 모두 공개**로 열어둔 상태입니다. 룸 ID와 GM 키가 추측하기 어려운 무작위 문자열이라는 점에 의존하는 수준의 보안이며, 민감한 정보를 다루는 용도로는 적합하지 않습니다.
- 더 강한 보안이 필요하다면 Firebase Authentication이나 App Check를 추가하거나, 규칙을 룸 단위로 세분화하는 것을 권장합니다.
- GM 키는 평문으로 저장됩니다. 분실 시 복구할 방법이 없으니 생성 직후 반드시 복사해두세요.

## 기술 스택

- React 18 + Vite
- YouTube IFrame Player API
- Firebase Realtime Database (선택, 없으면 localStorage 폴백)

## 라이선스

MIT — [LICENSE](./LICENSE) 참고
